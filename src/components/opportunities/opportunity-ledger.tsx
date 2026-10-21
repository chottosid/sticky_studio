'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { Loader2, Search, X } from 'lucide-react';
import { opportunityCategoryLabels, opportunityCategoryOptions } from '@/domain/opportunity/config';
import { getOpportunitiesAction } from '@/lib/actions';
import { deadlineGroup, deadlineGroupLabels } from '@/lib/deadlines';
import { LIST_PAGE_SIZE, listHref, listOrder, type ListParams } from '@/lib/list-params';
import type { Opportunity } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DeadlineMark } from './deadline-mark';

type Props = {
  params: ListParams;
  initialItems: Opportunity[];
  total: number;
  today: string;
};

const pluralLabels: Record<string, string> = {
  job: 'Jobs', internship: 'Internships', contest: 'Contests', 'higher-study': 'Higher study',
};

export function OpportunityLedger({ params, initialItems, total, today }: Props) {
  const router = useRouter();
  const [isNavigating, startNavigation] = React.useTransition();
  const [more, setMore] = React.useState<Opportunity[]>([]);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState(params.q);

  // A save or delete refreshes the server list; drop pages fetched for the old one.
  React.useEffect(() => setMore([]), [initialItems]);

  const navigate = React.useCallback((next: Partial<ListParams>, mode: 'push' | 'replace' = 'push') => {
    const href = listHref({ ...params, ...next });
    startNavigation(() => (mode === 'push' ? router.push(href, { scroll: false }) : router.replace(href, { scroll: false })));
  }, [params, router]);

  // Search as you type, without stacking a history entry per keystroke.
  React.useEffect(() => {
    if (query.trim() === params.q) return;
    const timer = window.setTimeout(() => navigate({ q: query.trim() }, 'replace'), 350);
    return () => window.clearTimeout(timer);
  }, [query, params.q, navigate]);

  const items = [...initialItems, ...more];
  const hasMore = items.length < total;

  const loadMore = async () => {
    setLoadingMore(true);
    setLoadError(null);
    try {
      const { sortBy, sortOrder } = listOrder(params);
      const page = Math.floor(items.length / LIST_PAGE_SIZE) + 1;
      const result = await getOpportunitiesAction(
        page, LIST_PAGE_SIZE, sortBy, sortOrder, params.q || undefined, params.status, params.category,
      );
      if (!result.success) {
        setLoadError('Your session has ended or the list could not load. Reload the page, or sign in again.');
        return;
      }
      const seen = new Set(items.map((item) => item.id));
      setMore((current) => [...current, ...result.opportunities.filter((item) => !seen.has(item.id))]);
    } catch {
      setLoadError('The list could not load. Check your connection and try again.');
    } finally {
      setLoadingMore(false);
    }
  };

  const showGroups = params.sort === 'deadline';
  const scope = params.category ? pluralLabels[params.category].toLowerCase() : 'opportunities';

  return (
    <section aria-labelledby="ledger-heading" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h1 id="ledger-heading" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {params.status === 'past' ? 'Closed' : 'Upcoming'}{' '}
          <span className="text-muted-foreground">{total}</span>
        </h1>
        <div className="flex items-center gap-1 rounded-lg bg-secondary p-1 text-sm" role="group" aria-label="Show">
          {(['upcoming', 'past'] as const).map((status) => (
            <Link
              key={status}
              href={listHref({ ...params, status })}
              scroll={false}
              aria-current={params.status === status ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground',
                params.status === status && 'bg-card text-foreground shadow-sm',
              )}
            >
              {status === 'upcoming' ? 'Upcoming' : 'Closed'}
            </Link>
          ))}
        </div>
      </div>

      <nav aria-label="Category" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 border-b">
          {[{ value: undefined, label: 'All' }, ...opportunityCategoryOptions.map((option) => ({ value: option.value, label: pluralLabels[option.value] }))]
            .map((option) => {
              const active = params.category === option.value;
              return (
                <li key={option.label}>
                  <Link
                    href={listHref({ ...params, category: option.value })}
                    scroll={false}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      '-mb-px inline-block border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                      active && 'border-foreground text-foreground',
                    )}
                  >
                    {option.label}
                  </Link>
                </li>
              );
            })}
        </ul>
      </nav>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label={`Search ${scope}`}
            placeholder={`Search ${scope}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="bg-card pl-9 pr-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Sort by
          <select
            value={params.sort}
            onChange={(event) => navigate({ sort: event.target.value as ListParams['sort'] })}
            className="h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="deadline">Deadline</option>
            <option value="added">Recently added</option>
          </select>
        </label>
      </div>

      <div aria-busy={isNavigating} className={cn('transition-opacity', isNavigating && 'opacity-60')}>
        {items.length === 0 ? (
          <EmptyState params={params} scope={scope} />
        ) : (
          <ol className="divide-y border-y">
            {items.map((item, index) => {
              const group = deadlineGroup(item.deadline, today);
              const previous = items[index - 1];
              const startsGroup = showGroups && (!previous || deadlineGroup(previous.deadline, today) !== group);
              return (
                <React.Fragment key={item.id}>
                  {startsGroup && params.status === 'upcoming' && (
                    <li className="bg-background pb-2 pt-6 text-sm font-semibold text-muted-foreground first:pt-4">
                      {deadlineGroupLabels[group]}
                    </li>
                  )}
                  <li>
                    <LedgerRow item={item} today={today} />
                  </li>
                </React.Fragment>
              );
            })}
          </ol>
        )}

        {loadError && <p role="alert" className="mt-4 text-sm text-destructive">{loadError}</p>}
        {hasMore && (
          <div className="mt-6 flex justify-center">
            <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore && <Loader2 className="animate-spin" />}
              Show more ({total - items.length} left)
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function LedgerRow({ item, today }: { item: Opportunity; today: string }) {
  const org = [item.organizationName, item.location].filter(Boolean).join(', ');
  return (
    <Link
      href={`/opportunity/${item.id}`}
      className="group grid grid-cols-[4.5rem_1fr] gap-x-4 px-1 py-4 transition-colors hover:bg-card focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[5rem_1fr_auto] sm:px-3"
    >
      <div className="pt-0.5">
        <DeadlineMark deadline={item.deadline} today={today} />
      </div>
      <div className="min-w-0">
        <p className="font-semibold leading-snug group-hover:text-primary">{item.name}</p>
        {org && <p className="mt-0.5 truncate text-sm text-muted-foreground">{org}</p>}
        <p className="mt-1 text-xs text-muted-foreground sm:hidden">
          {opportunityCategoryLabels[item.category]}
          {item.deadline && `, due ${format(parseISO(item.deadline), 'd MMM yyyy')}`}
        </p>
      </div>
      <div className="hidden text-right text-sm sm:block">
        <p className="text-muted-foreground">{opportunityCategoryLabels[item.category]}</p>
        {item.deadline && <p className="mt-0.5 tabular-nums">{format(parseISO(item.deadline), 'd MMM yyyy')}</p>}
      </div>
    </Link>
  );
}

function EmptyState({ params, scope }: { params: ListParams; scope: string }) {
  let message = params.status === 'past' ? `No closed ${scope} yet.` : `Nothing upcoming in ${scope}.`;
  if (params.q) message = `No ${params.status === 'past' ? 'closed' : 'upcoming'} ${scope} match “${params.q}”.`;
  return (
    <div className="border-y py-16 text-center">
      <p className="font-medium">{message}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {params.q
          ? 'Try a shorter search, or look in another category.'
          : 'Add one from a screenshot, PDF or pasted text, or add the Telegram bot to a group.'}
      </p>
    </div>
  );
}
