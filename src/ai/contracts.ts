import { z } from 'zod';
import {
  ContestAttributesSchema,
  EmploymentAttributesSchema,
  HigherStudyAttributesSchema,
  OpportunityDraftValueSchema,
  type OpportunityCategory,
  type OpportunityDraftValue,
} from '@/domain/opportunity/schema';

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
  opportunities: z.array(RawOpportunitySchema).min(1).max(10),
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
    opportunities: {
      type: 'array',
      minItems: 1,
      maxItems: 10,
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
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function validEmailOrNull(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
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
