import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { generateStructuredText } from './provider';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const request = {
  schemaName: 'test', schema: z.object({ ok: z.boolean() }),
  jsonSchema: { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } },
  systemInstruction: 'Return a structured decision.',
};

describe('selected OpenRouter model', () => {
  it('uses Luna Pro with strict JSON and no unsupported temperature parameter', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key'); vi.stubEnv('OPENROUTER_MODEL', '');
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }] })));
    vi.stubGlobal('fetch', fetcher);
    expect(await generateStructuredText('input', request)).toEqual({ ok: true });
    const [url, options] = fetcher.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(body.model).toBe('openai/gpt-6-luna-pro');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body).not.toHaveProperty('temperature');
  });
  it('preserves a configured model and never silently falls back to Gemini', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key'); vi.stubEnv('GEMINI_API_KEY', 'unused');
    vi.stubEnv('OPENROUTER_MODEL', 'openai/gpt-6-luna-pro');
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Not available' } }), { status: 404 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(generateStructuredText('input', request)).rejects.toThrow('OpenRouter returned 404');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
