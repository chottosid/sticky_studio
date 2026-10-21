import { describe, expect, it } from 'vitest';
import { dateInTimezone, escapeHtml, escapeLike, isCalendarDate, isNumericId } from './utils';

describe('dateInTimezone', () => {
  it('returns the calendar date in the given timezone', () => {
    const instant = new Date('2026-10-21T20:30:00Z');
    expect(dateInTimezone(instant, 'Asia/Dhaka')).toBe('2026-10-22');
    expect(dateInTimezone(instant, 'UTC')).toBe('2026-10-21');
  });
});

describe('escapeLike', () => {
  it('matches %, _ and backslash literally', () => {
    expect(escapeLike('100%_off\\')).toBe('100\\%\\_off\\\\');
  });
});

describe('escapeHtml', () => {
  it('neutralizes markup from untrusted posts', () => {
    expect(escapeHtml(`<a href="x">salary < 50k & 'perks'</a>`))
      .toBe('&lt;a href=&quot;x&quot;&gt;salary &lt; 50k &amp; &#39;perks&#39;&lt;/a&gt;');
  });
});

describe('isNumericId', () => {
  it('accepts database ids only', () => {
    expect(isNumericId('124')).toBe(true);
    expect(isNumericId('abc')).toBe(false);
    expect(isNumericId('9999999999')).toBe(false);
    expect(isNumericId('')).toBe(false);
  });
});

describe('isCalendarDate', () => {
  it('rejects impossible months and days without throwing', () => {
    expect(isCalendarDate('2026-13-01')).toBe(false);
    expect(isCalendarDate('2026-00-10')).toBe(false);
    expect(isCalendarDate('2026-02-32')).toBe(false);
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2028-02-29')).toBe(true);
  });
});
