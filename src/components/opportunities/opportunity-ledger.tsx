'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { ArrowUpRight, Loader2, Search, X } from 'lucide-react';
import { opportunityCategoryLabels, opportunityCategoryOptions } from '@/domain/opportunity/config';
import { getOpportunitiesAction } from '@/lib/actions';
import { deadlineGroup, deadlineGroupLabels } from '@/lib/deadlines';
import { LIST_PAGE_SIZE, LIST_RETURN_KEY, listHref, listOrder, type ListParams } from '@/lib/list-params';
import type { OpportunityListRow } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DeadlineMark } from './deadline-mark';
import { ActionBadge } from '@/components/workflow/action-badge';
import { candidates, type CandidateId } from '@/domain/opportunity/assessment';

type Props = {
  params: ListParams;
  initialItems: OpportunityListRow[];
  total: number;
  today: string;
};

const pluralLabels: Record<string, string> = {
  job: 'Jobs', internship: 'Internships', contest: 'Contests', 'higher-study': 'Higher study',
};

export function OpportunityLedger({ params, initialItems, total, today }: Props) {
  const router = useRouter();
  const [isNavigating, startNavigation] = React.useTransition();
  const [more, setMore] = React.useState<OpportunityListRow[]>([]);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState(params.q);
  const [baseItems, setBaseItems] = React.useState(initialItems);
  const lastSentQuery = React.useRef(params.q);
  // A save, delete or new search re-renders the server list; drop pages fetched for the old one.
  // Done during render (not in an effect) so stale rows never show for a frame.
  if (baseItems !== initialItems) {
    setBaseItems(initialItems);
    setMore([]);
    setLoadError(null);
  }

  // Back/Forward changed the search: show it. Our own debounced updates are skipped.
  React.useEffect(() => {
    if (params.q !== lastSentQuery.current) {
      lastSentQuery.current = params.q;
      setQuery(params.q);
    }
  }, [params.q]);

  const navigate = React.useCallback((next: Partial<ListParams>, mode: 'push' | 'replace' = 'push') => {
    const href = listHref({ ...params, ...next });
    startNavigation(() => (mode === 'push' ? router.push(href, { scroll: false }) : router.replace(href, { scroll: false })));
  }, [params, router]);

  // Search as you type, without stacking a history entry per keystroke.
  React.useEffect(() => {
    const next = query.trim();
    if (next === lastSentQuery.current) return;
    const timer = window.setTimeout(() => {
      lastSentQuery.current = next;
      navigate({ q: next }, 'replace');
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query, navigate]);

  const items = [...baseItems, ...more];
  const hasMore = items.length < total;

  const loadMore = async () => {
    setLoadingMore(true);
    setLoadError(null);
    try {
      const { sortBy, sortOrder } = listOrder(params);
      // By offset, not page number: rows added or removed elsewhere can't make it repeat a page.
      const result = await getOpportunitiesAction(
        items.length, LIST_PAGE_SIZE, sortBy, sortOrder, params.q || undefined, params.status, params.category, params.candidate,
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
    <section aria-labelledby="ledger-heading" className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 id="ledger-heading" className="font-display text-4xl font-semibold tracking-tight sm:text-[2.7rem]">Opportunities</h1>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">{total} {params.status === 'past' ? 'closed' : 'upcoming'} {total === 1 ? 'opportunity' : 'opportunities'}</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border bg-secondary/60 p-1 text-sm" role="group" aria-label="Show">
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

      <div className="space-y-3 rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
        <nav aria-label="Category" className="overflow-x-auto">
          <ul className="flex min-w-max gap-1">
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
                        'inline-block rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                        active && 'bg-accent font-semibold text-accent-foreground',
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
              type="text"
              inputMode="search"
              enterKeyHint="search"
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

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-muted-foreground">
            Show actions for
            <select aria-label="Show actions for" value={params.candidate || 'both'} className="h-9 rounded-md border bg-card px-2 text-foreground"
              onChange={(event) => {
                const value = event.target.value;
                navigate(value === 'both' ? { candidate: undefined }
                  : { candidate: value as CandidateId });
              }}>
              <option value="both">Both profiles</option>
              {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div aria-busy={isNavigating} className={cn('transition-opacity', isNavigating && 'opacity-60')}>
        {items.length === 0 ? (
          <EmptyState params={params} scope={scope} />
        ) : (
          <ol className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
            {items.map((item, index) => {
              const group = deadlineGroup(item.deadline, today);
              const previous = items[index - 1];
              const startsGroup = showGroups && (!previous || deadlineGroup(previous.deadline, today) !== group);
              return (
                <React.Fragment key={item.id}>
                  {startsGroup && params.status === 'upcoming' && (
                    <li className="bg-secondary/50 px-4 py-2.5 text-xs font-semibold text-muted-foreground sm:px-5">
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

function LedgerRow({ item, today }: { item: OpportunityListRow; today: string }) {
  const org = [item.organizationName, item.location].filter(Boolean).join(', ');
  return (
    <Link
      href={`/opportunity/${item.id}`}
      onClick={() => {
        try { sessionStorage.setItem(LIST_RETURN_KEY, item.id); } catch { /* storage blocked: back goes home */ }
      }}
      className="group grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-3 px-4 py-4 transition-colors hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:gap-x-4 sm:px-5"
    >
      <div className="pt-0.5">
        {item.postingStatus === 'closed' ? <span className="text-xs text-muted-foreground">Closed</span>
          : item.postingStatus === 'rolling' ? <span className="text-xs font-medium text-primary">Rolling</span> : <DeadlineMark deadline={item.deadline} today={today} />}
      </div>
      <div className="min-w-0">
        <p className="break-words font-semibold leading-snug group-hover:text-primary">{item.name}</p>
        {org && <p className="mt-0.5 truncate text-sm text-muted-foreground">{org}</p>}
        <div className="mt-2 flex flex-wrap gap-1">
          {candidates.map((candidate) => {
            const action = item.actions[candidate.id];
            return action && <ActionBadge key={candidate.id} action={action} name={candidate.name} />;
          })}
        </div>
        <p className="mt-1 text-xs text-muted-foreground sm:hidden">
          {opportunityCategoryLabels[item.category]}
          {item.deadline && `, due ${format(parseISO(item.deadline), 'd MMM yyyy')}`}
        </p>
      </div>
      <div className="hidden text-right text-sm sm:block">
        <p className="text-muted-foreground">{opportunityCategoryLabels[item.category]}</p>
        <p className="mt-0.5 flex items-center justify-end gap-1.5 tabular-nums">
          {item.deadline && format(parseISO(item.deadline), 'd MMM yyyy')}
          <ArrowUpRight size={14} aria-hidden className="text-muted-foreground/70 group-hover:text-primary" />
        </p>
      </div>
    </Link>
  );
}

function EmptyState({ params, scope }: { params: ListParams; scope: string }) {
  let message = params.status === 'past' ? `No closed ${scope} yet.` : `Nothing upcoming in ${scope}.`;
  if (params.q) message = `No ${params.status === 'past' ? 'closed' : 'upcoming'} ${scope} match “${params.q}”.`;
  return (
    <div className="rounded-2xl border bg-card px-4 py-14 text-center shadow-sm">
      <p className="font-medium">{message}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {params.q
          ? 'Try a shorter search, or look in another category.'
          : 'Add one from a screenshot, PDF or pasted text, or add the Telegram bot to a group.'}
      </p>
    </div>
  );
}
