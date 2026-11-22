'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { OrganizationInputSchema, ProfessorInputSchema } from '@/domain/lab/schema';
import { isAuthenticated } from './actions';
import { createProfessor, deleteProfessor, updateOrganization, updateProfessor } from './labs';

const unauthorized = { success: false as const, message: 'Unauthorized' };
const refresh = (organizationId: string) => {
  revalidatePath('/labs');
  revalidatePath(`/labs/${organizationId}`);
};

export async function saveProfessorAction(input: unknown) {
  if (!(await isAuthenticated())) return unauthorized;
  const parsed = z.object({
    organizationId: z.string().min(1),
    professorId: z.string().min(1).optional(),
    professor: ProfessorInputSchema,
  }).safeParse(input);
  if (!parsed.success) return { success: false as const, message: parsed.error.issues[0]?.message ?? 'Check the professor fields.' };
  const { organizationId, professorId, professor } = parsed.data;
  try {
    const result = professorId ? await updateProfessor(professorId, professor) : await createProfessor(organizationId, professor);
    if (result === 'duplicate') return { success: false as const, message: 'This university already has a professor with that name.' };
    if (!result) return { success: false as const, message: 'Professor not found.' };
    refresh(organizationId);
    return { success: true as const, message: professorId ? 'Professor updated' : 'Professor added' };
  } catch (error) {
    console.error('Could not save professor:', error);
    return { success: false as const, message: 'Could not save the professor.' };
  }
}

export async function deleteProfessorAction(input: { organizationId: string; professorId: string }) {
  if (!(await isAuthenticated())) return unauthorized;
  try {
    if (!(await deleteProfessor(input.professorId))) return { success: false as const, message: 'Professor not found.' };
    refresh(input.organizationId);
    return { success: true as const, message: 'Professor removed' };
  } catch (error) {
    console.error('Could not delete professor:', error);
    return { success: false as const, message: 'Could not remove the professor.' };
  }
}

export async function saveOrganizationAction(input: unknown) {
  if (!(await isAuthenticated())) return unauthorized;
  const parsed = z.object({ organizationId: z.string().min(1), organization: OrganizationInputSchema }).safeParse(input);
  if (!parsed.success) return { success: false as const, message: parsed.error.issues[0]?.message ?? 'Check the university fields.' };
  try {
    if (!(await updateOrganization(parsed.data.organizationId, parsed.data.organization))) return { success: false as const, message: 'University not found.' };
    refresh(parsed.data.organizationId);
    return { success: true as const, message: 'University updated' };
  } catch (error) {
    if ((error as { code?: string }).code === '23505') return { success: false as const, message: 'Another university already uses that name.' };
    console.error('Could not save organization:', error);
    return { success: false as const, message: 'Could not save the university.' };
  }
}
