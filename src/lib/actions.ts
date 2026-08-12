'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  ExtractionSourceSchema,
  OpportunityInputSchema,
  type OpportunityCategory,
} from '@/domain/opportunity/schema';
import { deleteOpportunity, getOpportunities, saveOpportunity, updateOpportunity } from '@/lib/data';
import { sendNewOpportunityEmail, sendTestEmail } from '@/lib/email';
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  verifySessionToken,
} from '@/lib/auth/session';
import {
  removeStoredSources,
  uploadOpportunitySources,
} from '@/lib/source-storage';
import {
  createDuplicateConfirmationToken,
  findDuplicateMatches,
  verifyDuplicateConfirmationToken,
} from '@/lib/duplicates';

export async function isAuthenticated() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

async function requireAuthentication() {
  if (!(await isAuthenticated())) throw new Error('Unauthorized');
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(_previousState: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: 'Invalid email or password format.' };

  const { email, password } = parsed.data;
  if (email !== process.env.APP_USER_EMAIL || password !== process.env.APP_USER_PASSWORD) {
    return { message: 'Invalid credentials.' };
  }

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
  opportunity: OpportunityInputSchema,
  sources: z.array(ExtractionSourceSchema).min(1).max(5),
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

  let uploadedSources: Awaited<ReturnType<typeof uploadOpportunitySources>> = [];
  try {
    const duplicateInput = {
      opportunity: parsed.data.opportunity,
      sources: parsed.data.sources,
      discoveredSourceUrls: parsed.data.discoveredSourceUrls,
    };
    const confirmed = await verifyDuplicateConfirmationToken(
      duplicateInput,
      parsed.data.duplicateConfirmationToken,
    );
    if (!confirmed) {
      const duplicateMatches = await findDuplicateMatches(duplicateInput);
      if (duplicateMatches.length) {
        return {
          success: false as const,
          code: 'DUPLICATE_WARNING' as const,
          message: 'Possible duplicate opportunities found.',
          duplicateMatches,
          duplicateConfirmationToken: await createDuplicateConfirmationToken(duplicateInput, duplicateMatches),
        };
      }
    }

    uploadedSources = await uploadOpportunitySources(parsed.data.sources);
    const opportunity = await saveOpportunity(
      parsed.data.opportunity,
      uploadedSources,
      Array.from(new Set(parsed.data.discoveredSourceUrls)),
    );
    await sendNewOpportunityEmail(opportunity);
    revalidatePath('/');
    return { success: true as const, message: `Successfully added "${opportunity.name}"!`, opportunity };
  } catch (error) {
    if (uploadedSources.length) {
      await removeStoredSources(uploadedSources.map((source) => source.storagePath));
    }
    console.error('Could not save opportunity:', error);
    return {
      success: false as const,
      message: error instanceof Error ? error.message : 'Failed to save the opportunity.',
    };
  }
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

export async function sendTestEmailAction() {
  try {
    await requireAuthentication();
    const info = await sendTestEmail();
    return info
      ? { success: true as const, message: 'Test email sent successfully.' }
      : { success: false as const, message: 'Email was not sent. Check server configuration.' };
  } catch (error) {
    console.error('Test email action failed:', error);
    return { success: false as const, message: 'An error occurred while sending the test email.' };
  }
}
