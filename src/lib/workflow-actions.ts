'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { CandidateIdSchema } from '@/domain/opportunity/assessment';
import { ApplicationStageSchema } from '@/domain/opportunity/workflow';
import { isCalendarDate, isNumericId } from './utils';
import { isAuthenticated } from './actions';
import { scheduleAssessments, runAssessmentJobs } from './applicant-assessments';
import { applicantOpportunities } from './applicant-workflow';
import { query } from './db';

const target = z.object({ id: z.string().refine(isNumericId), candidate: CandidateIdSchema });
const progress = target.extend({
  stage: ApplicationStageSchema,
  followUpOn: z.string().refine(isCalendarDate).nullable(),
  note: z.string().trim().max(500),
});

export async function saveApplicantProgress(input: unknown) {
  if (!(await isAuthenticated())) return { success: false, message: 'Sign in to update the application.' };
  const parsed = progress.safeParse(input);
  if (!parsed.success) return { success: false, message: 'Check the follow-up date and note.' };
  const { id, candidate, stage, followUpOn, note } = parsed.data;
  const result = await query(`
    INSERT INTO applicant_opportunities(opportunity_id, candidate_id, stage, follow_up_on, follow_up_note)
    SELECT id, $2, $3, $4, $5 FROM opportunities WHERE id = $1
    ON CONFLICT (opportunity_id, candidate_id) DO UPDATE
      SET stage = EXCLUDED.stage, follow_up_on = EXCLUDED.follow_up_on, follow_up_note = EXCLUDED.follow_up_note, updated_at = now()
  `, [id, candidate, stage, followUpOn, note]);
  if (!result.rowCount) return { success: false, message: 'This opportunity is no longer available.' };
  revalidatePath('/');
  revalidatePath('/ledger');
  revalidatePath(`/opportunity/${id}`);
  return { success: true, message: 'Application updated.' };
}

export async function requestApplicantAssessment(input: unknown) {
  if (!(await isAuthenticated())) return { success: false, message: 'Sign in to request an assessment.' };
  const parsed = target.safeParse(input);
  if (!parsed.success) return { success: false, message: 'Choose an applicant and opportunity.' };
  const { id, candidate } = parsed.data;
  const keys = await scheduleAssessments({ ids: [id], candidate, force: true });
  const [item] = await applicantOpportunities({ ids: [id], candidate });
  if (!keys.length && item?.summary.jobState !== 'pending') {
    return { success: false, message: 'Refresh this applicant’s portfolio from Settings, then try again.' };
  }
  if (keys.length) after(async () => { await runAssessmentJobs(1, keys); });
  return { success: true, message: 'Assessment queued.' };
}

export async function applicantAssessmentStatus(input: unknown) {
  if (!(await isAuthenticated())) return { status: 'unavailable' as const };
  const parsed = target.safeParse(input);
  if (!parsed.success) return { status: 'unavailable' as const };
  const [item] = await applicantOpportunities({ ids: [parsed.data.id], candidate: parsed.data.candidate });
  return { status: item?.summary.jobState ?? 'finished' };
}
