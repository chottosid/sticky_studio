'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { saveOpportunity, getOpportunities, deleteOpportunity, updateOpportunity } from '@/lib/data';
import { Opportunity } from './types';

const SESSION_COOKIE_NAME = 'session';

export async function isAuthenticated() {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME);
  return session?.value === 'authenticated';
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(prevState: any, formData: FormData) {
  try {
    const parsed = loginSchema.safeParse(Object.fromEntries(formData));

    if (!parsed.success) {
      return { message: 'Invalid email or password format.' };
    }

    const { email, password } = parsed.data;

    const FAKE_USER_EMAIL = process.env.APP_USER_EMAIL;
    const FAKE_USER_PASSWORD = process.env.APP_USER_PASSWORD;

    if (email === FAKE_USER_EMAIL && password === FAKE_USER_PASSWORD) {
      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE_NAME, 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7, // One week
        path: '/',
      });
    } else {
      return { message: 'Invalid credentials.' };
    }
  } catch (error) {
    return { message: 'An unexpected error occurred.' };
  }
  redirect('/');
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect('/login');
}

const AddOpportunitySchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  details: z.string().min(1, 'Details are required.'),
  deadline: z.string().optional().nullable().transform(val => val || undefined),
  documentUri: z.string().min(1, 'Document URI is missing.'),
  documentType: z.enum(['image', 'pdf', 'text', 'unknown']),
});

type AddOpportunityInput = z.infer<typeof AddOpportunitySchema>;

export async function addOpportunity(input: AddOpportunityInput) {
  const parsed = AddOpportunitySchema.safeParse(input);

  if (!parsed.success) {
    console.log(parsed.error.flatten().fieldErrors);
    return {
      success: false,
      message: 'Invalid form data. Please ensure all fields are filled correctly.',
      errors: parsed.error.flatten().fieldErrors,
    };
  }
  
  const { name, details, deadline, documentUri, documentType } = parsed.data;

  try {
    const newOpportunity = await saveOpportunity({
      name,
      details,
      deadline,
      documentUri: documentUri,
      documentType: documentType,
    });

    revalidatePath('/');
    return { message: `Successfully added "${newOpportunity.name}"!`, success: true };
  } catch (e) {
    console.error(e);
    return { message: 'Failed to save the opportunity. Please try again.', success: false };
  }
}

export async function getOpportunitiesAction(
  page: number = 1,
  limit: number = 10,
  sortBy: string = 'created_at',
  sortOrder: 'ASC' | 'DESC' = 'DESC',
  searchQuery?: string
) {
  try {
    const result = await getOpportunities(page, limit, sortBy, sortOrder, searchQuery);
    return { success: true, ...result };
  } catch (error) {
    console.error('Error fetching opportunities:', error);
    return { success: false, opportunities: [], total: 0, hasMore: false };
  }
}

export async function deleteOpportunityAction(id: string) {
  try {
    const deleted = await deleteOpportunity(id);
    if (deleted) {
      revalidatePath('/');
      return { success: true, message: 'Opportunity deleted successfully' };
    } else {
      return { success: false, message: 'Opportunity not found' };
    }
  } catch (error) {
    console.error('Error deleting opportunity:', error);
    return { success: false, message: 'Failed to delete opportunity' };
  }
}

const UpdateOpportunitySchema = z.object({
  id: z.string().min(1, 'ID is required'),
  name: z.string().min(1, 'Name is required').optional(),
  details: z.string().min(1, 'Details are required').optional(),
  deadline: z.string().optional().nullable().transform(val => val || undefined),
  documentUri: z.string().optional(),
  documentType: z.enum(['image', 'pdf', 'text', 'unknown']).optional(),
});

type UpdateOpportunityInput = z.infer<typeof UpdateOpportunitySchema>;

export async function updateOpportunityAction(input: UpdateOpportunityInput) {
  const parsed = UpdateOpportunitySchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      message: 'Invalid form data. Please ensure all fields are filled correctly.',
      errors: parsed.error.flatten().fieldErrors,
    };
  }
  
  const { id, ...updateData } = parsed.data;

  try {
    const updatedOpportunity = await updateOpportunity(id, updateData);
    
    if (updatedOpportunity) {
      revalidatePath('/');
      revalidatePath(`/opportunity/${id}`);
      return { 
        success: true, 
        message: `Successfully updated "${updatedOpportunity.name}"!`,
        opportunity: updatedOpportunity 
      };
    } else {
      return { success: false, message: 'Opportunity not found' };
    }
  } catch (error) {
    console.error('Update failed:', error);
    return { message: 'Failed to update the opportunity. Please try again.', success: false };
  }
}
