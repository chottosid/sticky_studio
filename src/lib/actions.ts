'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { extractOpportunityDetails } from '@/ai/flows/extract-opportunity-details';
import { saveOpportunity } from '@/lib/data';
import { Opportunity } from './types';

const SESSION_COOKIE_NAME = 'session';
const FAKE_USER_EMAIL = 'user@example.com';
const FAKE_USER_PASSWORD = 'password123';

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

    if (email === FAKE_USER_EMAIL && password === FAKE_USER_PASSWORD) {
      const cookieStore = cookies();
      cookieStore.set(SESSION_COOKIE_NAME, 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7, // One week
        path: '/',
      });
      // Redirect is handled on the client-side in this implementation
    } else {
      return { message: 'Invalid credentials.' };
    }
  } catch (error) {
    return { message: 'An unexpected error occurred.' };
  }
  redirect('/');
}

export async function logout() {
  const cookieStore = cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect('/login');
}

const AddOpportunitySchema = z.object({
  documentDataUri: z.string().min(1, 'Document is required.'),
  documentType: z.enum(['image', 'pdf', 'text', 'unknown']),
});

export async function addOpportunity(prevState: any, formData: FormData) {
  const parsed = AddOpportunitySchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      message: 'Invalid form data.',
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const { documentDataUri, documentType } = parsed.data;

  try {
    const extractedDetails = await extractOpportunityDetails({ documentDataUri });

    const newOpportunity: Opportunity = {
      id: new Date().toISOString() + Math.random(),
      name: extractedDetails.name,
      details: extractedDetails.details,
      deadline: extractedDetails.deadline,
      documentUri: documentDataUri,
      documentType: documentType,
    };

    await saveOpportunity(newOpportunity);

    revalidatePath('/');
    return { message: `Successfully added "${newOpportunity.name}"!`, success: true };
  } catch (e) {
    console.error(e);
    return { message: 'AI processing failed. Please try again.' };
  }
}
