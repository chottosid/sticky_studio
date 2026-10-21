import { daysUntil } from '@/lib/deadlines';
import { cn } from '@/lib/utils';

type Props = { deadline: string | null; today: string; size?: 'md' | 'lg' };

/**
 * The days-left figure that leads every row. Within a week it gets a highlighter stroke;
 * within two days the figure turns red.
 */
export function DeadlineMark({ deadline, today, size = 'md' }: Props) {
  const figure = size === 'lg' ? 'text-5xl' : 'text-3xl';

  if (!deadline) {
    return (
      <span className={cn('font-display leading-none text-muted-foreground/60', figure)}>
        <span aria-hidden>–</span><span className="sr-only">No deadline</span>
      </span>
    );
  }

  const days = daysUntil(deadline, today);
  if (days < 0) {
    return <span className="text-sm font-medium text-muted-foreground">Closed</span>;
  }

  const soon = days <= 7;
  const urgent = days <= 2;
  const label = days === 0 ? 'Due today' : `${days} ${days === 1 ? 'day' : 'days'} left`;

  return (
    <span className="inline-flex flex-col items-start">
      <span className="sr-only">{label}</span>
      <span
        aria-hidden
        className={cn(
          'font-display font-semibold leading-none tabular-nums tracking-tight',
          figure,
          // Dark mode: a pale stroke behind light figures is unreadable, so the figure itself turns yellow.
          soon && 'bg-[linear-gradient(transparent_58%,hsl(var(--highlight))_58%,hsl(var(--highlight))_92%,transparent_92%)] px-0.5 dark:bg-none',
          soon && !urgent && 'dark:text-highlight',
          urgent && 'text-destructive',
        )}
      >
        {days === 0 ? 'Today' : days}
      </span>
      {days > 0 && (
        <span aria-hidden className="mt-1 text-xs text-muted-foreground">{days === 1 ? 'day left' : 'days left'}</span>
      )}
    </span>
  );
}
