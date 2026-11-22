import { z } from 'zod';
import { daysUntil } from '@/lib/deadlines';
import type { FitDecision } from './assessment';

export const APPLICANT_POLICY = 'applicant-evidence-v2';

export const PostingStatusSchema = z.enum(['unknown', 'rolling', 'closed']);
export type PostingStatus = z.infer<typeof PostingStatusSchema>;
export const ApplicationStageSchema = z.enum(['considering', 'applying', 'applied', 'archived']);
export type ApplicationStage = z.infer<typeof ApplicationStageSchema>;
export const stageLabels: Record<ApplicationStage, string> = {
  considering: 'Considering', applying: 'Applying', applied: 'Applied', archived: 'Archived',
};

export const RequirementCheckSchema = z.object({
  requirement: z.string().trim().min(1).max(500),
  status: z.enum(['met', 'unmet', 'unknown']),
  sourceExcerpt: z.string().trim().max(500),
  applicantExcerpt: z.string().trim().max(500),
});

export const ApplicantAssessmentSchema = z.object({
  fit: z.enum(['strong', 'good', 'partial', 'weak', 'unknown']),
  explanation: z.string().trim().min(1).max(1000),
  checks: z.array(RequirementCheckSchema).max(8),
  question: z.string().trim().max(500),
});
export type ApplicantAssessment = z.infer<typeof ApplicantAssessmentSchema>;

export type AssessmentSummary = Pick<ApplicantAssessment, 'fit' | 'question'> & {
  eligibility: 'eligible' | 'ineligible' | 'unknown';
};
export type ApplicantProgress = { stage: ApplicationStage; followUpOn: string | null; note: string };
export const defaultProgress: ApplicantProgress = { stage: 'considering', followUpOn: null, note: '' };
export type ActionKind = 'follow-up' | 'verify' | 'prepare' | 'track' | 'skip' | 'complete';
export type NextAction = { kind: ActionKind; label: string; text: string };
export type ApplicantSummary = {
  progress: ApplicantProgress;
  action: NextAction;
  fit: AssessmentSummary['fit'];
  assessmentState: 'current' | 'previous' | 'legacy' | 'missing';
  jobState?: 'pending' | 'failed';
};

export function assessmentSummary(assessment: ApplicantAssessment): AssessmentSummary {
  const eligibility = assessment.checks.some((check) => check.status === 'unmet')
    ? 'ineligible' : assessment.checks.length > 0 && assessment.checks.every((check) => check.status === 'met')
      ? 'eligible' : 'unknown';
  return { eligibility, fit: assessment.fit, question: assessment.question };
}

export function legacySummary(assessment: Pick<FitDecision, 'eligibility' | 'fit'>): AssessmentSummary {
  return { eligibility: assessment.eligibility === 'eligible' ? 'eligible' : 'unknown', fit: assessment.fit, question: '' };
}

export function postingState(deadline: string | null, status: PostingStatus, today: string) {
  if (status === 'closed' || (status !== 'rolling' && deadline && deadline < today)) return 'closed';
  if (status === 'rolling') return 'rolling';
  return deadline ? 'fixed' : 'unknown';
}

export function nextAction(input: {
  deadline: string | null;
  postingStatus: PostingStatus;
  today: string;
  progress: ApplicantProgress;
  assessment?: AssessmentSummary;
}): NextAction {
  const { deadline, postingStatus, today, progress, assessment } = input;
  const state = postingState(deadline, postingStatus, today);
  if (progress.stage === 'archived') return { kind: 'complete', label: 'Archived', text: 'Archived for this applicant.' };
  if (progress.followUpOn && daysUntil(progress.followUpOn, today) <= 7) {
    return { kind: 'follow-up', label: 'Follow up', text: progress.note || 'Follow up on this opportunity.' };
  }
  if (progress.stage === 'applied') return { kind: 'complete', label: 'Applied', text: 'Application submitted.' };
  if (state === 'closed') return { kind: 'track', label: 'Posting closed', text: 'Check for a future opening if still interested.' };
  if (assessment?.eligibility === 'ineligible') return { kind: 'skip', label: 'Requirement unmet', text: 'Review the decisive requirement before applying.' };
  // Unclear eligibility is not a blocker: open questions are shown with the next step instead.
  if (state === 'unknown') return { kind: 'verify', label: 'Verify intake', text: 'Confirm this opening is accepting applications.' };
  if (progress.stage === 'applying' || !assessment || assessment.fit === 'strong' || assessment.fit === 'good' || assessment.fit === 'unknown') {
    return { kind: 'prepare', label: 'Prepare application', text: assessment?.question || 'Check the application checklist and prepare materials.' };
  }
  return { kind: 'track', label: 'Keep on watch', text: 'Revisit if it fits your plans.' };
}

export function actionGroup(action: NextAction, deadline: string | null, today: string) {
  if (action.kind === 'follow-up') return 'follow-ups';
  if (action.kind === 'verify') return 'verification';
  if (action.kind === 'prepare') return deadline && daysUntil(deadline, today) <= 7 ? 'due' : 'prepare';
  return null;
}
