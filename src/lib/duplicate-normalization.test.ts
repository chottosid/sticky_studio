import { describe, expect, it } from 'vitest';
import { canonicalizeUrl, normalizeComparable } from './duplicate-normalization';

describe('duplicate normalization', () => {
  it('normalizes DOI view variants', () => {
    expect(canonicalizeUrl('https://dl.acm.org/doi/pdf/10.1145/3641554.3701863')).toBe(
      'https://doi.org/10.1145/3641554.3701863',
    );
    expect(canonicalizeUrl('https://doi.org/10.1145/3641554.3701863')).toBe(
      'https://doi.org/10.1145/3641554.3701863',
    );
  });

  it('normalizes arXiv PDF and abstract variants', () => {
    expect(canonicalizeUrl('https://arxiv.org/pdf/2601.14163.pdf')).toBe('https://arxiv.org/abs/2601.14163');
    expect(canonicalizeUrl('https://arxiv.org/abs/2601.14163')).toBe('https://arxiv.org/abs/2601.14163');
  });

  it('removes titles and punctuation from comparable names', () => {
    expect(normalizeComparable('Dr. Joanna Cecilia')).toBe('joanna cecilia');
  });
});
