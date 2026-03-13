'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { OpportunityCategory } from '@/lib/types';

// Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Use Gemini 2.0 Flash (fast and free tier available)
const MODEL = 'gemini-2.0-flash';

// Helper: call Gemini with JSON response
async function ask(system: string, user: string): Promise<Record<string, unknown>> {
  const model = genAI.getGenerativeModel({ model: MODEL });

  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [{ text: `${system}\n\n${user}` }],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
    },
  });

  const response = result.response.text();
  return JSON.parse(response || '{}');
}

// Helper: call Gemini with image support
async function askWithImage(system: string, imageDataUri: string, prompt: string): Promise<Record<string, unknown>> {
  const model = genAI.getGenerativeModel({ model: MODEL });

  // Extract base64 data and mime type from data URI
  const [metadata, base64Data] = imageDataUri.split(';base64,');
  const mimeType = metadata.replace('data:', '');

  const result = await model.generateContent({
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
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
    },
  });

  const response = result.response.text();
  return JSON.parse(response || '{}');
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
