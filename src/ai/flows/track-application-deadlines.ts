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

  Your goal is to identify any application deadlines mentioned in the provided document text and return them in ISO 8601 format (YYYY-MM-DD).

  If no deadline is found, return an empty string for the deadline field.

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
