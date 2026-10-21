import { describe, expect, it } from 'vitest';
import { OpportunityInputSchema } from './schema';
import { describeIssue, parseListText } from './form';

describe('parseListText', () => {
  it('splits on new lines only, so items may contain commas', () => {
    expect(parseListText('Proficiency in Python, Java, and C++\n  Machine learning  \n\nMachine learning'))
      .toEqual(['Proficiency in Python, Java, and C++', 'Machine learning']);
  });
});

describe('describeIssue', () => {
  it('names the field a validation error belongs to', () => {
    const result = OpportunityInputSchema.safeParse({
      name: 'Role', category: 'job', applicationUrl: 'example.com', attributes: {},
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(describeIssue(result.error.issues[0])).toMatch(/^Application URL: /);
  });

  it('falls back to the raw message for unknown paths', () => {
    expect(describeIssue({ path: ['mystery'], message: 'Bad value' } as never)).toBe('Bad value');
  });
});
