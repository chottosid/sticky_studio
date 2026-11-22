import { redirect } from 'next/navigation';
import Header from '@/components/layout/header';
import { TelegramInbox } from '@/components/telegram/telegram-inbox';
import { isAuthenticated } from '@/lib/actions';
import { getInboxItems } from '@/lib/telegram/store';

export const maxDuration = 300;

export default async function InboxPage() {
  if (!(await isAuthenticated())) redirect('/login');
  const items = await getInboxItems();
  return <>
    <Header active="inbox" />
    <main className="mx-auto max-w-3xl space-y-5 px-4 pb-16 pt-7 sm:px-6 sm:pt-10">
      <h1 className="font-display text-4xl font-semibold tracking-tight">Inbox</h1>
      {items.length ? <TelegramInbox items={items} /> : <p className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">Your Telegram inbox is clear.</p>}
    </main>
  </>;
}
