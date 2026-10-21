// Deadlines are calendar dates (YYYY-MM-DD) in the app's timezone. "today" is computed once on the
// server with dateInTimezone and passed down, so server and client render the same countdown.

import { dateInTimezone } from './utils';

const DAY_MS = 86_400_000;

/** The app's calendar day. Server-side only: the timezone setting is not shipped to the browser. */
export function appToday(): string {
  return dateInTimezone(new Date(), process.env.APP_TIMEZONE || 'Asia/Dhaka');
}

export function daysUntil(deadline: string, today: string): number {
  return Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

export type DeadlineGroup = 'week' | 'month' | 'later' | 'none' | 'closed';

export const deadlineGroupLabels: Record<DeadlineGroup, string> = {
  week: 'Next 7 days',
  month: 'Next 30 days',
  later: 'Later',
  none: 'No deadline',
  closed: 'Closed',
};

export function deadlineGroup(deadline: string | null, today: string): DeadlineGroup {
  if (!deadline) return 'none';
  const days = daysUntil(deadline, today);
  if (days < 0) return 'closed';
  if (days <= 7) return 'week';
  if (days <= 30) return 'month';
  return 'later';
}
