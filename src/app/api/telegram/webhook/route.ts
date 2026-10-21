import { after, NextResponse } from 'next/server';
import { leaveChat } from '@/lib/telegram/api';
import {
  chatMigration,
  isAllowedChat,
  isValidWebhookSecret,
  membershipAction,
  messageAction,
  senderKey,
  type TelegramUpdate,
} from '@/lib/telegram/message';
import { processAfterQuietWindow } from '@/lib/telegram/process';
import {
  allowChat,
  hasPendingFrom,
  isChatListed,
  migrateChat,
  queueMessage,
  removeChat,
} from '@/lib/telegram/store';

// The background run waits out the bundle's quiet window (60 s) before extracting.
// ponytail: needs Vercel Fluid compute (Hobby allows 300 s); without it, lower QUIET_WINDOW_SECONDS.
export const maxDuration = 300;

const ok = () => NextResponse.json({ ok: true });

export async function POST(request: Request) {
  const secret = request.headers.get('x-telegram-bot-api-secret-token');
  if (!isValidWebhookSecret(secret, process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const ownerId = Number(process.env.TELEGRAM_OWNER_ID);
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0) {
    console.error('TELEGRAM_OWNER_ID is not configured.');
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const update = await request.json() as TelegramUpdate;

  const membership = update.my_chat_member;
  if (membership) {
    const listed = membership.chat.type !== 'private' && await isChatListed(membership.chat.id);
    const action = membershipAction(membership, ownerId, listed);
    if (action === 'allow') await allowChat(membership.chat.id, membership.chat.title ?? null);
    if (action === 'remove') await removeChat(membership.chat.id);
    if (action === 'leave') {
      // Added by someone other than the owner: leave and store nothing.
      await leaveChat(membership.chat.id).catch((error) => console.error('leaveChat failed:', error));
    }
    return ok();
  }

  const message = update.message;
  if (!message) return ok();

  const listed = message.chat.type !== 'private' && await isChatListed(message.chat.id);
  const sender = senderKey(message);
  const allowed = isAllowedChat(message.chat, listed, ownerId);
  const continuesBundle = allowed && await hasPendingFrom(message.chat.id, sender);
  const action = messageAction(message, listed, ownerId, continuesBundle);
  const migration = chatMigration(message);
  if (action === 'migrate' && migration) {
    await migrateChat(migration.from, migration.to);
    return ok();
  }
  if (action !== 'queue') return ok();

  const id = await queueMessage(message, sender);
  // Reply to Telegram immediately; bundling and extraction run after the response is sent.
  if (id !== null) after(() => processAfterQuietWindow(id, message.chat.id, sender));
  return ok();
}
