'use server';

import OpenAI from 'openai';

// OpenRouter client
const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

// Helper: call AI with JSON response
async function ask(system: string, user: string): Promise<Record<string, unknown>> {
  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  });
  return JSON.parse(res.choices[0]?.message?.content || '{}');
}

// Helper: build message content from data URI
function buildContent(dataUri: string, prompt: string) {
  if (dataUri.startsWith('data:image/')) {
    return [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: dataUri } },
    ];
  }
  // For text/PDF, decode and include in prompt
  if (dataUri.includes(';base64,')) {
    const decoded = Buffer.from(dataUri.split(';base64,')[1], 'base64').toString('utf-8');
    return `${prompt}\n\n${decoded}`;
  }
  return prompt;
}

// Valid categories
type OpportunityCategory = 'job' | 'internship' | 'contest' | 'higher-study';

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

  const user = buildContent(input.documentDataUri, 'Extract details from this document:');

  // For images, use vision
  if (input.documentDataUri.startsWith('data:image/')) {
    const res = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user as unknown as string },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });
    const data = JSON.parse(res.choices[0]?.message?.content || '{}');
    return {
      name: data.name || '',
      details: data.details || '',
      deadline: data.deadline || undefined,
      category: validateCategory(data.category)
    };
  }

  const data = await ask(system, user as string);
  return {
    name: (data.name as string) || '',
    details: (data.details as string) || '',
    deadline: (data.deadline as string) || undefined,
    category: validateCategory(data.category)
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
