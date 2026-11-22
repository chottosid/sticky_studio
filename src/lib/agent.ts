import 'server-only';

import { format, parseISO } from 'date-fns';
import { z } from 'zod';
import { OpportunityInputSchema } from '@/domain/opportunity/schema';
import type { CandidateId } from '@/domain/opportunity/assessment';
import { ResearchOutputSchema, type ResearchProposal, type WeeklyTask } from '@/domain/opportunity/agent';
import { draftOutreach, searchOpportunities, type AgentCitation } from '@/ai/agent';
import { appToday, daysUntil } from './deadlines';
import { applicantOpportunities, groupApplicantWork } from './applicant-workflow';
import { query } from './db';
import { getOpportunityById } from './data';
import { canonicalizeUrl } from './duplicate-normalization';
import { getCandidateProfiles } from './profiles';
import { sliceText } from './utils';

export async function weeklyTasks(candidate: CandidateId): Promise<WeeklyTask[]> {
  const today = appToday();
  const groups = groupApplicantWork(await applicantOpportunities({ candidate }));
  return [
    ...groups['follow-ups'], ...groups.due,
    ...groups.verification.filter((item) => item.deadline ? daysUntil(item.deadline, today) <= 7 : item.summary.fit === 'strong' || item.summary.progress.stage === 'applying'),
    ...groups.prepare,
  ].slice(0, 20).map((item) => ({
    id: item.id, candidate, name: item.name, action: item.summary.action,
    deadline: item.summary.action.kind === 'follow-up' ? item.summary.progress.followUpOn : item.deadline,
  }));
}

function sourceDeadline(value: string | null, excerpt: string): string | null {
  if (!value) return null;
  const date = parseISO(value);
  const forms = [value, ...['MMMM d, yyyy', 'MMM d, yyyy', 'd MMMM yyyy', 'd MMM yyyy'].map((pattern) => format(date, pattern))];
  for (const form of forms) {
    const index = excerpt.indexOf(form.toLowerCase());
    if (index < 0) continue;
    const context = excerpt.slice(Math.max(0, index - 80), index + form.length + 80);
    if (/\b(deadline|closing date|applications? (?:close|due)|apply (?:by|before))\b/.test(context)) return value;
  }
  return null;
}

function citedProposals(output: z.infer<typeof ResearchOutputSchema>, citations: AgentCitation[], today: string) {
  const sources = new Map<string, AgentCitation>();
  for (const citation of citations) {
    const key = canonicalizeUrl(citation.url);
    if (key && !sources.has(key)) sources.set(key, citation);
  }

  return output.opportunities.flatMap((item) => {
    const key = canonicalizeUrl(item.sourceUrl);
    const source = key && sources.get(key);
    if (!key || !source) return [];
    const sourceUrl = new URL(source.url);
    if (sourceUrl.username || sourceUrl.password || source.url.length > 2_000) return [];

    const excerpt = (source.content || '').toLowerCase().replace(/\s+/g, ' ');
    const deadline = sourceDeadline(item.deadline, excerpt);
    const emails: string[] = excerpt.match(/[\w.!#$%&'*+\/=?^`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? [];
    const contactEmail = item.contactEmail && emails.includes(item.contactEmail.toLowerCase()) ? item.contactEmail : null;
    if (deadline && deadline < today) return [];

    const opportunity = OpportunityInputSchema.parse({
      name: item.name, category: item.category, details: item.summary, organizationName: item.organization,
      applicationUrl: source.url, deadline, contactEmail,
    });
    const proposal: ResearchProposal = {
      sourceUrl: source.url,
      existing: null,
      draft: {
        opportunities: [{ opportunity, evidence: [], unresolvedFields: [] }],
        warnings: [
          ...(!deadline ? [item.deadline ? `Reported deadline ${item.deadline} needs verification.` : 'Check the source for an application deadline.'] : []),
          ...(!contactEmail ? [item.contactEmail ? `Reported contact ${item.contactEmail} needs verification.` : 'Check the source for a contact address.'] : []),
        ],
        discoveredSourceUrls: [source.url],
      },
    };
    return [{ key, proposal }];
  });
}

export async function researchOpportunities(search: string, candidate: CandidateId): Promise<ResearchProposal[]> {
  const today = appToday();
  const { rows: profiles } = await query<{ profile_text: string }>('SELECT profile_text FROM candidate_profiles WHERE id = $1', [candidate]);
  const publicProfile = sliceText(profiles[0]?.profile_text || '', 3_500);
  const { output, citations } = await searchOpportunities(search, today, publicProfile);
  const proposals = citedProposals(output, citations, today);
  if (!proposals.length) return [];

  const { rows } = await query<{ canonical_url: string; id: number; name: string }>(`
    SELECT DISTINCT ON (s.canonical_url) s.canonical_url, o.id, o.name
    FROM opportunity_sources s JOIN opportunities o ON o.id = s.opportunity_id
    WHERE s.canonical_url = ANY($1::text[])
    ORDER BY s.canonical_url, o.id
  `, [proposals.map(({ key }) => key)]);
  const existing = new Map(rows.map((row) => [row.canonical_url, { id: String(row.id), name: row.name }]));
  return proposals.map(({ key, proposal }) => ({ ...proposal, existing: existing.get(key) ?? null }));
}

export async function outreachDraft(candidate: CandidateId, id: string, instructions?: string, previousDraft?: { subject: string; body: string }) {
  const [opportunity, profiles] = await Promise.all([getOpportunityById(id, { includeLegacyDocument: false }), getCandidateProfiles()]);
  const profile = profiles.find((item) => item.id === candidate);
  if (!opportunity || !profile) return null;

  const draft = await draftOutreach({
    instructions, previousDraft,
    applicant: { name: profile.name, portfolio: profile.website, evidence: sliceText(profile.text, 12_000), notes: sliceText(profile.additionalContext, 3_000) },
    opportunity: { name: opportunity.name, organization: opportunity.organizationName, details: sliceText(opportunity.details, 5_000),
      advisors: opportunity.category === 'higher-study' ? opportunity.attributes.professorNames : [], source: opportunity.applicationUrl },
  });
  return { ...draft, contact: opportunity.contactEmail };
}
