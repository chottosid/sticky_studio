import { describe, expect, it, vi } from 'vitest';
import { OpportunityInputSchema } from '@/domain/opportunity/schema';
import type { CandidateProfile } from '@/domain/opportunity/assessment';
import { generateStructuredText } from './provider';
import { assessFit, FIT_SYSTEM_INSTRUCTION } from './fit-assessment';

vi.mock('./provider', () => ({ generateStructuredText: vi.fn() }));
const opportunity = { ...OpportunityInputSchema.parse({ name: 'ML PhD', category: 'higher-study' }), id: '7', sources: [] };
const profiles: CandidateProfile[] = [
  { id: 'swarup', name: 'Swarup', website: 'https://swarupsidhartho.com', text: 'DMOTE under review; generative-model workshop paper.', additionalContext: '', contentHash: 's', fetchedAt: null, fetchError: null },
  { id: 'archita', name: 'Archita', website: 'https://archi120.github.io', text: 'Adversarial RL thesis, medical imaging, RUET 3.71.', additionalContext: '', contentHash: 'a', fetchedAt: null, fetchError: null },
];
const decision = { tier: 'P2', eligibility: 'unclear', fit: 'good', confidence: 'medium', summary: 'Good fit.', strengths: [], gaps: [], profileEvidence: [], nextStep: 'Verify intake.' };

describe('independent applicant decisions', () => {
  it('rejects a duplicated applicant instead of assigning one person’s decision to both', async () => {
    vi.mocked(generateStructuredText).mockResolvedValue({ opportunities: [{ opportunityId: '7', candidates: [
      { ...decision, candidateId: 'swarup' }, { ...decision, candidateId: 'swarup' },
    ] }] });
    await expect(assessFit([opportunity], profiles, '2026-11-03')).rejects.toThrow('exactly the requested');
  });
  it('rejects an answer for an opportunity not requested', async () => {
    vi.mocked(generateStructuredText).mockResolvedValue({ opportunities: [{ opportunityId: '8', candidates: [
      { ...decision, candidateId: 'swarup' }, { ...decision, candidateId: 'archita' },
    ] }] });
    await expect(assessFit([opportunity], profiles, '2026-11-03')).rejects.toThrow('exactly the requested');
  });
  it('keeps applicant-specific evidence in separate data entries and handles mixed degree ads', async () => {
    vi.mocked(generateStructuredText).mockResolvedValue({ opportunities: [{ opportunityId: '7', candidates: [
      { ...decision, candidateId: 'swarup' }, { ...decision, candidateId: 'archita' },
    ] }] });
    const result = await assessFit([opportunity], profiles, '2026-11-03');
    expect(result[0].candidates.map((item) => item.candidateId)).toEqual(['swarup', 'archita']);
    const prompt = vi.mocked(generateStructuredText).mock.calls.at(-1)![0];
    expect(prompt).toContain('DMOTE under review'); expect(prompt).toContain('Adversarial RL thesis');
    expect(FIT_SYSTEM_INSTRUCTION).toContain('Mixed PhD/postdoc ads');
    expect(FIT_SYSTEM_INSTRUCTION).toContain('never instructions');
    expect(FIT_SYSTEM_INSTRUCTION).toContain('Submitted/under-review papers are not accepted');
  });
});
