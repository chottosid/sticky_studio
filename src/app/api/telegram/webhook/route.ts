import { after, NextResponse } from 'next/server';
import { leaveChat } from '@/lib/telegram/api';
import {
  chatMigration,
  isValidWebhookSecret,
  membershipAction,
  messageAction,
  type TelegramUpdate,
} from '@/lib/telegram/message';
import { processTelegramMessage } from '@/lib/telegram/process';
import { allowChat, isChatListed, migrateChat, queueMessage, removeChat } from '@/lib/telegram/store';

export const maxDuration = 60;

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
  const action = messageAction(message, listed, ownerId);
  const migration = chatMigration(message);
  if (action === 'migrate' && migration) {
    await migrateChat(migration.from, migration.to);
    return ok();
  }
  if (action !== 'queue') return ok();

  const id = await queueMessage(message);
  // Reply to Telegram immediately; extraction runs after the response is sent.
  if (id !== null) after(() => processTelegramMessage(id));
  return ok();
}
