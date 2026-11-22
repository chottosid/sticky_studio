import { beforeEach, expect, it, vi } from 'vitest';
import { query } from './db';
import { runAgent } from './agent-actions';
import { isAuthenticated } from './actions';
import { searchOpportunities, draftOutreach } from '@/ai/agent';

vi.mock('server-only', () => ({}));
vi.mock('./db', () => ({ query: vi.fn() }));
vi.mock('./actions', () => ({ isAuthenticated: vi.fn() }));
vi.mock('./data', () => ({ getOpportunityById: vi.fn() }));
vi.mock('./profiles', () => ({ getCandidateProfiles: vi.fn() }));
vi.mock('./deadlines', async (importOriginal) => ({ ...await importOriginal<typeof import('./deadlines')>(), appToday: () => '2026-11-22' }));
vi.mock('@/ai/agent', () => ({ searchOpportunities: vi.fn(), draftOutreach: vi.fn(), AgentProviderError: class extends Error {} }));

const result = (rows: Record<string, unknown>[]) => ({ rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(isAuthenticated).mockResolvedValue(true);
});

it('requires sign-in and plans from the ledger without an AI request', async () => {
  vi.mocked(isAuthenticated).mockResolvedValueOnce(false);
  expect(await runAgent({ kind: 'week', candidate: 'swarup' })).toMatchObject({ success: false });
  expect(query).not.toHaveBeenCalled();

  vi.mocked(query).mockResolvedValueOnce(result([{ id: '4', postingStatus: 'unknown', name: 'Apply', deadline: '2026-11-24', result: null }]));
  expect(await runAgent({ kind: 'week', candidate: 'swarup' })).toMatchObject({
    success: true, result: { kind: 'week', tasks: [{ id: '4', deadline: '2026-11-24', action: { kind: 'prepare' } }] },
  });
  expect(searchOpportunities).not.toHaveBeenCalled();
  expect(draftOutreach).not.toHaveBeenCalled();
});

it('filters uncited research, checks saved links, and leaves unsupported fields for review', async () => {
  const lead = {
    name: 'PhD opening', category: 'higher-study' as const, summary: 'Funded position', organization: 'Example University',
    sourceUrl: 'https://example.edu/phd', deadline: '2026-12-01', contactEmail: 'example@school.edu',
  };
  vi.mocked(searchOpportunities).mockResolvedValueOnce({
    output: { opportunities: [lead, { ...lead, name: 'Uncited', sourceUrl: 'https://example.edu/another' }] },
    citations: [{ url: `${lead.sourceUrl}?utm_campaign=test`, content: 'Published December 1, 2026. Contact notexample@school.edu.' }],
  });
  vi.mocked(query).mockResolvedValueOnce(result([{ profile_text: 'Public portfolio' }]))
    .mockResolvedValueOnce(result([{ canonical_url: lead.sourceUrl, id: 9, name: 'Saved opening' }]));

  const response = await runAgent({ kind: 'research', query: 'Funded PhDs', candidate: 'archita' });
  expect(response).toMatchObject({ success: true, result: { kind: 'research', proposals: [{ existing: { id: '9' }, draft: {
    opportunities: [{ opportunity: { name: lead.name, deadline: null, contactEmail: null } }],
    warnings: ['Reported deadline 2026-12-01 needs verification.', 'Reported contact example@school.edu needs verification.'],
  } }] } });
  expect(searchOpportunities).toHaveBeenCalledWith('Funded PhDs', '2026-11-22', 'Public portfolio');
  expect(vi.mocked(query).mock.calls.every(([sql]) => sql.trim().startsWith('SELECT'))).toBe(true);
});
