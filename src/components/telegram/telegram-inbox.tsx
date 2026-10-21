'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Inbox, Loader2, RotateCw, X } from 'lucide-react';
import type { TelegramInboxItem } from '@/lib/telegram/store';
import { dismissTelegramMessage, retryTelegramMessage } from '@/lib/telegram-actions';
import { AddOpportunityDialog } from '@/components/opportunities/add-opportunity-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

type InboxAction = (id: number) => Promise<{ success: boolean; message?: string }>;

export function TelegramInbox({ items }: { items: TelegramInboxItem[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = React.useState<number | null>(null);

  if (!items.length) return null;

  const run = async (id: number, action: InboxAction) => {
    setBusyId(id);
    try {
      const result = await action(id);
      if (!result.success) {
        toast({ variant: 'destructive', title: 'Inbox action failed', description: result.message });
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="h-4 w-4" /> Telegram inbox ({items.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => {
          const busy = busyId === item.id;
          const names = item.draft?.opportunities.map((entry) => entry.opportunity.name) ?? [];
          const title = names[0] ?? (item.status === 'failed' ? 'Extraction failed' : 'Processing stalled');
          return (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {title}{names.length > 1 ? ` +${names.length - 1} more` : ''}
                </p>
                <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                  {item.chatTitle} · {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                </p>
                {item.error ? <p className="mt-1 text-xs text-destructive">{item.error}</p> : null}
              </div>
              <div className="flex gap-2">
                {item.status === 'ready' && item.draft ? (
                  <AddOpportunityDialog
                    inboxItem={item}
                    trigger={<Button size="sm" disabled={busy}>Review</Button>}
                    onSaved={() => router.refresh()}
                  />
                ) : (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(item.id, retryTelegramMessage)}>
                    {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCw className="mr-1 h-3.5 w-3.5" />}
                    Retry
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void run(item.id, dismissTelegramMessage)}
                  aria-label="Dismiss"
                  title="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
