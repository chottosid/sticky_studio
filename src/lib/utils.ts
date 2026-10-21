import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a deadline date to ISO date string (YYYY-MM-DD)
 * Handles both Date objects and string inputs
 * Uses local timezone to avoid date shifts
 */
export function formatDeadline(deadline: Date | string | null): string | null {
  if (!deadline) return null;
  if (typeof deadline === 'string') return deadline;

  // Use local date components to avoid timezone issues
  const year = deadline.getFullYear();
  const month = String(deadline.getMonth() + 1).padStart(2, '0');
  const day = String(deadline.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Calendar date (YYYY-MM-DD) of `date` in an IANA timezone. */
export function dateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** `value.slice(0, max)` that never cuts a surrogate pair in half (emoji, math-bold letters). */
export function sliceText(value: string, max: number): string {
  const sliced = value.slice(0, max);
  return /[\uD800-\uDBFF]$/.test(sliced) ? sliced.slice(0, -1) : sliced;
}
