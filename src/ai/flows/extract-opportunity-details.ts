'use server';

/**
 * @fileOverview This flow extracts key details from uploaded documents related to opportunities.
 *
 * - extractOpportunityDetails - A function that extracts opportunity details from a document.
 * - ExtractOpportunityDetailsInput - The input type for the extractOpportunityDetails function.
 * - ExtractOpportunityDetailsOutput - The return type for the extractOpportunityDetails function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ExtractOpportunityDetailsInputSchema = z.object({
  documentDataUri: z
    .string()
    .describe(
      "The document (PDF, image, or text) as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractOpportunityDetailsInput = z.infer<typeof ExtractOpportunityDetailsInputSchema>;

const ExtractOpportunityDetailsOutputSchema = z.object({
  name: z.string().describe('The name of the opportunity (e.g., scholarship, PhD position, competition).'),
  details: z.string().describe('Relevant details about the opportunity.'),
  deadline: z.string().optional().describe('The application deadline in YYYY-MM-DD format (e.g., 2024-12-31) or YYYY-MM format.'),
});
export type ExtractOpportunityDetailsOutput = z.infer<typeof ExtractOpportunityDetailsOutputSchema>;

export async function extractOpportunityDetails(
  input: ExtractOpportunityDetailsInput
): Promise<ExtractOpportunityDetailsOutput> {
  return extractOpportunityDetailsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'extractOpportunityDetailsPrompt',
  input: { schema: ExtractOpportunityDetailsInputSchema },
  output: { schema: ExtractOpportunityDetailsOutputSchema },
  prompt: `You are an expert at extracting key details from documents related to scholarships, PhD positions, and competitions.

  Extract the following information from the document:

  - Name: The name of the opportunity (e.g., scholarship, PhD position, competition).
  - Details: Relevant details about the opportunity.
  - Deadline: The application deadline, if available. Format MUST be YYYY-MM-DD (e.g., 2025-01-30) or YYYY-MM. Do NOT use natural language formats like "16th January 2026".

  Document: {{media url=documentDataUri}}
  `,
});

const extractOpportunityDetailsFlow = ai.defineFlow(
  {
    name: 'extractOpportunityDetailsFlow',
    inputSchema: ExtractOpportunityDetailsInputSchema,
    outputSchema: ExtractOpportunityDetailsOutputSchema,
  },
  async input => {
    const { output } = await prompt(input);
    return output!;
  }
);
