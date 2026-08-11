'use server';

import { GoogleGenAI } from '@google/genai';
import { OpportunityCategory } from '@/lib/types';

// Model configuration
const OPENROUTER_MODEL = 'google/gemini-2.5-flash';
const GEMINI_MODEL = 'gemini-3.5-flash';

// Gemini client (fallback)
const geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Helper: strip markdown code blocks from response
function stripMarkdown(text: string): string {
  let cleaned = text.trim();

  // Remove ```json ... ``` or ``` ... ``` blocks
  if (cleaned.startsWith('```')) {
    // Remove opening ```json or ```
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');
    // Remove closing ```
    const lastBacktickIndex = cleaned.lastIndexOf('```');
    if (lastBacktickIndex !== -1) {
      cleaned = cleaned.substring(0, lastBacktickIndex);
    }
  }

  return cleaned.trim();
}

// Helper: extract first object from potentially array response
function extractObject(data: unknown): Record<string, unknown> {
  if (Array.isArray(data) && data.length > 0) {
    return data[0] as Record<string, unknown>;
  }
  if (typeof data === 'object' && data !== null) {
    return data as Record<string, unknown>;
  }
  return {};
}

// Helper: parse JSON response
function parseJsonResponse(text: string): Record<string, unknown> {
  const cleanedText = stripMarkdown(text);
  try {
    const parsed = JSON.parse(cleanedText);
    return extractObject(parsed);
  } catch (parseError) {
    console.error('Failed to parse JSON response:', cleanedText);
    throw new Error(`Invalid JSON response: ${cleanedText.substring(0, 100)}`);
  }
}

// OpenRouter API call (text only)
async function callOpenRouterText(system: string, user: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `${user}\n\nReturn ONLY valid JSON object (not array), no markdown code blocks.` },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenRouter');
  }
  return content;
}

// OpenRouter API call (with image)
async function callOpenRouterImage(system: string, imageDataUri: string, prompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageDataUri } },
            { type: 'text', text: `${prompt}\n\nReturn ONLY valid JSON, no markdown code blocks.` },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenRouter');
  }
  return content;
}

// Gemini API call (text only)
async function callGeminiText(system: string, user: string): Promise<string> {
  const response = await geminiClient.models.generateContent({
    model: GEMINI_MODEL,
    contents: `${system}\n\n${user}\n\nReturn ONLY valid JSON object (not array), no markdown code blocks.`,
  });

  const text = response.text;
  if (!text) {
    throw new Error('Empty response from Gemini');
  }
  return text;
}

// Gemini API call (with image)
async function callGeminiImage(system: string, imageDataUri: string, prompt: string): Promise<string> {
  const [metadata, base64Data] = imageDataUri.split(';base64,');
  const mimeType = metadata.replace('data:', '');

  const response = await geminiClient.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      { inlineData: { mimeType, data: base64Data } },
      { text: `${system}\n\n${prompt}\n\nReturn ONLY valid JSON, no markdown code blocks.` },
    ],
  });

  const text = response.text;
  if (!text) {
    throw new Error('Empty response from Gemini');
  }
  return text;
}

// Helper: try model with JSON response (OpenRouter first, Gemini fallback)
async function tryModel(system: string, user: string): Promise<Record<string, unknown>> {
  // Try OpenRouter first
  try {
    console.log('Trying OpenRouter:', OPENROUTER_MODEL);
    const text = await callOpenRouterText(system, user);
    return parseJsonResponse(text);
  } catch (error) {
    console.error('OpenRouter failed, falling back to Gemini:', error instanceof Error ? error.message : error);
  }

  // Fallback to Gemini
  console.log('Falling back to Gemini:', GEMINI_MODEL);
  const text = await callGeminiText(system, user);
  return parseJsonResponse(text);
}

// Helper: try model with image support (OpenRouter first, Gemini fallback)
async function tryModelWithImage(system: string, imageDataUri: string, prompt: string): Promise<Record<string, unknown>> {
  // Try OpenRouter first
  try {
    console.log('Trying OpenRouter with image:', OPENROUTER_MODEL);
    const text = await callOpenRouterImage(system, imageDataUri, prompt);
    return parseJsonResponse(text);
  } catch (error) {
    console.error('OpenRouter failed, falling back to Gemini:', error instanceof Error ? error.message : error);
  }

  // Fallback to Gemini
  console.log('Falling back to Gemini with image:', GEMINI_MODEL);
  const text = await callGeminiImage(system, imageDataUri, prompt);
  return parseJsonResponse(text);
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
