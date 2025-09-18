'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { saveOpportunity } from '@/lib/data';
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
