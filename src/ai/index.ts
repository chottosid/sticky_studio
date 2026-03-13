'use server';

import { GoogleGenAI } from '@google/genai';
import { OpportunityCategory } from '@/lib/types';

// Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Use Gemma 3 27B (higher rate limits)
const MODEL = 'gemma-3-27b-it';

// Helper: strip markdown code blocks from response
function stripMarkdown(text: string): string {
  // Remove ```json ... ``` or ``` ... ``` blocks
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/,'');
  }
  return cleaned.trim();
}

// Helper: try model with JSON response
async function tryModel(system: string, user: string): Promise<Record<string, unknown>> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `${system}\n\n${user}\n\nReturn ONLY valid JSON, no markdown code blocks.`,
  });

  const text = response.text;
  if (!text) {
    console.error('Empty response from model:', MODEL);
    throw new Error('Empty response from AI model');
  }

  const cleanedText = stripMarkdown(text);

  try {
    return JSON.parse(cleanedText);
  } catch (parseError) {
    console.error('Failed to parse JSON response:', cleanedText);
    throw new Error(`Invalid JSON response: ${cleanedText.substring(0, 100)}`);
  }
}

// Helper: try model with image support
async function tryModelWithImage(system: string, imageDataUri: string, prompt: string): Promise<Record<string, unknown>> {
  // Extract base64 data and mime type from data URI
  const [metadata, base64Data] = imageDataUri.split(';base64,');
  const mimeType = metadata.replace('data:', '');

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: `${system}\n\n${prompt}\n\nReturn ONLY valid JSON, no markdown code blocks.` },
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
        ],
      },
    ],
  });

  const text = response.text;
  if (!text) {
    console.error('Empty response from model with image:', MODEL);
    throw new Error('Empty response from AI model');
  }

  const cleanedText = stripMarkdown(text);

  try {
    return JSON.parse(cleanedText);
  } catch (parseError) {
    console.error('Failed to parse JSON response from image:', cleanedText);
    throw new Error(`Invalid JSON response: ${cleanedText.substring(0, 100)}`);
  }
}

// Helper: build message content from data URI
function buildContent(dataUri: string, prompt: string): { isImage: boolean; text: string } {
  if (dataUri.startsWith('data:image/')) {
    return { isImage: true, text: prompt };
  }
  // For text/PDF, decode and include in prompt
  if (dataUri.includes(';base64,')) {
    const decoded = Buffer.from(dataUri.split(';base64,')[1], 'base64').toString('utf-8');
    return { isImage: false, text: `${prompt}\n\n${decoded}` };
  }
  return { isImage: false, text: prompt };
}

// Types
export type ExtractedOpportunity = {
  name: string;
  details: string;
  deadline?: string;
  category: OpportunityCategory;
};

// Main function: extract opportunity details from document
export async function extractOpportunityDetails(input: { documentDataUri: string }): Promise<ExtractedOpportunity> {
  const today = new Date().toISOString().split('T')[0];

  const system = `Extract opportunity details from documents. Return JSON with:
- name: opportunity title
- details: key information summary
- deadline: date in YYYY-MM-DD format (or empty if none/rolling)
- category: one of "job", "internship", "contest", or "higher-study"

Category guidelines:
- "job": Full-time employment positions, career opportunities
- "internship": Student internships, summer programs, co-ops
- "contest": Competitions, hackathons, challenges, awards
- "higher-study": PhD positions, masters programs, scholarships, fellowships, research opportunities

Today is ${today}. Parse relative dates like "next Friday" into exact dates.`;

  const { isImage, text } = buildContent(input.documentDataUri, 'Extract details from this document:');

  let data: Record<string, unknown>;

  if (isImage) {
    data = await tryModelWithImage(system, input.documentDataUri, text);
  } else {
    data = await tryModel(system, text);
  }

  return {
    name: (data.name as string) || '',
    details: (data.details as string) || '',
    deadline: (data.deadline as string) || undefined,
    category: validateCategory(data.category),
  };
}

// Validate and normalize category
function validateCategory(category: unknown): OpportunityCategory {
  const validCategories: OpportunityCategory[] = ['job', 'internship', 'contest', 'higher-study'];
  if (typeof category === 'string' && validCategories.includes(category as OpportunityCategory)) {
    return category as OpportunityCategory;
  }
  return 'job'; // Default fallback
}

// Extract deadline from text
export async function trackApplicationDeadlines(input: { documentText: string }): Promise<{ deadline?: string }> {
  const today = new Date().toISOString().split('T')[0];

  const system = `Extract the deadline from text. Return JSON: { "deadline": "YYYY-MM-DD" }
Today is ${today}. Return empty deadline if none found.`;

  const data = await tryModel(system, input.documentText);
  return { deadline: (data.deadline as string) || undefined };
}
