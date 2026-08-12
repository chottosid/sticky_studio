import { describe, expect, it } from 'vitest';
import { normalizeOpportunity, RawExtractionSchema } from './contracts';

const baseRaw = {
  opportunity: {
    name: 'Research opening', details: 'Funded position', deadline: null, category: 'higher-study',
    organizationName: 'Example University', organizationType: 'University', location: null,
    applicationUrl: null, contactEmail: null, eligibility: null, requirements: [],
    attributes: {
      roleTitle: null, employmentType: null, workplaceMode: null, compensation: null, skills: [], duration: null,
      programName: 'Computer Science PhD', degreeLevel: 'PhD', department: 'Computer Science',
      professorNames: ['Professor Example'], labName: 'Example Lab', researchAreas: ['AI'],
      funding: 'Fully funded', startTerm: 'Fall 2027', theme: null, prize: null, eventDate: null,
    },
  },
  evidence: [], unresolvedFields: [], discoveredSourceUrls: [], warnings: [],
} as const;

describe('LLM output normalization', () => {
  it('projects the full model schema into the chosen category schema', () => {
    const raw = RawExtractionSchema.parse(baseRaw);
    const opportunity = normalizeOpportunity(raw);
    expect(opportunity.category).toBe('higher-study');
    expect(opportunity.attributes).toEqual({
      programName: 'Computer Science PhD', degreeLevel: 'PhD', department: 'Computer Science',
      professorNames: ['Professor Example'], labName: 'Example Lab', researchAreas: ['AI'],
      funding: 'Fully funded', startTerm: 'Fall 2027',
    });
  });
});

