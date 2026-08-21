import { describe, expect, it } from 'vitest';
import { ExtractionDraftSchema, OpportunityInputSchema } from './schema';

describe('OpportunityInputSchema', () => {
  it('accepts an opportunity with no deadline', () => {
    const result = OpportunityInputSchema.parse({
      name: 'Software Engineer',
      details: '',
      deadline: '',
      category: 'job',
      organizationName: 'Example Co',
      requirements: [],
      attributes: {},
    });
    expect(result.deadline).toBeNull();
    if (result.category !== 'job') throw new Error('Expected a job');
    expect(result.attributes.skills).toEqual([]);
  });

  it('keeps higher-study fields structured', () => {
    const result = OpportunityInputSchema.parse({
      name: 'Funded PhD position',
      category: 'higher-study',
      attributes: {
        degreeLevel: 'PhD',
        professorNames: ['Dr. Ada Lovelace'],
        labName: 'Systems Lab',
        researchAreas: ['Distributed systems'],
      },
    });
    expect(result.category).toBe('higher-study');
    if (result.category !== 'higher-study') throw new Error('Expected higher study');
    expect(result.attributes.professorNames).toEqual(['Dr. Ada Lovelace']);
    expect(result.attributes.labName).toBe('Systems Lab');
  });

  it('rejects unknown categories instead of defaulting to job', () => {
    expect(() => OpportunityInputSchema.parse({
      name: 'Unknown',
      category: 'other',
      attributes: {},
    })).toThrow();
  });
});

describe('ExtractionDraftSchema', () => {
  it('allows a nameless extraction draft for human review', () => {
    const draft = ExtractionDraftSchema.parse({
      opportunities: [{ opportunity: { name: '', category: 'contest', attributes: {} }, unresolvedFields: ['name'] }],
    });
    expect(draft.opportunities[0].opportunity.name).toBe('');
    expect(draft.opportunities[0].unresolvedFields).toContain('name');
  });
});
