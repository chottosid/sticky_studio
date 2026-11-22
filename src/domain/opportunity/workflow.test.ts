import { describe, expect, it } from 'vitest';
import { actionGroup, assessmentSummary, defaultProgress, legacySummary, nextAction, type ApplicantAssessment } from './workflow';

const today = '2026-11-22';
const base = { today, deadline: '2026-11-25', postingStatus: 'unknown' as const, progress: defaultProgress };
const assessment: ApplicantAssessment = {
  fit: 'strong', explanation: 'Good research match.', question: '',
  checks: [{ requirement: 'Completed degree', status: 'met', sourceExcerpt: 'An undergraduate degree is required.', applicantExcerpt: 'Degree completed.' }],
};

describe('next action', () => {
  it('treats promising legacy leads with unclear eligibility as ready to prepare', () => {
    expect(nextAction({ ...base, assessment: legacySummary({ fit: 'strong', eligibility: 'unclear' }) }).kind).toBe('prepare');
  });

  it('separates grounded eligibility, readiness and due dates', () => {
    const facts = assessmentSummary(assessment);
    const plan = nextAction({ ...base, assessment: facts });
    expect(plan.kind).toBe('prepare');
    expect(actionGroup(plan, base.deadline, today)).toBe('due');
    expect(nextAction({ ...base, deadline: null, assessment: facts }).label).toBe('Verify intake');
    expect(nextAction({ ...base, deadline: null, postingStatus: 'rolling', assessment: facts }).kind).toBe('prepare');
    expect(nextAction({ ...base, assessment: { ...facts, question: 'Confirm funding.' } }).text).toBe('Confirm funding.');
  });

  it('blocks a verified unmet requirement but not missing evidence', () => {
    const check = assessment.checks[0];
    const unmet = assessmentSummary({ ...assessment, checks: [{ ...check, status: 'unmet' }] });
    expect(nextAction({ ...base, assessment: unmet }).kind).toBe('skip');
    expect(nextAction({ ...base, assessment: assessmentSummary({ ...assessment, checks: [] }) }).kind).toBe('prepare');
    expect(nextAction({ ...base }).kind).toBe('prepare');
    expect(nextAction({ ...base, assessment: assessmentSummary({ ...assessment, fit: 'weak' }) }).kind).toBe('track');
  });

  it('keeps follow-ups for submitted applications even after the posting closes', () => {
    const progress = { stage: 'applied' as const, followUpOn: '2026-11-20', note: 'Ask about references.' };
    expect(nextAction({ ...base, postingStatus: 'closed', progress })).toMatchObject({
      kind: 'follow-up', text: 'Ask about references.',
    });
    expect(nextAction({ ...base, progress: { ...progress, stage: 'archived' } }).kind).toBe('complete');
    expect(nextAction({ ...base, progress: { ...progress, followUpOn: null } }).label).toBe('Applied');
  });
});
