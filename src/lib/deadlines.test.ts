import { describe, expect, it } from 'vitest';
import { daysUntil, deadlineGroup } from './deadlines';

describe('daysUntil', () => {
  it('counts calendar days between two app-timezone dates', () => {
    expect(daysUntil('2026-10-21', '2026-10-21')).toBe(0);
    expect(daysUntil('2026-10-22', '2026-10-21')).toBe(1);
    expect(daysUntil('2026-10-20', '2026-10-21')).toBe(-1);
    expect(daysUntil('2026-11-01', '2026-10-21')).toBe(11);
  });

  it('is unaffected by daylight-saving transitions', () => {
    expect(daysUntil('2026-11-02', '2026-10-31')).toBe(2);
  });
});

describe('deadlineGroup', () => {
  it('groups by how soon something is due', () => {
    expect(deadlineGroup(null, '2026-10-21')).toBe('none');
    expect(deadlineGroup('2026-10-20', '2026-10-21')).toBe('closed');
    expect(deadlineGroup('2026-10-21', '2026-10-21')).toBe('week');
    expect(deadlineGroup('2026-10-28', '2026-10-21')).toBe('week');
    expect(deadlineGroup('2026-10-29', '2026-10-21')).toBe('month');
    expect(deadlineGroup('2026-11-20', '2026-10-21')).toBe('month');
    expect(deadlineGroup('2026-11-21', '2026-10-21')).toBe('later');
  });
});
