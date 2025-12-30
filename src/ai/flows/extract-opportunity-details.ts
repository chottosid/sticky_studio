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
import { format } from 'date-fns';

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
  deadline: z.string().optional().describe('The application deadline in YYYY-MM-DD format or YYYY-MM format.'),
});
export type ExtractOpportunityDetailsOutput = z.infer<typeof ExtractOpportunityDetailsOutputSchema>;

// Layer 1: Raw Extraction JSON schema
const RawExtractionSchema = z.object({
  name: z.string(),
  details: z.string(),
  rawDeadline: z.string().optional().describe('The deadline as mentioned in the text (e.g. "next Friday", "16th Jan 2026", "rolling basis").'),
});

// Layer 2: Date Parsing Prompt
const parseDatePrompt = ai.definePrompt({
  name: 'parseDatePrompt',
  input: {
    schema: z.object({
      rawDeadline: z.string(),
      today: z.string(),
    }),
  },
  output: {
    schema: z.object({
      parsedDate: z.string().optional().describe('The parsed date in YYYY-MM-DD or YYYY-MM format. Empty if unparseable or rolling.'),
    }),
  },
  prompt: `You are a date parsing expert. 
  Given a raw deadline string and today's date, return the deadline in YYYY-MM-DD or YYYY-MM format.
  If the deadline is "rolling" or unclear, return an empty string.
  
  Today's Date: {{today}}
  Raw Deadline: {{rawDeadline}}
  `,
});

const rawExtractPrompt = ai.definePrompt({
  name: 'rawExtractPrompt',
  input: { schema: ExtractOpportunityDetailsInputSchema },
  output: { schema: RawExtractionSchema },
  prompt: `You are an expert at extracting key details from documents related to scholarships and opportunities.
  
  Extract:
  - name: Name of the opportunity.
  - details: Summary of key details.
  - rawDeadline: The deadline exactly as mentioned or described in the text.
  
  Document: {{media url=documentDataUri}}
  `,
});

export const extractOpportunityDetailsFlow = ai.defineFlow(
  {
    name: 'extractOpportunityDetailsFlow',
    inputSchema: ExtractOpportunityDetailsInputSchema,
    outputSchema: ExtractOpportunityDetailsOutputSchema,
  },
  async (input) => {
    // Layer 1: Extract Raw Info
    const { output: rawData } = await rawExtractPrompt(input);

    if (!rawData) {
      throw new Error('Failed to extract raw data');
    }

    let structuredDeadline = '';

    // Layer 2: Parse Date if rawDeadline exists
    if (rawData.rawDeadline && rawData.rawDeadline.trim() !== '') {
      const today = format(new Date(), 'yyyy-MM-dd');
      const { output: dateResult } = await parseDatePrompt({
        rawDeadline: rawData.rawDeadline,
        today,
      });
      structuredDeadline = dateResult?.parsedDate || '';
    }

    return {
      name: rawData.name,
      details: rawData.details,
      deadline: structuredDeadline,
    };
  }
);

export async function extractOpportunityDetails(
  input: ExtractOpportunityDetailsInput
): Promise<ExtractOpportunityDetailsOutput> {
  return extractOpportunityDetailsFlow(input);
}
