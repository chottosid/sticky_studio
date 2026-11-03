import type { z } from 'zod';
import { RawExtractionSchema, rawExtractionJsonSchema, type RawExtraction } from './contracts';
import type { PreparedSource } from './input';
import { EXTRACTION_SYSTEM_INSTRUCTION, imageSourceMarker, sourceBlock } from './prompt';

export const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-6-luna-pro';
export const getOpenRouterModel = () => process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;

type StructuredRequest<T> = {
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  schema: z.ZodType<T>;
  systemInstruction: string;
};

function parseStructuredResponse<T>(text: string, schema: z.ZodType<T>): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return schema.parse(JSON.parse(cleaned));
}

export async function openRouterText(
  content: string | Array<Record<string, unknown>>,
  request: Omit<StructuredRequest<unknown>, 'schema'>,
): Promise<string> {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not configured.');
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002',
      'X-Title': 'Sticky Studio',
    },
    body: JSON.stringify({
      model: getOpenRouterModel(),
      messages: [{ role: 'system', content: request.systemInstruction }, { role: 'user', content }],
      response_format: { type: 'json_schema', json_schema: {
        name: request.schemaName, strict: true, schema: request.jsonSchema,
      } },
      provider: { require_parameters: true },
      // Pro-mode reasoning uses output tokens too. No temperature: it is not a supported Luna parameter.
      max_tokens: 16_384,
      reasoning: { exclude: true },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(`OpenRouter returned ${response.status}: ${body.error?.message?.slice(0, 300) || 'Request failed'}`);
  }
  const result = await response.json() as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }> };
  const choice = result.choices?.[0];
  if (!choice?.message?.content) throw new Error('OpenRouter returned no structured answer. Try again with a smaller batch.');
  if (choice.finish_reason === 'length') throw new Error('The model reached its output limit. Try a smaller batch.');
  return choice.message.content;
}

export async function generateStructuredText<T>(prompt: string, request: StructuredRequest<T>): Promise<T> {
  return parseStructuredResponse(await openRouterText(prompt, request), request.schema);
}

export async function extractWithProvider(sources: PreparedSource[], instructions: string): Promise<RawExtraction> {
  const content: Array<Record<string, unknown>> = [{
    type: 'text', text: sources.filter((source) => source.text).map((source) =>
      sourceBlock({ id: source.id, label: source.label, text: source.text! }),
    ).join('\n\n'),
  }];
  for (const source of sources) {
    if (!source.imageDataUri) continue;
    content.push({ type: 'text', text: imageSourceMarker(source) });
    content.push({ type: 'image_url', image_url: { url: source.imageDataUri } });
  }
  const raw = await openRouterText(content, {
    schemaName: 'opportunity_extraction', jsonSchema: rawExtractionJsonSchema,
    systemInstruction: `${EXTRACTION_SYSTEM_INSTRUCTION}\n\n${instructions}`,
  });
  return parseStructuredResponse(raw, RawExtractionSchema);
}
