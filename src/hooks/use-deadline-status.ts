import { useMemo } from 'react';

interface DeadlineStatus {
  isPast: boolean;
  isUrgent: boolean;
  isUpcoming: boolean;
  daysUntil: number | null;
}

/**
 * Hook to calculate deadline status for an opportunity
 * @param deadline - ISO date string or null
 * @returns DeadlineStatus object with isPast, isUrgent, isUpcoming, and daysUntil
 */
export function useDeadlineStatus(deadline: string | null): DeadlineStatus {
  return useMemo(() => {
    if (!deadline) {
      return {
        isPast: false,
        isUrgent: false,
        isUpcoming: true, // No deadline means always upcoming
        daysUntil: null,
      };
    }

    const deadlineDate = new Date(deadline);
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Reset time to start of day for accurate comparison

    const diffTime = deadlineDate.getTime() - now.getTime();
    const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const isPast = daysUntil < 0;
    const isUrgent = !isPast && daysUntil <= 7;

    return {
      isPast,
      isUrgent,
      isUpcoming: !isPast,
      daysUntil,
    };
  }, [deadline]);
}
