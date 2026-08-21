import 'server-only';

import type {
  DuplicateMatch,
  ExtractionSource,
  OpportunityInput,
} from '@/domain/opportunity/schema';
import { OpportunityInputSchema } from '@/domain/opportunity/schema';
import { classifyDuplicateCandidates, type DuplicateClassificationCandidate } from '@/ai/duplicate-classifier';
import { query } from './db';
import { canonicalizeUrl, extractUrls, normalizeComparable } from './duplicate-normalization';
import { sourceContentSha256 } from './source-payload';

/** Duplicate detection runs per opportunity; the confirmation token covers the whole batch. */
type SingleDuplicateInput = {
  opportunity: OpportunityInput;
  sources: ExtractionSource[];
  discoveredSourceUrls: string[];
};

export {
  createDuplicateConfirmationToken,
  verifyDuplicateConfirmationToken,
} from './duplicate-confirmation';
import { formatDeadline } from './utils';

const MAX_CLASSIFICATION_CANDIDATES = 20;
type CandidateRow = {
  id: number;
  name: string;
  details: string;
  deadline: Date | string | null;
  category: OpportunityInput['category'];
  organization_name: string | null;
  organization_type: string | null;
  location: string | null;
  application_url: string | null;
  contact_email: string | null;
  eligibility: string | null;
  requirements: unknown;
  attributes: unknown;
  name_similarity: number;
  organization_similarity: number;
  details_similarity: number;
  sources: Array<{ sourceUrl: string | null; canonicalUrl: string | null; contentSha256: string | null }>;
};

type RankedCandidate = DuplicateClassificationCandidate & {
  exactContent: boolean;
  score: number;
  match: Omit<DuplicateMatch, 'confidence' | 'reason'>;
};

function parseJson(value: unknown, fallback: unknown) {
  if (typeof value !== 'string') return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function currentSignals(input: SingleDuplicateInput) {
  const sourceHashes = input.sources.map(sourceContentSha256);
  const sourceText = input.sources
    .filter((source): source is Extract<ExtractionSource, { kind: 'text' }> => source.kind === 'text')
    .map((source) => source.text)
    .join('\n\n');
  const urls = Array.from(new Set([
    ...input.discoveredSourceUrls,
    ...(input.opportunity.applicationUrl ? [input.opportunity.applicationUrl] : []),
    ...input.sources.flatMap((source) => source.kind === 'text' ? extractUrls(source.text) : []),
  ].map(canonicalizeUrl).filter((url): url is string => Boolean(url))));
  let professors: string[] = [];
  let specificAttribute: string | null = null;
  if (input.opportunity.category === 'higher-study') {
    professors = input.opportunity.attributes.professorNames.map(normalizeComparable).filter(Boolean);
    specificAttribute = input.opportunity.attributes.labName || input.opportunity.attributes.programName;
  } else if (input.opportunity.category === 'contest') {
    specificAttribute = input.opportunity.attributes.theme;
  } else {
    specificAttribute = input.opportunity.attributes.roleTitle;
  }
  return {
    sourceHashes,
    sourceText,
    urls,
    professors,
    specificAttribute,
  };
}

async function candidateRows(input: SingleDuplicateInput, signals: ReturnType<typeof currentSignals>): Promise<CandidateRow[]> {
  const result = await query<CandidateRow>(
    `SELECT
      o.id, o.name, o.details, o.deadline, o.category, o.organization_name,
      o.organization_type, o.location, o.application_url, o.contact_email,
      o.eligibility, o.requirements, o.attributes,
      similarity(lower(o.name), lower($4)) AS name_similarity,
      similarity(lower(coalesce(o.organization_name, '')), lower($5)) AS organization_similarity,
      similarity(lower(o.details), lower($6)) AS details_similarity,
      coalesce(jsonb_agg(jsonb_build_object(
        'sourceUrl', s.source_url,
        'canonicalUrl', s.canonical_url,
        'contentSha256', s.content_sha256
      )) FILTER (WHERE s.id IS NOT NULL), '[]'::jsonb) AS sources
    FROM opportunities o
    LEFT JOIN opportunity_sources s ON s.opportunity_id = o.id
    WHERE
      EXISTS (
        SELECT 1 FROM opportunity_sources exact_source
        WHERE exact_source.opportunity_id = o.id
          AND (
            exact_source.content_sha256 = ANY($1::text[])
            OR exact_source.canonical_url = ANY($2::text[])
          )
      )
      OR (
        o.category = $3
        AND (
          similarity(lower(o.name), lower($4)) >= 0.18
          OR ($5 <> '' AND similarity(lower(coalesce(o.organization_name, '')), lower($5)) >= 0.40)
          OR similarity(lower(o.details), lower($6)) >= 0.12
          OR ($7 <> '' AND lower(coalesce(o.contact_email, '')) = lower($7))
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(coalesce(o.attributes->'professorNames', '[]'::jsonb)) professor
            WHERE regexp_replace(lower(professor), '^(dr|prof|professor)\\.?\\s+', '') = ANY($8::text[])
          )
          OR ($9 <> '' AND lower(coalesce(o.attributes->>'labName', o.attributes->>'programName', o.attributes->>'roleTitle', '')) = lower($9))
        )
      )
    GROUP BY o.id
    ORDER BY
      max(CASE WHEN s.content_sha256 = ANY($1::text[]) THEN 1 ELSE 0 END) DESC,
      greatest(
        similarity(lower(o.name), lower($4)),
        similarity(lower(coalesce(o.organization_name, '')), lower($5)),
        similarity(lower(o.details), lower($6))
      ) DESC,
      o.created_at DESC
    LIMIT 50`,
    [
      signals.sourceHashes,
      signals.urls,
      input.opportunity.category,
      input.opportunity.name,
      input.opportunity.organizationName || '',
      input.opportunity.details,
      input.opportunity.contactEmail || '',
      signals.professors,
      signals.specificAttribute || '',
    ],
  );
  return result.rows;
}

function rowOpportunity(row: CandidateRow): OpportunityInput {
  return OpportunityInputSchema.parse({
    name: row.name,
    details: row.details || '',
    deadline: formatDeadline(row.deadline),
    category: row.category,
    organizationName: row.organization_name,
    organizationType: row.organization_type,
    location: row.location,
    applicationUrl: row.application_url,
    contactEmail: row.contact_email,
    eligibility: row.eligibility,
    requirements: parseJson(row.requirements, []),
    attributes: parseJson(row.attributes, {}),
  });
}

function rankCandidates(
  input: SingleDuplicateInput,
  signals: ReturnType<typeof currentSignals>,
  rows: CandidateRow[],
): RankedCandidate[] {
  const currentHashes = new Set(signals.sourceHashes);
  const currentUrls = new Set(signals.urls);
  const currentProfessors = new Set(signals.professors);

  return rows.map((row) => {
    const opportunity = rowOpportunity(row);
    const candidateHashes = row.sources.map((source) => source.contentSha256).filter(Boolean) as string[];
    const candidateUrls = Array.from(new Set([
      ...row.sources
        .map((source) => source.canonicalUrl || (source.sourceUrl ? canonicalizeUrl(source.sourceUrl) : null))
        .filter((url): url is string => Boolean(url)),
      ...(opportunity.applicationUrl
        ? [canonicalizeUrl(opportunity.applicationUrl)].filter((url): url is string => Boolean(url))
        : []),
    ]));
    const exactContent = candidateHashes.some((hash) => currentHashes.has(hash));
    const sharedUrlCount = candidateUrls.filter((url) => currentUrls.has(url)).length;
    const candidateProfessors = opportunity.category === 'higher-study'
      ? opportunity.attributes.professorNames.map(normalizeComparable)
      : [];
    const professorOverlap = candidateProfessors.some((name) => currentProfessors.has(name));
    const signalsList: string[] = [];
    let score = 0;
    if (exactContent) { score += 100; signalsList.push('identical submitted source'); }
    if (sharedUrlCount) { score += Math.min(60, 35 + sharedUrlCount * 10); signalsList.push('shared reference link'); }
    if (professorOverlap) { score += 35; signalsList.push('same professor'); }
    if (input.opportunity.contactEmail && opportunity.contactEmail?.toLowerCase() === input.opportunity.contactEmail.toLowerCase()) {
      score += 35; signalsList.push('same contact email');
    }
    if (Number(row.organization_similarity) >= 0.4) {
      score += Number(row.organization_similarity) >= 0.7 ? 25 : 15;
      signalsList.push('similar organization');
    }
    if (Number(row.name_similarity) >= 0.18) {
      score += Math.round(Number(row.name_similarity) * 30);
      signalsList.push('similar title');
    }
    if (Number(row.details_similarity) >= 0.12) {
      score += Math.round(Number(row.details_similarity) * 15);
      signalsList.push('similar summary');
    }
    if (signals.specificAttribute && normalizeComparable(JSON.stringify(opportunity.attributes)).includes(normalizeComparable(signals.specificAttribute))) {
      score += 20; signalsList.push('same role, program, or lab');
    }
    if (opportunity.category === input.opportunity.category) score += 5;

    return {
      id: String(row.id),
      opportunity,
      canonicalUrls: candidateUrls,
      deterministicSignals: signalsList,
      exactContent,
      score,
      match: {
        id: String(row.id),
        name: opportunity.name,
        category: opportunity.category,
        organizationName: opportunity.organizationName,
        deadline: opportunity.deadline,
      },
    };
  }).filter((candidate) => candidate.exactContent || candidate.score >= 15)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_CLASSIFICATION_CANDIDATES);
}

export async function findDuplicateMatches(input: SingleDuplicateInput): Promise<DuplicateMatch[]> {
  const signals = currentSignals(input);
  const ranked = rankCandidates(input, signals, await candidateRows(input, signals));
  if (!ranked.length) return [];

  const exactMatches: DuplicateMatch[] = ranked.filter((candidate) => candidate.exactContent).map((candidate) => ({
    ...candidate.match,
    confidence: 'high',
    reason: 'The submitted source is byte-for-byte identical to this saved opportunity.',
  }));
  const ambiguous = ranked.filter((candidate) => !candidate.exactContent);
  if (!ambiguous.length) return exactMatches;

  try {
    const decisions = await classifyDuplicateCandidates(
      input.opportunity,
      signals.sourceText,
      signals.urls,
      ambiguous,
    );
    const byId = new Map(ambiguous.map((candidate) => [candidate.id, candidate]));
    const classified = decisions.flatMap((decision): DuplicateMatch[] => {
      if (!decision.sameAnnouncement) return [];
      const candidate = byId.get(decision.opportunityId);
      return candidate ? [{ ...candidate.match, confidence: decision.confidence, reason: decision.reason }] : [];
    });
    return [...exactMatches, ...classified];
  } catch (error) {
    console.error('Duplicate LLM classification failed:', error);
    return [
      ...exactMatches,
      ...ambiguous.map((candidate): DuplicateMatch => ({
        ...candidate.match,
        confidence: 'low',
        reason: `Possible match based on ${candidate.deterministicSignals.join(', ')}. The semantic duplicate check was unavailable.`,
      })),
    ];
  }
}
