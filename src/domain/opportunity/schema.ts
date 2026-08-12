import { z } from 'zod';

export const opportunityCategories = ['job', 'internship', 'contest', 'higher-study'] as const;
export const OpportunityCategorySchema = z.enum(opportunityCategories);

const nullableText = (max = 2_000) =>
  z.preprocess(
    (value) => value === '' || value === undefined ? null : value,
    z.string().trim().max(max).nullable(),
  ).default(null);

const stringList = z.array(z.string().trim().min(1).max(500)).max(50).default([]);

export const EmploymentAttributesSchema = z.object({
  roleTitle: nullableText(500),
  employmentType: nullableText(200),
  workplaceMode: nullableText(200),
  compensation: nullableText(1_000),
  skills: stringList,
  duration: nullableText(500),
});

export const HigherStudyAttributesSchema = z.object({
  programName: nullableText(500),
  degreeLevel: nullableText(200),
  department: nullableText(500),
  professorNames: stringList,
  labName: nullableText(500),
  researchAreas: stringList,
  funding: nullableText(1_000),
  startTerm: nullableText(200),
});

export const ContestAttributesSchema = z.object({
  theme: nullableText(1_000),
  prize: nullableText(1_000),
  eventDate: nullableText(100),
});

const commonOpportunityFields = {
  name: z.string().trim().min(1, 'Name is required.').max(500),
  details: z.string().trim().max(20_000).default(''),
  deadline: z.preprocess(
    (value) => value === '' || value === undefined ? null : value,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Deadline must use YYYY-MM-DD.').nullable(),
  ).default(null),
  organizationName: nullableText(500),
  organizationType: nullableText(200),
  location: nullableText(500),
  applicationUrl: z.preprocess(
    (value) => value === '' || value === undefined ? null : value,
    z.string().url().max(2_000).nullable(),
  ).default(null),
  contactEmail: z.preprocess(
    (value) => value === '' || value === undefined ? null : value,
    z.string().email().max(320).nullable(),
  ).default(null),
  eligibility: nullableText(5_000),
  requirements: stringList,
};

export const JobOpportunityInputSchema = z.object({
  ...commonOpportunityFields,
  category: z.literal('job'),
  attributes: EmploymentAttributesSchema.default({}),
});

export const InternshipOpportunityInputSchema = z.object({
  ...commonOpportunityFields,
  category: z.literal('internship'),
  attributes: EmploymentAttributesSchema.default({}),
});

export const ContestOpportunityInputSchema = z.object({
  ...commonOpportunityFields,
  category: z.literal('contest'),
  attributes: ContestAttributesSchema.default({}),
});

export const HigherStudyOpportunityInputSchema = z.object({
  ...commonOpportunityFields,
  category: z.literal('higher-study'),
  attributes: HigherStudyAttributesSchema.default({}),
});

export const OpportunityInputSchema = z.discriminatedUnion('category', [
  JobOpportunityInputSchema,
  InternshipOpportunityInputSchema,
  ContestOpportunityInputSchema,
  HigherStudyOpportunityInputSchema,
]);

export const OpportunityDraftValueSchema = z.discriminatedUnion('category', [
  JobOpportunityInputSchema.extend({ name: z.string().trim().max(500) }),
  InternshipOpportunityInputSchema.extend({ name: z.string().trim().max(500) }),
  ContestOpportunityInputSchema.extend({ name: z.string().trim().max(500) }),
  HigherStudyOpportunityInputSchema.extend({ name: z.string().trim().max(500) }),
]);

export const EvidenceSchema = z.object({
  field: z.string().trim().min(1).max(200),
  sourceId: z.string().trim().min(1).max(200),
  excerpt: z.string().trim().max(500).default(''),
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),
});

export const ExtractionDraftSchema = z.object({
  opportunity: OpportunityDraftValueSchema,
  evidence: z.array(EvidenceSchema).max(100).default([]),
  unresolvedFields: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
  warnings: z.array(z.string().trim().min(1).max(1_000)).max(50).default([]),
  discoveredSourceUrls: z.array(z.string().url().max(2_000)).max(20).default([]),
});

export const ExtractionSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string().trim().min(1).max(100),
    kind: z.enum(['image', 'pdf']),
    name: z.string().trim().min(1).max(500),
    mimeType: z.string().trim().min(1).max(200),
    dataUri: z.string().min(1),
  }),
  z.object({
    id: z.string().trim().min(1).max(100),
    kind: z.literal('text'),
    name: z.string().trim().min(1).max(500).default('Pasted text'),
    mimeType: z.literal('text/plain').default('text/plain'),
    text: z.string().trim().min(1).max(200_000),
  }),
]);

export const ExtractionRequestSchema = z.object({
  sources: z.array(ExtractionSourceSchema).min(1).max(5),
});

export const SaveSourceSchema = ExtractionSourceSchema;

export type OpportunityCategory = z.infer<typeof OpportunityCategorySchema>;
export type OpportunityInput = z.infer<typeof OpportunityInputSchema>;
export type OpportunityDraftValue = z.infer<typeof OpportunityDraftValueSchema>;
export type EmploymentAttributes = z.infer<typeof EmploymentAttributesSchema>;
export type HigherStudyAttributes = z.infer<typeof HigherStudyAttributesSchema>;
export type ContestAttributes = z.infer<typeof ContestAttributesSchema>;
export type ExtractionDraft = z.infer<typeof ExtractionDraftSchema>;
export type ExtractionSource = z.infer<typeof ExtractionSourceSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
