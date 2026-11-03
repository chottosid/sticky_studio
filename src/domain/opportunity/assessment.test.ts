import { describe, expect, it } from 'vitest';
import { ASSESSMENT_VERSION, assessmentIsCurrent, normalizeDecision, parseAssessments, type ProfileAssessment } from './assessment';

const assessment: ProfileAssessment = {
  tier: 'P1', eligibility: 'unclear', fit: 'strong', confidence: 'medium', summary: 'Direct match; verify tests.',
  strengths: ['Relevant project'], gaps: ['Unknown GRE'], profileEvidence: ['Portfolio research'], nextStep: 'Verify requirements.',
  profileHash: 'profile-1', contentRevision: 3, assessedAt: '2026-11-03T00:00:00.000Z',
  policyVersion: ASSESSMENT_VERSION, model: 'openai/gpt-6-luna-pro',
};
const now = Date.parse('2026-11-03T01:00:00Z');

describe('profile-specific assessment validity', () => {
  it('invalidates a priority after either the announcement or the applicant changes', () => {
    expect(assessmentIsCurrent(assessment, 3, 'profile-1', now)).toBe(true);
    expect(assessmentIsCurrent(assessment, 4, 'profile-1', now)).toBe(false);
    expect(assessmentIsCurrent(assessment, 3, 'archita-profile', now)).toBe(false);
    expect(assessmentIsCurrent(assessment, 3, '', now)).toBe(false);
  });
  it('does not keep old model judgments current indefinitely or accept a future date', () => {
    expect(assessmentIsCurrent(assessment, 3, 'profile-1', now + 8 * 86400000)).toBe(false);
    expect(assessmentIsCurrent(assessment, 3, 'profile-1', now - 86400000)).toBe(false);
    expect(assessmentIsCurrent({ ...assessment, policyVersion: 'old' }, 3, 'profile-1', now)).toBe(false);
  });
  it('keeps one corrupt result from erasing the other applicant’s valid result', () => {
    expect(parseAssessments({ swarup: assessment, archita: { tier: 'P1' } })).toEqual({ swarup: assessment });
  });
  it('treats known ineligibility as a gate and does not elevate low-confidence fits to P1', () => {
    expect(normalizeDecision({ ...assessment, eligibility: 'ineligible' }).tier).toBe('ineligible');
    expect(normalizeDecision({ ...assessment, confidence: 'low' }).tier).toBe('P2');
    expect(normalizeDecision(assessment).tier).toBe('P1');
  });
});
