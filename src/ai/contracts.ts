import { z } from 'zod';
import {
  ContestAttributesSchema,
  EmploymentAttributesSchema,
  HigherStudyAttributesSchema,
  OpportunityDraftValueSchema,
  type OpportunityCategory,
  type OpportunityDraftValue,
} from '@/domain/opportunity/schema';
import { sliceText } from '@/lib/utils';

const nullableString = z.string().nullable();

const RawOpportunitySchema = z.object({
  name: nullableString,
  details: nullableString,
  deadline: nullableString,
  category: z.enum(['job', 'internship', 'contest', 'higher-study']),
  organizationName: nullableString,
  organizationType: nullableString,
  location: nullableString,
  applicationUrl: nullableString,
  contactEmail: nullableString,
  eligibility: nullableString,
  requirements: z.array(z.string()),
  attributes: z.object({
    roleTitle: nullableString,
    employmentType: nullableString,
    workplaceMode: nullableString,
    compensation: nullableString,
    skills: z.array(z.string()),
    duration: nullableString,
    programName: nullableString,
    degreeLevel: nullableString,
    department: nullableString,
    professorNames: z.array(z.string()),
    labName: nullableString,
    researchAreas: z.array(z.string()),
    funding: nullableString,
    startTerm: nullableString,
    theme: nullableString,
    prize: nullableString,
    eventDate: nullableString,
  }),
  evidence: z.array(z.object({
    field: z.string(),
    sourceId: z.string(),
    excerpt: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
  })),
  unresolvedFields: z.array(z.string()),
});

export const RawExtractionSchema = z.object({
  opportunities: z.array(RawOpportunitySchema).max(10),
  discoveredSourceUrls: z.array(z.string()),
  warnings: z.array(z.string()),
});

const nullableStringJson = { type: ['string', 'null'] } as const;
const stringArrayJson = { type: 'array', items: { type: 'string' } } as const;

const evidenceJsonSchema = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['field', 'sourceId', 'excerpt', 'confidence'],
    properties: {
      field: { type: 'string' },
      sourceId: { type: 'string' },
      excerpt: { type: 'string' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
  },
} as const;

export const rawExtractionJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['opportunities', 'discoveredSourceUrls', 'warnings'],
  properties: {
    // ponytail: no minItems/maxItems — Gemini's responseJsonSchema rejects the full
    // schema with 400 INVALID_ARGUMENT when they're present; RawExtractionSchema
    // enforces the 0-10 bound at parse time instead.
    opportunities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'name', 'details', 'deadline', 'category', 'organizationName', 'organizationType',
          'location', 'applicationUrl', 'contactEmail', 'eligibility', 'requirements', 'attributes',
          'evidence', 'unresolvedFields',
        ],
        properties: {
          name: nullableStringJson,
          details: nullableStringJson,
          deadline: nullableStringJson,
          category: { type: 'string', enum: ['job', 'internship', 'contest', 'higher-study'] },
          organizationName: nullableStringJson,
          organizationType: nullableStringJson,
          location: nullableStringJson,
          applicationUrl: nullableStringJson,
          contactEmail: nullableStringJson,
          eligibility: nullableStringJson,
          requirements: stringArrayJson,
          attributes: {
            type: 'object',
            additionalProperties: false,
            required: [
              'roleTitle', 'employmentType', 'workplaceMode', 'compensation', 'skills', 'duration',
              'programName', 'degreeLevel', 'department', 'professorNames', 'labName',
              'researchAreas', 'funding', 'startTerm', 'theme', 'prize', 'eventDate',
            ],
            properties: {
              roleTitle: nullableStringJson,
              employmentType: nullableStringJson,
              workplaceMode: nullableStringJson,
              compensation: nullableStringJson,
              skills: stringArrayJson,
              duration: nullableStringJson,
              programName: nullableStringJson,
              degreeLevel: nullableStringJson,
              department: nullableStringJson,
              professorNames: stringArrayJson,
              labName: nullableStringJson,
              researchAreas: stringArrayJson,
              funding: nullableStringJson,
              startTerm: nullableStringJson,
              theme: nullableStringJson,
              prize: nullableStringJson,
              eventDate: nullableStringJson,
            },
          },
          evidence: evidenceJsonSchema,
          unresolvedFields: stringArrayJson,
        },
      },
    },
    discoveredSourceUrls: stringArrayJson,
    warnings: stringArrayJson,
  },
} as const;

function validDateOrNull(value: string | null): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function validUrlOrNull(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString().length <= 2_000 ? url.toString() : null;
  } catch {
    return null;
  }
}

function validEmailOrNull(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length > 320) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

// Model output is clamped to the draft schema's caps instead of being rejected:
// one over-long excerpt or warning must never throw away a whole extraction.
// Caps mirror src/domain/opportunity/schema.ts — keep them in sync.
const STRING_CAPS: Record<string, number> = {
  name: 500, details: 20_000, organizationName: 500, organizationType: 200, location: 500,
  eligibility: 5_000, contactEmail: 320, applicationUrl: 2_000,
  roleTitle: 500, employmentType: 200, workplaceMode: 200, compensation: 1_000, duration: 500,
  programName: 500, degreeLevel: 200, department: 500, labName: 500, funding: 1_000, startTerm: 200,
  theme: 1_000, prize: 1_000, eventDate: 100,
  field: 200, sourceId: 200, excerpt: 500,
};
const ITEM_CAPS: Record<string, number> = {
  requirements: 500, skills: 500, professorNames: 500, researchAreas: 500,
  warnings: 1_000, unresolvedFields: 200,
};
const LENGTH_CAPS: Record<string, number> = {
  opportunities: 10, evidence: 100, unresolvedFields: 100, requirements: 50, skills: 50,
  professorNames: 50, researchAreas: 50, warnings: 50, discoveredSourceUrls: 20,
};

export function clampModelValue(value: unknown, key = ''): unknown {
  if (typeof value === 'string') return sliceText(value, STRING_CAPS[key] ?? 2_000);
  if (Array.isArray(value)) {
    const itemCap = ITEM_CAPS[key] ?? 2_000;
    return value
      .slice(0, LENGTH_CAPS[key] ?? 100)
      .filter((item) => typeof item !== 'string' || item.trim().length > 0)
      .map((item) => (item && typeof item === 'object'
        ? clampModelValue(item)
        : typeof item === 'string' ? sliceText(item, itemCap) : item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clampModelValue(v, k)]));
  }
  return value;
}

function normalizeBase(opportunity: z.infer<typeof RawOpportunitySchema>) {
  return {
    name: opportunity.name?.trim() || '',
    details: opportunity.details?.trim() || '',
    deadline: validDateOrNull(opportunity.deadline),
    organizationName: opportunity.organizationName,
    organizationType: opportunity.organizationType,
    location: opportunity.location,
    applicationUrl: validUrlOrNull(opportunity.applicationUrl),
    contactEmail: validEmailOrNull(opportunity.contactEmail),
    eligibility: opportunity.eligibility,
    requirements: opportunity.requirements,
  };
}

const TITLE_STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'in', 'at', 'for', 'and', 'to', 'with', 'new']);

function titleTokens(value: string | null): Set<string> {
  if (!value) return new Set();
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !TITLE_STOP_WORDS.has(word)));
}

/**
 * Enrichment pages exist to complete details of the openings the user submitted;
 * they must never add openings. Keeps enriched entries that match a submitted
 * opening, recovers submitted openings the enriched pass dropped, and reports
 * how many fetched-page-only openings were ignored.
 */
// ponytail: token-overlap heuristic — an opening with no title token shared with
// any submitted opening is treated as new and dropped; the review UI catches
// rare wrong calls. Swap for a similarity threshold if misses ever matter.
export function mergeEnrichedOpportunities(
  initial: RawOpportunity[],
  enriched: RawOpportunity[],
): { opportunities: RawOpportunity[]; droppedNewOpenings: number } {
  const titleOf = (opportunity: RawOpportunity) =>
    opportunity.category === 'contest' ? opportunity.attributes.theme
      : opportunity.category === 'higher-study' ? opportunity.attributes.programName
        : opportunity.attributes.roleTitle;

  const matches = (a: RawOpportunity, b: RawOpportunity) => {
    if (a.category !== b.category) return false;
    const left = titleTokens(titleOf(a));
    const right = titleTokens(titleOf(b));
    if (!left.size || !right.size) return true; // no title to judge by: keep, human reviews
    for (const token of left) if (right.has(token)) return true;
    return false;
  };

  const keptEnriched = enriched.filter((candidate) => initial.some((opening) => matches(opening, candidate)));
  return {
    opportunities: [
      ...keptEnriched,
      ...initial.filter((opening) => !enriched.some((candidate) => matches(opening, candidate))),
    ],
    droppedNewOpenings: enriched.length - keptEnriched.length,
  };
}

export function normalizeOpportunity(opportunity: z.infer<typeof RawOpportunitySchema>): OpportunityDraftValue {
  const base = normalizeBase(opportunity);
  const attributes = opportunity.attributes;
  const category: OpportunityCategory = opportunity.category;

  if (category === 'higher-study') {
    return OpportunityDraftValueSchema.parse({
      ...base,
      category,
      attributes: HigherStudyAttributesSchema.parse(attributes),
    });
  }

  if (category === 'contest') {
    return OpportunityDraftValueSchema.parse({
      ...base,
      category,
      attributes: ContestAttributesSchema.parse(attributes),
    });
  }

  return OpportunityDraftValueSchema.parse({
    ...base,
    category,
    attributes: EmploymentAttributesSchema.parse(attributes),
  });
}

export type RawExtraction = z.infer<typeof RawExtractionSchema>;
export type RawOpportunity = z.infer<typeof RawOpportunitySchema>;
