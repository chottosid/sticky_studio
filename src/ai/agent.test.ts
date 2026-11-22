import { afterEach, describe, expect, it, vi } from 'vitest';
import { draftOutreach, searchOpportunities } from './agent';

vi.mock('server-only', () => ({}));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const monthlyKey = { data: { limit: 2, limit_reset: 'monthly', limit_remaining: 1 } };

describe('agent OpenRouter requests', () => {
  it('stops before inference if the key is uncapped or exhausted', async () => {
    vi.stubEnv('OPENROUTER_AGENT_API_KEY', 'agent-key');
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ data: { limit: null } }))
      .mockResolvedValueOnce(Response.json({ data: { ...monthlyKey.data, limit_remaining: 0 } }));
    vi.stubGlobal('fetch', fetcher);

    await expect(draftOutreach({})).rejects.toThrow('monthly credit limit');
    await expect(draftOutreach({})).rejects.toThrow('reached its monthly credit limit');
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['https://openrouter.ai/api/v1/key', 'https://openrouter.ai/api/v1/key']);
  });

  it('performs one bounded search completion and reads provider citations', async () => {
    vi.stubEnv('OPENROUTER_AGENT_API_KEY', 'agent-key');
    const citation = { url: 'https://example.edu/phd', content: 'Application deadline December 1, 2026.' };
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(monthlyKey)).mockResolvedValueOnce(Response.json({
      choices: [{ message: { content: '{"opportunities":[]}', annotations: [{ type: 'url_citation', url_citation: citation }] } }],
    }));
    vi.stubGlobal('fetch', fetcher);

    await expect(searchOpportunities('Funded PhDs', '2026-11-22', '')).resolves.toMatchObject({ citations: [citation] });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, request] = fetcher.mock.calls[1];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(JSON.parse(request.body)).toMatchObject({
      max_tokens: 2_500,
      max_tool_calls: 1,
      tools: [{ type: 'openrouter:web_search', parameters: { engine: 'exa', max_results: 5, max_uses: 1 } }],
    });
  });

  it('drafts without enabling web search and reports provider failures', async () => {
    vi.stubEnv('OPENROUTER_AGENT_API_KEY', 'agent-key');
    const draft = { subject: 'Research inquiry', body: 'Dear hiring team,\nI am interested in the role.' };
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(monthlyKey)).mockResolvedValueOnce(Response.json({
      choices: [{ message: { content: JSON.stringify(draft) } }],
    })).mockResolvedValueOnce(Response.json(monthlyKey)).mockResolvedValueOnce(new Response(null, { status: 429 }));
    vi.stubGlobal('fetch', fetcher);

    await expect(draftOutreach({})).resolves.toEqual(draft);
    const request = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(request).not.toHaveProperty('tools');
    expect(request.plugins).toEqual([{ id: 'web', enabled: false }]);
    await expect(draftOutreach({})).rejects.toThrow('OpenRouter could not complete');
  });
});
