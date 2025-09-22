// src/ai/flows/track-application-deadlines.ts
'use server';

/**
 * @fileOverview This file defines a Genkit flow for tracking application deadlines.
 *
 * It extracts deadline information from uploaded documents using the Gemini API.
 *
 * @fileOverview A Genkit flow for tracking application deadlines.
 * - trackApplicationDeadlines - A function that handles the application deadline tracking process.
 * - TrackApplicationDeadlinesInput - The input type for the trackApplicationDeadlines function.
 * - TrackApplicationDeadlinesOutput - The return type for the trackApplicationDeadlines function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const TrackApplicationDeadlinesInputSchema = z.object({
  documentText: z
    .string()
    .describe("The text content of the document to extract the application deadline from."),
});

export type TrackApplicationDeadlinesInput = z.infer<typeof TrackApplicationDeadlinesInputSchema>;

const TrackApplicationDeadlinesOutputSchema = z.object({
  deadline: z
    .string()
    .optional()
    .describe("The extracted application deadline from the document, if found. Should be in ISO 8601 format."),
});

export type TrackApplicationDeadlinesOutput = z.infer<typeof TrackApplicationDeadlinesOutputSchema>;

export async function trackApplicationDeadlines(
  input: TrackApplicationDeadlinesInput
): Promise<TrackApplicationDeadlinesOutput> {
  return trackApplicationDeadlinesFlow(input);
}

const deadlineExtractionPrompt = ai.definePrompt({
  name: 'deadlineExtractionPrompt',
  input: {schema: TrackApplicationDeadlinesInputSchema},
  output: {schema: TrackApplicationDeadlinesOutputSchema},
  prompt: `You are an expert at extracting application deadlines from text.

  Current date: ${new Date().toISOString().split('T')[0]}

  Your goal is to identify any application deadlines mentioned in the provided document text and return them in EXACTLY the yyyy-mm-dd format.

  CRITICAL INSTRUCTIONS:
  - The deadline MUST be in yyyy-mm-dd format (e.g., 2025-09-22)
  - For relative dates like "tomorrow", "next week", "in 2 months", calculate the exact date based on the current date above
  - For dates like "December 15" without a year, assume the current year unless context suggests otherwise
  - If multiple deadlines are found, return the earliest one
  - If no deadline is found, return an empty string for the deadline field
  - Double-check your date calculation for relative dates

  Examples of correct output format:
  - "2025-12-15" ✓
  - "2026-01-30" ✓
  - "" (empty string if no deadline found) ✓

  Document Text: {{{documentText}}}`,
});

const trackApplicationDeadlinesFlow = ai.defineFlow(
  {
    name: 'trackApplicationDeadlinesFlow',
    inputSchema: TrackApplicationDeadlinesInputSchema,
    outputSchema: TrackApplicationDeadlinesOutputSchema,
  },
  async input => {
    const {output} = await deadlineExtractionPrompt(input);
    return output!;
  }
);
