'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { CandidateIdSchema, toProfileSummary } from '@/domain/opportunity/assessment';
import { isAuthenticated } from './actions';
import { getCandidateProfiles, refreshProfiles, updateProfileContext } from './profiles';
import { runAssessmentJobs, scheduleAssessments } from './applicant-assessments';

export async function refreshProfilesAction() {
  if (!(await isAuthenticated())) return { success: false as const, message: 'Unauthorized' };
  try {
    const profiles = await refreshProfiles(true);
    const keys = await scheduleAssessments();
    if (keys.length) after(async () => { await runAssessmentJobs(2, keys); });
    revalidatePath('/settings');
    return { success: true as const, profiles: profiles.map(toProfileSummary), queued: keys.length };
  } catch { return { success: false as const, message: 'Could not refresh portfolio snapshots.' }; }
}

export async function updateProfileContextAction(input: unknown) {
  if (!(await isAuthenticated())) return { success: false as const, message: 'Unauthorized' };
  const parsed = z.object({ id: CandidateIdSchema, context: z.string().trim().max(6_000) }).safeParse(input);
  if (!parsed.success) return { success: false as const, message: 'Invalid profile notes.' };
  await updateProfileContext(parsed.data.id, parsed.data.context);
  const keys = await scheduleAssessments({ candidate: parsed.data.id });
  if (keys.length) after(async () => { await runAssessmentJobs(2, keys); });
  revalidatePath('/');
  revalidatePath('/settings');
  return { success: true as const, profiles: (await getCandidateProfiles()).map(toProfileSummary) };
}
