import { describe, expect, it } from 'vitest';
import { credentialsMatch } from './credentials';

describe('credentialsMatch', () => {
  const expected = { email: 'me@example.com', password: 's3cret' };

  it('accepts only the exact pair, ignoring email case', () => {
    expect(credentialsMatch('me@example.com', 's3cret', expected)).toBe(true);
    expect(credentialsMatch('ME@example.com', 's3cret', expected)).toBe(true);
    expect(credentialsMatch('me@example.com', 's3cret ', expected)).toBe(false);
    expect(credentialsMatch('other@example.com', 's3cret', expected)).toBe(false);
  });

  it('rejects everything when credentials are not configured', () => {
    expect(credentialsMatch('', '', { email: undefined, password: undefined })).toBe(false);
  });
});
