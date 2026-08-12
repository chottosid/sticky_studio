import { describe, expect, it } from 'vitest';
import { extractHttpUrls, prepareExtractionSources } from './input';

describe('extraction input', () => {
  it('preserves Unicode pasted text without browser base64 conversion', async () => {
    const result = await prepareExtractionSources({
      sources: [{
        id: 'source-1', kind: 'text', name: 'Pasted text', mimeType: 'text/plain',
        text: 'বাংলা opportunity text',
      }],
    });
    expect(result.preparedSources[0].text).toBe('বাংলা opportunity text');
  });

  it('extracts and de-duplicates HTTP links', () => {
    expect(extractHttpUrls('Apply at https://example.com/apply. More: https://example.com/apply')).toEqual([
      'https://example.com/apply',
    ]);
  });
});

