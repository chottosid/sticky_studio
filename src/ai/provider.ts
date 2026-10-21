import { GoogleGenAI, type Content, type Part } from '@google/genai';
import type { z } from 'zod';
import { RawExtractionSchema, rawExtractionJsonSchema, type RawExtraction } from './contracts';
import type { PreparedSource } from './input';
import { EXTRACTION_SYSTEM_INSTRUCTION, imageSourceMarker, sourceBlock } from './prompt';

const DEFAULT_OPENROUTER_MODEL = 'google/gemini-2.5-flash';
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

function stripMarkdown(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

type StructuredRequest<T> = {
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  schema: z.ZodType<T>;
  systemInstruction: string;
};

function parseStructuredResponse<T>(text: string, schema: z.ZodType<T>): T {
  const parsed: unknown = JSON.parse(stripMarkdown(text));
  return schema.parse(parsed);
}

function textContext(sources: PreparedSource[]): string {
  const blocks = sources.flatMap((source) => (
    source.text ? [sourceBlock({ id: source.id, label: source.label, text: source.text })] : []
  ));
  return `Extract opportunities from the sources below.\n\n${blocks.join('\n\n')}`;
}

function openRouterContent(sources: PreparedSource[]) {
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: textContext(sources) }];
  for (const source of sources) {
    if (!source.imageDataUri) continue;
    content.push({ type: 'text', text: imageSourceMarker(source) });
    content.push({ type: 'image_url', image_url: { url: source.imageDataUri } });
  }
  return content;
}

async function openRouterCompletion(
  model: string,
  userContent: string | Array<Record<string, unknown>>,
  request: Omit<StructuredRequest<unknown>, 'schema'>,
): Promise<Response> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured.');

  return fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: request.systemInstruction },
        { role: 'user', content: userContent },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: request.schemaName,
          strict: true,
          schema: request.jsonSchema,
        },
      },
      temperature: 0,
    }),
    signal: AbortSignal.timeout(45_000),
  });
}

async function callOpenRouterRaw(
  userContent: string | Array<Record<string, unknown>>,
  request: Omit<StructuredRequest<unknown>, 'schema'>,
): Promise<string> {
  const configuredModel = process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
  let response = await openRouterCompletion(configuredModel, userContent, request);

  // Configured models can be retired upstream (e.g. stealth models removed from
  // OpenRouter); fall back to the default instead of failing the request.
  if (response.status === 404 && configuredModel !== DEFAULT_OPENROUTER_MODEL) {
    response = await openRouterCompletion(DEFAULT_OPENROUTER_MODEL, userContent, request);
  }

  if (!response.ok) {
    const errorText = (await response.text()).slice(0, 500);
    throw new Error(`OpenRouter returned ${response.status}: ${errorText}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter returned an empty response.');
  return content;
}

async function callGeminiRaw(
  contents: Content[] | string,
  request: Omit<StructuredRequest<unknown>, 'schema'>,
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured.');
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await client.models.generateContent({
    model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    contents,
    config: {
      systemInstruction: request.systemInstruction,
      responseMimeType: 'application/json',
      responseJsonSchema: request.jsonSchema,
      temperature: 0,
    },
  });

  if (!response.text) throw new Error('Gemini returned an empty response.');
  return response.text;
}

const baseExtractionRequest = {
  schemaName: 'opportunity_extraction',
  jsonSchema: rawExtractionJsonSchema,
  systemInstruction: EXTRACTION_SYSTEM_INSTRUCTION,
};

// Rules live in the system instruction; the user turn carries only source data.
function extractionRequest(instructions: string) {
  return { ...baseExtractionRequest, systemInstruction: `${EXTRACTION_SYSTEM_INSTRUCTION}\n\n${instructions}` };
}

async function callOpenRouter(sources: PreparedSource[], instructions: string): Promise<string> {
  return callOpenRouterRaw(openRouterContent(sources), extractionRequest(instructions));
}

async function callGemini(sources: PreparedSource[], instructions: string): Promise<string> {
  const parts: Part[] = [{ text: textContext(sources) }];
  for (const source of sources) {
    if (!source.imageDataUri) continue;
    const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(source.imageDataUri);
    if (!match) continue;
    parts.push({ text: imageSourceMarker(source) });
    parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
  }
  return callGeminiRaw([{ role: 'user', parts }], extractionRequest(instructions));
}

async function repairWithGemini(rawResponse: string): Promise<RawExtraction> {
  const response = await callGeminiRaw(
    `Repair this extraction into the required schema without adding facts:\n\n${rawResponse.slice(0, 50_000)}`,
    baseExtractionRequest,
  );
  return parseStructuredResponse(response, RawExtractionSchema);
}

export async function extractWithProvider(sources: PreparedSource[], instructions: string): Promise<RawExtraction> {
  const errors: string[] = [];

  for (const provider of [callOpenRouter, callGemini]) {
    let rawResponse = '';
    try {
      rawResponse = await provider(sources, instructions);
      return parseStructuredResponse(rawResponse, RawExtractionSchema);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      if (rawResponse) {
        try {
          return await repairWithGemini(rawResponse);
        } catch (repairError) {
          errors.push(repairError instanceof Error ? repairError.message : String(repairError));
        }
      }
    }
  }

  throw new Error(`All extraction providers failed: ${errors.join(' | ')}`);
}

export async function generateStructuredText<T>(
  prompt: string,
  request: StructuredRequest<T>,
): Promise<T> {
  const errors: string[] = [];
  const providerCalls = [
    () => callOpenRouterRaw(prompt, request),
    () => callGeminiRaw(prompt, request),
  ];
  for (const callProvider of providerCalls) {
    try {
      return parseStructuredResponse(await callProvider(), request.schema);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`All structured-output providers failed: ${errors.join(' | ')}`);
}
