import { describe, expect, it } from 'vitest';
import { sourcePayload } from './source-payload';

describe('source payload', () => {
  it('uses the bucket-compatible MIME type for UTF-8 pasted text', () => {
    const payload = sourcePayload({
      id: 'source-1',
      kind: 'text',
      name: 'Pasted text',
      mimeType: 'text/plain',
      text: 'Hello বাংলা',
    });

    expect(payload.mimeType).toBe('text/plain');
    expect(payload.bytes.toString('utf8')).toBe('Hello বাংলা');
  });
});
