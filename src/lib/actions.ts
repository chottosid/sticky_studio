'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
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
  name: z.string().min(1, 'Name is required.'),
  details: z.string().min(1, 'Details are required.'),
  deadline: z.string().optional(),
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
    const newOpportunity: Opportunity = {
      id: new Date().toISOString() + Math.random(),
      name,
      details,
      deadline,
      documentUri: documentUri,
      documentType: documentType,
    };

    await saveOpportunity(newOpportunity);

    revalidatePath('/');
    return { message: `Successfully added "${newOpportunity.name}"!`, success: true };
  } catch (e) {
    console.error(e);
    return { message: 'Failed to save the opportunity. Please try again.', success: false };
  }
}
