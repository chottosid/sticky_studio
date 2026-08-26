import { describe, expect, it } from 'vitest';
import { ExtractionDraftSchema } from '@/domain/opportunity/schema';
import { clampModelValue, normalizeOpportunity, RawExtractionSchema, type RawExtraction } from './contracts';

const baseItem = {
  name: 'Research opening', details: 'Funded position', deadline: null, category: 'higher-study',
  organizationName: 'Example University', organizationType: 'University', location: null,
  applicationUrl: null, contactEmail: null, eligibility: null, requirements: [],
  attributes: {
    roleTitle: null, employmentType: null, workplaceMode: null, compensation: null, skills: [], duration: null,
    programName: 'Computer Science PhD', degreeLevel: 'PhD', department: 'Computer Science',
    professorNames: ['Professor Example'], labName: 'Example Lab', researchAreas: ['AI'],
    funding: 'Fully funded', startTerm: 'Fall 2027', theme: null, prize: null, eventDate: null,
  },
  evidence: [], unresolvedFields: [],
} as const;

const baseRaw = {
  opportunities: [baseItem],
  discoveredSourceUrls: [], warnings: [],
} as const;

describe('LLM output normalization', () => {
  it('projects the full model schema into the chosen category schema', () => {
    const raw = RawExtractionSchema.parse(baseRaw);
    const opportunity = normalizeOpportunity(raw.opportunities[0]);
    expect(opportunity.category).toBe('higher-study');
    expect(opportunity.attributes).toEqual({
      programName: 'Computer Science PhD', degreeLevel: 'PhD', department: 'Computer Science',
      professorNames: ['Professor Example'], labName: 'Example Lab', researchAreas: ['AI'],
      funding: 'Fully funded', startTerm: 'Fall 2027',
    });
  });

  it('keeps every extracted opportunity', () => {
    const raw = RawExtractionSchema.parse({
      ...baseRaw,
      opportunities: [baseItem, { ...baseItem, name: 'Second opening', category: 'job' }],
    });
    expect(raw.opportunities).toHaveLength(2);
    expect(normalizeOpportunity(raw.opportunities[1]).category).toBe('job');
  });

  it('clamps oversized model output instead of failing the draft schema', () => {
    const raw = RawExtractionSchema.parse({
      ...baseRaw,
      opportunities: [{
        ...baseItem,
        name: 'N'.repeat(600),
        requirements: ['valid requirement', ''],
        evidence: [
          { field: 'organizationName', sourceId: 's1', excerpt: 'E'.repeat(600), confidence: 'high' },
          { field: 'F'.repeat(300), sourceId: 's1', excerpt: 'excerpt', confidence: 'high' },
        ],
        unresolvedFields: ['U'.repeat(300), ''],
      }],
      warnings: ['W'.repeat(1_500), ''],
    });
    const clamped = clampModelValue(raw) as RawExtraction;
    const item = clamped.opportunities[0];

    const draft = ExtractionDraftSchema.parse(clampModelValue({
      opportunities: [{
        opportunity: normalizeOpportunity(item),
        evidence: item.evidence,
        unresolvedFields: item.unresolvedFields,
      }],
      warnings: clamped.warnings,
      discoveredSourceUrls: [],
    }));

    expect(draft.opportunities[0].opportunity.name).toHaveLength(500);
    expect(draft.opportunities[0].opportunity.requirements).toEqual(['valid requirement']);
    expect(draft.opportunities[0].evidence[0].excerpt).toHaveLength(500);
    expect(draft.opportunities[0].evidence[1].field).toHaveLength(200);
    expect(draft.opportunities[0].unresolvedFields[0]).toHaveLength(200);
    expect(draft.warnings).toHaveLength(1);
    expect(draft.warnings[0]).toHaveLength(1_000);
  });
});

