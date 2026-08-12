import 'server-only';

import {
  ExtractionDraftSchema,
  type ExtractionDraft,
} from '@/domain/opportunity/schema';
import { normalizeOpportunity, type RawExtraction } from './contracts';
import {
  prepareExtractionSources,
  urlsFromPreparedSources,
  type PreparedSource,
} from './input';
import { enrichFromUrls } from './enrichment';
import { extractWithProvider } from './provider';

function todayInAppTimezone(): string {
  const timezone = process.env.APP_TIMEZONE || 'Asia/Dhaka';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function extractionPrompt(stage: 'initial' | 'enriched'): string {
  return `Extract one opportunity from all supplied sources.

Today is ${todayInAppTimezone()}.
- Use null or [] when a fact is not supported. Never infer names or links.
- Resolve relative dates to YYYY-MM-DD; otherwise deadline must be null.
- category must be job, internship, contest, or higher-study.
- organizationName means company for jobs/internships, institution/university for higher study, and organizer for contests.
- Put category-specific facts into attributes; keep irrelevant attributes null or [].
- details is a concise factual summary, not a dump of the source.
- Evidence field paths use names such as organizationName or attributes.professorNames.
- Cite exact source IDs. Keep excerpts short.
- List useful HTTP(S) links present in sources under discoveredSourceUrls.
- Mark relevant missing fields in unresolvedFields.
${stage === 'enriched' ? '- Prefer facts from the originally submitted sources when sources conflict; add a warning for unresolved conflicts.' : ''}`;
}

function normalizeUrls(values: string[]): string[] {
  const urls: string[] = [];
  for (const value of values) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
      url.hash = '';
      urls.push(url.toString());
    } catch {
      // Invalid model-produced URLs are discarded.
    }
  }
  return Array.from(new Set(urls)).slice(0, 20);
}

function relevantUnresolvedFields(raw: RawExtraction): string[] {
  const opportunity = normalizeOpportunity(raw);
  const fields: string[] = [];
  const add = (field: string, value: unknown) => {
    if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) fields.push(field);
  };

  add('deadline', opportunity.deadline);
  add('organizationName', opportunity.organizationName);
  add('location', opportunity.location);
  add('applicationUrl', opportunity.applicationUrl);
  add('contactEmail', opportunity.contactEmail);
  add('eligibility', opportunity.eligibility);
  add('requirements', opportunity.requirements);

  if (opportunity.category === 'higher-study') {
    add('attributes.programName', opportunity.attributes.programName);
    add('attributes.degreeLevel', opportunity.attributes.degreeLevel);
    add('attributes.department', opportunity.attributes.department);
    add('attributes.professorNames', opportunity.attributes.professorNames);
    add('attributes.labName', opportunity.attributes.labName);
    add('attributes.researchAreas', opportunity.attributes.researchAreas);
    add('attributes.funding', opportunity.attributes.funding);
    add('attributes.startTerm', opportunity.attributes.startTerm);
  } else if (opportunity.category === 'contest') {
    add('attributes.theme', opportunity.attributes.theme);
    add('attributes.prize', opportunity.attributes.prize);
    add('attributes.eventDate', opportunity.attributes.eventDate);
  } else {
    add('attributes.roleTitle', opportunity.attributes.roleTitle);
    add('attributes.employmentType', opportunity.attributes.employmentType);
    add('attributes.workplaceMode', opportunity.attributes.workplaceMode);
    add('attributes.compensation', opportunity.attributes.compensation);
    add('attributes.skills', opportunity.attributes.skills);
    if (opportunity.category === 'internship') add('attributes.duration', opportunity.attributes.duration);
  }
  return fields;
}

function toDraft(raw: RawExtraction, sources: PreparedSource[], extraWarnings: string[]): ExtractionDraft {
  const sourceIds = new Set(sources.map((source) => source.id));
  const opportunity = normalizeOpportunity(raw);
  const computedUnresolved = relevantUnresolvedFields(raw);

  return ExtractionDraftSchema.parse({
    opportunity,
    evidence: raw.evidence.filter((entry) => sourceIds.has(entry.sourceId)),
    unresolvedFields: Array.from(new Set([...raw.unresolvedFields, ...computedUnresolved])),
    warnings: Array.from(new Set([...raw.warnings, ...extraWarnings])),
    discoveredSourceUrls: normalizeUrls([
      ...raw.discoveredSourceUrls,
      ...sources.flatMap((source) => source.sourceUrl ? [source.sourceUrl] : []),
    ]),
  });
}

export async function extractOpportunityDetails(input: unknown): Promise<ExtractionDraft> {
  const { preparedSources } = await prepareExtractionSources(input);
  const initial = await extractWithProvider(preparedSources, extractionPrompt('initial'));
  const seedUrls = normalizeUrls([
    ...urlsFromPreparedSources(preparedSources),
    ...initial.discoveredSourceUrls,
    ...(initial.opportunity.applicationUrl ? [initial.opportunity.applicationUrl] : []),
  ]);

  if (relevantUnresolvedFields(initial).length === 0 || seedUrls.length === 0) {
    return toDraft(initial, preparedSources, []);
  }

  const enrichment = await enrichFromUrls(seedUrls);
  if (enrichment.sources.length === 0) {
    return toDraft(initial, preparedSources, enrichment.warnings);
  }

  const allSources = [...preparedSources, ...enrichment.sources];
  try {
    const enriched = await extractWithProvider(allSources, extractionPrompt('enriched'));
    return toDraft(enriched, allSources, enrichment.warnings);
  } catch (error) {
    return toDraft(initial, preparedSources, [
      ...enrichment.warnings,
      `Enrichment was fetched but could not be merged: ${error instanceof Error ? error.message : 'Unknown error'}`,
    ]);
  }
}
