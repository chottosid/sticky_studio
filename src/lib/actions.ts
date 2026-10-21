'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  ExtractionSourceSchema,
  OpportunityInputSchema,
  type OpportunityCategory,
} from '@/domain/opportunity/schema';
import { deleteOpportunity, getOpportunities, updateOpportunity } from '@/lib/data';
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  verifySessionToken,
} from '@/lib/auth/session';
import { removeStoredSources } from '@/lib/source-storage';
import { saveOpportunityBatch } from '@/lib/save-opportunities';
import { credentialsMatch } from '@/lib/auth/credentials';
import { query } from '@/lib/db';

export async function isAuthenticated() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

const MAX_FAILED_LOGINS = 10;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(_previousState: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: 'Invalid email or password format.' };

  // ponytail: per-address limit in Postgres; a shared address (NAT) shares the budget.
  const client = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const recent = await query<{ failures: string }>(
    `SELECT COUNT(*) AS failures FROM login_attempts
     WHERE client = $1 AND attempted_at > now() - interval '15 minutes'`,
    [client],
  );
  if (Number(recent.rows[0].failures) >= MAX_FAILED_LOGINS) {
    return { message: 'Too many failed sign-ins. Try again in 15 minutes.' };
  }

  const { email, password } = parsed.data;
  if (!credentialsMatch(email, password, {
    email: process.env.APP_USER_EMAIL,
    password: process.env.APP_USER_PASSWORD,
  })) {
    await query('INSERT INTO login_attempts (client) VALUES ($1)', [client]);
    return { message: 'Email or password is incorrect.' };
  }
  await query(`DELETE FROM login_attempts WHERE client = $1 OR attempted_at < now() - interval '1 day'`, [client]);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, await createSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  });
  redirect('/');
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect('/login');
}

const SaveOpportunityRequestSchema = z.object({
  opportunities: z.array(OpportunityInputSchema).min(1).max(10),
  sources: z.array(ExtractionSourceSchema).min(1).max(10),
  discoveredSourceUrls: z.array(z.string().url().max(2_000)).max(20).default([]),
  duplicateConfirmationToken: z.string().max(5_000).optional(),
});

export async function addOpportunity(input: unknown) {
  if (!(await isAuthenticated())) return { success: false as const, message: 'Unauthorized' };
  const parsed = SaveOpportunityRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      message: 'Please correct the highlighted opportunity fields.',
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  return saveOpportunityBatch(parsed.data);
}

export async function getOpportunitiesAction(
  page = 1,
  limit = 10,
  sortBy = 'created_at',
  sortOrder: 'ASC' | 'DESC' = 'DESC',
  searchQuery?: string,
  status?: 'upcoming' | 'past',
  category?: OpportunityCategory,
) {
  if (!(await isAuthenticated())) {
    return { success: false as const, opportunities: [], total: 0, hasMore: false };
  }
  try {
    return {
      success: true as const,
      ...await getOpportunities(page, limit, sortBy, sortOrder, searchQuery, status, category),
    };
  } catch (error) {
    console.error('Error fetching opportunities:', error);
    return { success: false as const, opportunities: [], total: 0, hasMore: false };
  }
}

export async function deleteOpportunityAction(id: string) {
  if (!(await isAuthenticated())) return { success: false as const, message: 'Unauthorized' };
  try {
    const result = await deleteOpportunity(id);
    if (!result.deleted) return { success: false as const, message: 'Opportunity not found' };
    await removeStoredSources(result.storagePaths);
    revalidatePath('/');
    return { success: true as const, message: 'Opportunity deleted successfully' };
  } catch (error) {
    console.error('Error deleting opportunity:', error);
    return { success: false as const, message: 'Failed to delete opportunity' };
  }
}

const UpdateOpportunityRequestSchema = z.object({
  id: z.string().min(1),
  opportunity: OpportunityInputSchema,
});

export async function updateOpportunityAction(input: unknown) {
  if (!(await isAuthenticated())) return { success: false as const, message: 'Unauthorized' };
  const parsed = UpdateOpportunityRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, message: 'Please correct the highlighted opportunity fields.' };
  }

  try {
    const opportunity = await updateOpportunity(parsed.data.id, parsed.data.opportunity);
    if (!opportunity) return { success: false as const, message: 'Opportunity not found' };
    revalidatePath('/');
    revalidatePath(`/opportunity/${parsed.data.id}`);
    return {
      success: true as const,
      message: `Successfully updated "${opportunity.name}"!`,
      opportunity,
    };
  } catch (error) {
    console.error('Update failed:', error);
    return { success: false as const, message: 'Failed to update the opportunity.' };
  }
}
