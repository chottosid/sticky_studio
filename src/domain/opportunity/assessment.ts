import { z } from 'zod';

export const candidateIds = ['swarup', 'archita'] as const;
export const CandidateIdSchema = z.enum(candidateIds);
export type CandidateId = z.infer<typeof CandidateIdSchema>;

export const candidates = [
  { id: 'swarup', name: 'Swarup', fullName: 'Swarup Sidhartho Mondol', website: 'https://swarupsidhartho.com/' },
  { id: 'archita', name: 'Archita', fullName: 'Archita Lahiri', website: 'https://archi120.github.io/' },
] as const;

export const priorityTiers = ['P1', 'P2', 'P3', 'P4', 'ineligible', 'review'] as const;
export const PriorityTierSchema = z.enum(priorityTiers);
export type PriorityTier = z.infer<typeof PriorityTierSchema>;
export const priorityLabels: Record<PriorityTier, string> = {
  P1: 'P1 · Focus first', P2: 'P2 · Worth pursuing', P3: 'P3 · Stretch / secondary',
  P4: 'P4 · Low fit', ineligible: 'Not eligible', review: 'Needs review',
};
export const ASSESSMENT_VERSION = 'profile-fit-v1';
export const ASSESSMENT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

const note = z.string().trim().min(1).max(1_000);
export const FitDecisionSchema = z.object({
  tier: PriorityTierSchema,
  eligibility: z.enum(['eligible', 'unclear', 'ineligible']),
  fit: z.enum(['strong', 'good', 'partial', 'weak']),
  confidence: z.enum(['high', 'medium', 'low']),
  summary: note,
  strengths: z.array(note).max(5),
  gaps: z.array(note).max(5),
  profileEvidence: z.array(note).max(5),
  nextStep: note,
});
export type FitDecision = z.infer<typeof FitDecisionSchema>;

export const StoredAssessmentSchema = FitDecisionSchema.extend({
  profileHash: z.string(),
  contentRevision: z.number().int().positive(),
  assessedAt: z.string().datetime(),
  policyVersion: z.string(),
  model: z.string(),
});
export type ProfileAssessment = z.infer<typeof StoredAssessmentSchema>;
export type ProfileAssessments = Partial<Record<CandidateId, ProfileAssessment>>;

export type CandidateProfile = {
  id: CandidateId;
  name: string;
  website: string;
  text: string;
  additionalContext: string;
  contentHash: string;
  fetchedAt: string | null;
  fetchError: string | null;
};
export type ProfileSummary = Omit<CandidateProfile, 'text'>;

export function toProfileSummary(profile: CandidateProfile): ProfileSummary {
  return {
    id: profile.id, name: profile.name, website: profile.website,
    additionalContext: profile.additionalContext, contentHash: profile.contentHash,
    fetchedAt: profile.fetchedAt, fetchError: profile.fetchError,
  };
}

export function parseAssessments(value: unknown): ProfileAssessments {
  if (!value || typeof value !== 'object') return {};
  const result: ProfileAssessments = {};
  for (const id of candidateIds) {
    const parsed = StoredAssessmentSchema.safeParse((value as Record<string, unknown>)[id]);
    if (parsed.success) result[id] = parsed.data;
  }
  return result;
}

export function assessmentIsCurrent(
  assessment: ProfileAssessment | undefined,
  contentRevision: number,
  profileHash: string | undefined,
  now = Date.now(),
): boolean {
  if (!assessment || !profileHash) return false;
  const age = now - Date.parse(assessment.assessedAt);
  return assessment.contentRevision === contentRevision
    && assessment.profileHash === profileHash
    && assessment.policyVersion === ASSESSMENT_VERSION
    && Number.isFinite(age) && age >= -60_000 && age < ASSESSMENT_MAX_AGE_MS;
}

/** Eligibility is a gate; a high topical match cannot override an explicit disqualifier. */
export function normalizeDecision(decision: FitDecision): FitDecision {
  if (decision.eligibility === 'ineligible') return { ...decision, tier: 'ineligible' };
  if (decision.tier === 'ineligible') return { ...decision, eligibility: 'ineligible' };
  if (decision.confidence === 'low' && decision.tier === 'P1') return { ...decision, tier: 'P2' };
  return decision;
}
