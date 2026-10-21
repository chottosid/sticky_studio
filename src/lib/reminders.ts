export const REMINDER_THRESHOLDS = [7, 3, 1] as const;
export type ReminderThreshold = (typeof REMINDER_THRESHOLDS)[number];

/**
 * One reminder per crossing: the nearest unsent threshold at or above `daysLeft` triggers a
 * single email, and every threshold it covers is marked so later runs don't send stale ones.
 */
export function pendingReminder(
  daysLeft: number,
  sent: Record<ReminderThreshold, boolean>,
): { thresholds: ReminderThreshold[] } | null {
  if (daysLeft < 0) return null;
  const nearest = [...REMINDER_THRESHOLDS].reverse().find((threshold) => daysLeft <= threshold);
  if (nearest === undefined || sent[nearest]) return null;
  return { thresholds: REMINDER_THRESHOLDS.filter((threshold) => threshold >= nearest && !sent[threshold]).reverse() };
}

export function dueLabel(daysLeft: number): string {
  if (daysLeft === 0) return 'due today';
  if (daysLeft === 1) return 'due tomorrow';
  return `due in ${daysLeft} days`;
}
