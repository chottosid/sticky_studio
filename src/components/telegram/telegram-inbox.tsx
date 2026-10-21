'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, RotateCw, X } from 'lucide-react';
import type { TelegramInboxItem } from '@/lib/telegram/store';
import { dismissTelegramMessage, retryTelegramMessage } from '@/lib/telegram-actions';
import { AddOpportunityDialog } from '@/components/opportunities/add-opportunity-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

const COLLAPSED_COUNT = 3;

type InboxAction = (id: number) => Promise<{ success: boolean; message?: string }>;

function itemTitle(item: TelegramInboxItem): string {
  const names = (item.draft?.opportunities ?? []).map((entry) => entry.opportunity.name.trim()).filter(Boolean);
  if (names.length > 1) return `${names[0]} and ${names.length - 1} more`;
  if (names.length === 1) return names[0];
  return item.status === 'failed' ? 'Could not read this post' : 'Still reading this post';
}

export function TelegramInbox({ items }: { items: TelegramInboxItem[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<ReadonlySet<number>>(new Set());
  const [expanded, setExpanded] = React.useState(false);

  if (!items.length) return null;

  const run = async (id: number, action: InboxAction, failure: string) => {
    setBusy((current) => new Set(current).add(id));
    try {
      const result = await action(id);
      if (!result.success) toast({ variant: 'destructive', title: failure, description: result.message });
    } catch {
      toast({ variant: 'destructive', title: failure, description: 'Check your connection and try again.' });
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      router.refresh();
    }
  };

  return (
    <section aria-labelledby="inbox-heading" className="rounded-lg border bg-card">
      <div className="flex items-baseline justify-between gap-4 border-b px-4 py-3 sm:px-5">
        <h2 id="inbox-heading" className="font-semibold">
          From Telegram <span className="font-normal text-muted-foreground">{items.length} to review</span>
        </h2>
        <p className="hidden text-sm text-muted-foreground sm:block">Nothing is saved until you review it.</p>
      </div>
      <ul className="divide-y">
        {(expanded ? items : items.slice(0, COLLAPSED_COUNT)).map((item) => {
          const isBusy = busy.has(item.id);
          return (
            <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{itemTitle(item)}</p>
                <p className="text-sm text-muted-foreground" suppressHydrationWarning>
                  {item.chatTitle}, {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                </p>
                {item.error && <p className="mt-1 text-sm text-destructive">{item.error}</p>}
              </div>
              <div className="flex items-center gap-1">
                {item.status === 'ready' && item.draft ? (
                  <AddOpportunityDialog
                    inboxItem={item}
                    trigger={<Button size="sm" disabled={isBusy}>Review</Button>}
                    onSaved={() => router.refresh()}
                  />
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isBusy}
                    onClick={() => void run(item.id, retryTelegramMessage, 'Retry failed')}
                  >
                    {isBusy ? <Loader2 className="animate-spin" /> : <RotateCw />}
                    Retry
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={isBusy}
                  onClick={() => void run(item.id, dismissTelegramMessage, 'Could not dismiss')}
                  aria-label={`Dismiss ${itemTitle(item)}`}
                  className="h-9 w-9 text-muted-foreground"
                >
                  <X />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {items.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="w-full border-t px-4 py-2.5 text-sm font-medium text-primary hover:bg-accent sm:px-5"
        >
          {expanded ? 'Show fewer' : `Show ${items.length - COLLAPSED_COUNT} more`}
        </button>
      )}
    </section>
  );
}
