import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ASSESSMENT_VERSION, type CandidateProfile } from '@/domain/opportunity/assessment';
import { OpportunityInputSchema } from '@/domain/opportunity/schema';
import { assessFit } from '@/ai/fit-assessment';
import { query } from './db';
import { refreshProfiles } from './profiles';
import { getOpportunityById } from './data';
import { assessOpportunities } from './assessments';

vi.mock('server-only', () => ({}));
vi.mock('./db', () => ({ query: vi.fn() }));
vi.mock('./profiles', () => ({ refreshProfiles: vi.fn() }));
vi.mock('./data', () => ({ getOpportunityById: vi.fn() }));
vi.mock('@/ai/fit-assessment', () => ({ assessFit: vi.fn() }));

const profiles: CandidateProfile[] = ['swarup', 'archita'].map((id) => ({
  id: id as CandidateProfile['id'], name: id, website: `https://${id}.example`,
  text: 'A completed CSE degree and ML research.', additionalContext: '', contentHash: id,
  fetchedAt: null, fetchError: null,
}));
const decision = { tier: 'P2' as const, eligibility: 'unclear' as const, fit: 'good' as const,
  confidence: 'medium' as const, summary: 'Adjacent research fit.', strengths: [], gaps: [],
  profileEvidence: [], nextStep: 'Confirm the current intake.' };
const current = Object.fromEntries(profiles.map((profile) => [profile.id, { ...decision,
  profileHash: profile.contentHash, contentRevision: 1, assessedAt: new Date().toISOString(),
  policyVersion: ASSESSMENT_VERSION, model: 'openai/gpt-6-luna-pro',
}]));
const result = (rows: Record<string, unknown>[], rowCount = rows.length) =>
  ({ rows, rowCount } as Awaited<ReturnType<typeof query>>);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(refreshProfiles).mockResolvedValue(profiles);
});

describe('assessment work claims', () => {
  it('does not pay for an AI call if another worker already completed a queued ID', async () => {
    vi.mocked(query).mockResolvedValueOnce(result([{ id: 7, content_revision: 1, profile_assessments: current }]));
    expect(await assessOpportunities(['7'])).toEqual({ assessed: 0, skipped: 1 });
    expect(assessFit).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('compares the saved snapshot when claiming to handle completion between read and claim', async () => {
    vi.mocked(query).mockResolvedValueOnce(result([{ id: 7, content_revision: 2, profile_assessments: current }]))
      .mockResolvedValueOnce(result([]));
    expect(await assessOpportunities(['7'])).toEqual({ assessed: 0, skipped: 1 });
    expect(assessFit).not.toHaveBeenCalled();
    expect(vi.mocked(query).mock.calls[1][0]).toContain('o.profile_assessments=requested.assessments');
  });

  it('allows an explicit reassessment and discards results when the opportunity changed', async () => {
    vi.mocked(query).mockResolvedValueOnce(result([{ id: 7, content_revision: 1, profile_assessments: current }]))
      .mockResolvedValueOnce(result([{ id: 7 }]))
      .mockResolvedValueOnce(result([], 0))
      .mockResolvedValueOnce(result([], 1));
    vi.mocked(getOpportunityById).mockResolvedValue({
      ...OpportunityInputSchema.parse({ name: 'ML PhD', category: 'higher-study' }),
      id: '7', sources: [], contentRevision: 1,
    });
    vi.mocked(assessFit).mockResolvedValue([{ opportunityId: '7',
      candidates: profiles.map((profile) => ({ ...decision, candidateId: profile.id })),
    }]);
    expect(await assessOpportunities(['7'], true)).toEqual({ assessed: 0, skipped: 1 });
    expect(assessFit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(query).mock.calls[2][0]).toContain('content_revision=$3');
    expect(vi.mocked(query).mock.calls.at(-1)![0]).toContain('assessment_claimed_until=NULL');
  });
});
