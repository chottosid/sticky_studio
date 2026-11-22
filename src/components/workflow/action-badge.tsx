import type { NextAction } from '@/domain/opportunity/workflow';
import { cn } from '@/lib/utils';

const styles: Record<NextAction['kind'], string> = {
  'follow-up': 'border-sky-600/30 bg-sky-600/10 text-sky-800 dark:text-sky-300',
  verify: 'border-amber-600/30 bg-amber-600/10 text-amber-900 dark:text-amber-300',
  prepare: 'border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300',
  track: 'border-border bg-secondary text-muted-foreground',
  skip: 'border-red-600/20 bg-red-600/5 text-red-800 dark:text-red-300',
  complete: 'border-border bg-secondary text-muted-foreground',
};
export function ActionBadge({ action, name }: { action: NextAction; name?: string }) {
  return <span className={cn('inline-flex rounded-md border px-2 py-0.5 text-xs font-medium', styles[action.kind])}>
    {name && `${name} · `}{action.label}
  </span>;
}
