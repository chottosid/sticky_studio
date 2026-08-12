import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OpportunityInput } from '@/domain/opportunity/schema';
import {
  createDuplicateConfirmationToken,
  type DuplicateInput,
  verifyDuplicateConfirmationToken,
} from './duplicate-confirmation';

const opportunity: OpportunityInput = {
  name: 'Ph.D. students', details: 'Quantum software research', deadline: null,
  category: 'higher-study', organizationName: 'University of Notre Dame', organizationType: 'University',
  location: null, applicationUrl: null, contactEmail: null, eligibility: null, requirements: [],
  attributes: {
    programName: 'Ph.D.', degreeLevel: 'Ph.D.', department: null,
    professorNames: ['Joanna Cecilia'], labName: null, researchAreas: ['QuantumSE'], funding: null, startTerm: null,
  },
};

function input(value = opportunity): DuplicateInput {
  return {
    opportunity: value,
    sources: [{ id: 'source-1', kind: 'text', name: 'Pasted text', mimeType: 'text/plain', text: 'Hiring Ph.D. students' }],
    discoveredSourceUrls: [],
  };
}

describe('duplicate confirmation', () => {
  const previousSecret = process.env.SESSION_SECRET;
  beforeEach(() => { process.env.SESSION_SECRET = 'test-secret-that-is-long-enough-for-hmac'; });
  afterEach(() => { process.env.SESSION_SECRET = previousSecret; });

  it('accepts an unchanged draft and rejects an edited draft', async () => {
    const token = await createDuplicateConfirmationToken(input(), [{
      id: '77', name: 'Existing', category: 'higher-study', organizationName: null,
      deadline: null, confidence: 'high', reason: 'Same source',
    }]);
    expect(await verifyDuplicateConfirmationToken(input(), token)).toBe(true);
    expect(await verifyDuplicateConfirmationToken(input({ ...opportunity, name: 'Edited title' }), token)).toBe(false);
  });

  it('rejects a tampered token', async () => {
    const token = await createDuplicateConfirmationToken(input(), []);
    expect(await verifyDuplicateConfirmationToken(input(), `${token}x`)).toBe(false);
  });
});
