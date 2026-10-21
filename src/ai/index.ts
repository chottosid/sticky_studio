import 'server-only';

import {
  ExtractionDraftSchema,
  type ExtractionDraft,
} from '@/domain/opportunity/schema';
import {
  clampModelValue,
  mergeEnrichedOpportunities,
  normalizeOpportunity,
  type RawExtraction,
  type RawOpportunity,
} from './contracts';
import {
  prepareExtractionSources,
  urlsFromPreparedSources,
  type PreparedSource,
} from './input';
import { enrichFromUrls } from './enrichment';
import { extractWithProvider } from './provider';
import { extractionInstructions } from './prompt';
import { dateInTimezone } from '@/lib/utils';

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

function relevantUnresolvedFields(raw: RawOpportunity): string[] {
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
  // Clamp before the strict draft parse: model output that exceeds a field cap
  // (e.g. a long evidence excerpt) is truncated, never a failed extraction.
  const clamped = clampModelValue(raw) as RawExtraction;

  return ExtractionDraftSchema.parse(clampModelValue({
    opportunities: clamped.opportunities.map((item) => ({
      opportunity: normalizeOpportunity(item),
      evidence: item.evidence.filter((entry) => sourceIds.has(entry.sourceId) && entry.field.trim()),
      unresolvedFields: Array.from(new Set([...item.unresolvedFields, ...relevantUnresolvedFields(item)]))
        .filter((field) => field.trim()),
    })),
    warnings: Array.from(new Set([...clamped.warnings, ...extraWarnings])).filter((warning) => warning.trim()),
    discoveredSourceUrls: normalizeUrls([
      ...clamped.discoveredSourceUrls,
      ...sources.flatMap((source) => source.sourceUrl ? [source.sourceUrl] : []),
    ]),
  }));
}

export async function extractOpportunityDetails(input: unknown): Promise<ExtractionDraft> {
  const today = dateInTimezone(new Date(), process.env.APP_TIMEZONE || 'Asia/Dhaka');
  const { preparedSources } = await prepareExtractionSources(input);
  const initial = await extractWithProvider(preparedSources, extractionInstructions('initial', today));
  const seedUrls = normalizeUrls([
    ...urlsFromPreparedSources(preparedSources),
    ...initial.discoveredSourceUrls,
    ...initial.opportunities.flatMap((item) => item.applicationUrl ? [item.applicationUrl] : []),
  ]);

  if (initial.opportunities.every((item) => relevantUnresolvedFields(item).length === 0) || seedUrls.length === 0) {
    return toDraft(initial, preparedSources, []);
  }

  const enrichment = await enrichFromUrls(seedUrls);
  if (enrichment.sources.length === 0) {
    return toDraft(initial, preparedSources, enrichment.warnings);
  }

  const allSources = [...preparedSources, ...enrichment.sources];
  try {
    const enriched = await extractWithProvider(allSources, extractionInstructions('enriched', today));
    // Enrichment completes the submitted openings; it must never add new ones
    // (e.g. admissions or other roles found on a linked careers page).
    const { opportunities, droppedNewOpenings } = mergeEnrichedOpportunities(
      initial.opportunities,
      enriched.opportunities,
    );
    return toDraft({ ...enriched, opportunities }, allSources, [
      ...enrichment.warnings,
      ...(droppedNewOpenings > 0
        ? [`${droppedNewOpenings} opening(s) found only on fetched pages were ignored.`]
        : []),
    ]);
  } catch (error) {
    return toDraft(initial, preparedSources, [
      ...enrichment.warnings,
      `Enrichment was fetched but could not be merged: ${error instanceof Error ? error.message : 'Unknown error'}`,
    ]);
  }
}
