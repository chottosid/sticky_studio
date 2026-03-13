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
