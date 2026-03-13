import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a deadline date to ISO date string (YYYY-MM-DD)
 * Handles both Date objects and string inputs
 */
export function formatDeadline(deadline: Date | string | null): string | null {
  if (!deadline) return null;
  return typeof deadline === 'string' ? deadline : deadline.toISOString().split('T')[0];
}
