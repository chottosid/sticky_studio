import { z } from 'zod';
import { CandidateIdSchema, type CandidateId } from './assessment';
import type { NextAction } from './workflow';
import { opportunityCategories, type ExtractionDraft } from './schema';
import { isCalendarDate, isNumericId } from '@/lib/utils';

const request = z.object({ candidate: CandidateIdSchema });

export const OutreachOutputSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4_000),
});

export const AgentRequestSchema = z.discriminatedUnion('kind', [
  request.extend({ kind: z.literal('week') }),
  request.extend({ kind: z.literal('research'), query: z.string().trim().min(3).max(500) }),
  request.extend({
    kind: z.literal('outreach'), opportunityId: z.string().refine(isNumericId),
    instructions: z.string().trim().max(500).optional(), previousDraft: OutreachOutputSchema.optional(),
  }),
]);

export type AgentRequest = z.infer<typeof AgentRequestSchema>;

export const ResearchOutputSchema = z.object({
  opportunities: z.array(z.object({
    name: z.string().trim().min(1).max(500),
    category: z.enum(opportunityCategories),
    organization: z.string().trim().max(500).nullable(),
    summary: z.string().trim().min(1).max(2_000),
    sourceUrl: z.string().url().max(2_000),
    deadline: z.string().refine(isCalendarDate).nullable(),
    contactEmail: z.string().email().max(320).nullable(),
  })).max(5),
});

export type WeeklyTask = {
  id: string;
  name: string;
  deadline: string | null;
  candidate: CandidateId;
  action: NextAction;
};

export type ResearchProposal = {
  sourceUrl: string;
  draft: ExtractionDraft;
  existing: { id: string; name: string } | null;
};

export type AgentResult =
  | { kind: 'week'; tasks: WeeklyTask[] }
  | { kind: 'research'; proposals: ResearchProposal[] }
  | ({ kind: 'outreach'; contact: string | null } & z.infer<typeof OutreachOutputSchema>);
