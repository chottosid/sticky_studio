'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { CandidateIdSchema, toProfileSummary } from '@/domain/opportunity/assessment';
import { isAuthenticated } from './actions';
import { assessmentQueue, assessOpportunities } from './assessments';
import { getCandidateProfiles, refreshProfiles, updateProfileContext } from './profiles';

export async function refreshProfilesAction() {
  if (!(await isAuthenticated())) return { success: false as const, message: 'Unauthorized' };
  try {
    const profiles = await refreshProfiles(true);
    revalidatePath('/');
    return { success: true as const, profiles: profiles.map(toProfileSummary) };
  } catch { return { success: false as const, message: 'Could not refresh portfolio snapshots.' }; }
}

export async function getAssessmentQueueAction(force = false) {
  if (!(await isAuthenticated())) return { success: false as const, ids: [] as string[], message: 'Unauthorized' };
  try { return { success: true as const, ids: await assessmentQueue(force) }; }
  catch { return { success: false as const, ids: [] as string[], message: 'Could not prepare assessments. Check portfolio snapshots.' }; }
}

export async function assessOpportunitiesAction(input: unknown, force = false) {
  if (!(await isAuthenticated())) return { success: false as const, message: 'Unauthorized' };
  const parsed = z.array(z.string().regex(/^\d+$/)).min(1).max(3).safeParse(input);
  if (!parsed.success) return { success: false as const, message: 'Choose one to three opportunities.' };
  try {
    const result = await assessOpportunities(parsed.data, force === true);
    revalidatePath('/');
    parsed.data.forEach((id) => revalidatePath(`/opportunity/${id}`));
    return { success: true as const, ...result };
  } catch (error) {
    return { success: false as const, message: error instanceof Error ? error.message : 'Assessment failed. Existing priorities are retained.' };
  }
}

export async function updateProfileContextAction(input: unknown) {
  if (!(await isAuthenticated())) return { success: false as const, message: 'Unauthorized' };
  const parsed = z.object({ id: CandidateIdSchema, context: z.string().trim().max(6_000) }).safeParse(input);
  if (!parsed.success) return { success: false as const, message: 'Invalid profile notes.' };
  await updateProfileContext(parsed.data.id, parsed.data.context);
  revalidatePath('/');
  return { success: true as const, profiles: (await getCandidateProfiles()).map(toProfileSummary) };
}
