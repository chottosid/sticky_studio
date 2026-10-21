import { describe, expect, it } from 'vitest';
import { dueLabel, pendingReminder } from './reminders';

const none = { 7: false, 3: false, 1: false };

describe('pendingReminder', () => {
  it('sends one reminder per crossing and marks every threshold it covers', () => {
    expect(pendingReminder(2, none)).toEqual({ thresholds: [3, 7] });
    expect(pendingReminder(0, none)).toEqual({ thresholds: [1, 3, 7] });
    expect(pendingReminder(6, none)).toEqual({ thresholds: [7] });
  });

  it('skips thresholds already sent and days outside the window', () => {
    expect(pendingReminder(2, { 7: true, 3: true, 1: false })).toBeNull();
    expect(pendingReminder(1, { 7: true, 3: true, 1: false })).toEqual({ thresholds: [1] });
    expect(pendingReminder(8, none)).toBeNull();
    expect(pendingReminder(-1, none)).toBeNull();
  });
});

describe('dueLabel', () => {
  it('says when something is actually due', () => {
    expect(dueLabel(0)).toBe('due today');
    expect(dueLabel(1)).toBe('due tomorrow');
    expect(dueLabel(5)).toBe('due in 5 days');
  });
});
