import { describe, expect, it } from 'vitest';
import { dateInTimezone } from './utils';

describe('dateInTimezone', () => {
  it('returns the calendar date in the given timezone', () => {
    const instant = new Date('2026-10-21T20:30:00Z');
    expect(dateInTimezone(instant, 'Asia/Dhaka')).toBe('2026-10-22');
    expect(dateInTimezone(instant, 'UTC')).toBe('2026-10-21');
  });
});
