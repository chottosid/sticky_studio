'use server';

import { GoogleGenAI } from '@google/genai';
import { OpportunityCategory } from '@/lib/types';

// Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Models to try in order (primary -> fallbacks)
const MODELS = [
  'gemini-3-flash-preview',
  'gemini-2.5-flash-preview',
  'gemini-2.5-flash-lite-preview',
];

// Helper: try a model with JSON response (text only)
async function tryModel(modelName: string, system: string, user: string): Promise<Record<string, unknown>> {
  const response = await ai.models.generateContent({
    model: modelName,
    contents: `${system}\n\n${user}`,
    config: {
    responseMimeType: 'application/json',
    temperature: 0,
  },
  });

  const text = response.text;
  if (!text) {
    console.error('Empty response from model:', modelName);
    throw new Error('Empty response from AI model');
  }

  try {
    return JSON.parse(text);
  } catch (parseError) {
    console.error('Failed to parse JSON response:', text);
    throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
  }
}

// Helper: try a model with image support
async function tryModelWithImage(modelName: string, system: string, imageDataUri: string, prompt: string): Promise<Record<string, unknown>> {
  // Extract base64 data and mime type from data URI
  const [metadata, base64Data] = imageDataUri.split(';base64,');
  const mimeType = metadata.replace('data:', '');

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      {
        role: 'user',
        parts: [
          { text: `${system}\n\n${prompt}` },
          {
            inlineData: {
                mimeType,
                data: base64Data,
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      temperature: 0,
    },
  });

  const text = response.text;
  if (!text) {
    console.error('Empty response from model with image:', modelName);
    throw new Error('Empty response from AI model');
  }

  try {
    return JSON.parse(text);
  } catch (parseError) {
    console.error('Failed to parse JSON response from image:', text);
    throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
  }
}

// Helper: call Gemini with fallback models
async function ask(system: string, user: string): Promise<Record<string, unknown>> {
  let lastError: Error | null = null;

  for (const modelName of MODELS) {
    try {
      return await tryModel(modelName, system, user);
    } catch (error) {
      lastError = error as Error;
      const errorMessage = (error as Error).message || String(error);
      const isRateLimit = errorMessage.includes('429') || errorMessage.includes('quota');
      if (isRateLimit) {
        console.warn(`Model ${modelName} rate limited, trying next...`);
        continue;
      }
      console.error(`Model ${modelName} failed:`, error);
      throw error;
    }
  }

  throw lastError || new Error('All models failed');
}

// Helper: call Gemini with image and fallback models
async function askWithImage(system: string, imageDataUri: string, prompt: string): Promise<Record<string, unknown>> {
  let lastError: Error | null = null;

  for (const modelName of MODELS) {
    try {
      return await tryModelWithImage(modelName, system, imageDataUri, prompt);
    } catch (error) {
      lastError = error as Error;
      const errorMessage = (error as Error).message || String(error);
      const isRateLimit = errorMessage.includes('429') || errorMessage.includes('quota');
      if (isRateLimit) {
        console.warn(`Model ${modelName} rate limited, trying next...`);
        continue;
      }
      console.error(`Model ${modelName} failed:`, error);
      throw error;
    }
  }

  throw lastError || new Error('All models failed');
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
    data = await askWithImage(system, input.documentDataUri, text);
  } else {
    data = await ask(system, text);
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

  const data = await ask(system, input.documentText);
  return { deadline: (data.deadline as string) || undefined };
}
