import 'server-only';

import { query } from '@/lib/db';
import type { ExtractionDraft, ExtractionSource } from '@/domain/opportunity/schema';
import type { TelegramMessage } from './message';

export type TelegramInboxItem = {
  id: number;
  status: 'pending' | 'ready' | 'failed';
  chatTitle: string;
  draft: ExtractionDraft | null;
  error: string | null;
  createdAt: string;
};

export type ProcessResult =
  | { status: 'ready'; draft: ExtractionDraft; sources: ExtractionSource[] }
  | { status: 'ignored' }
  | { status: 'failed'; error: string };

export async function allowChat(chatId: number, title: string | null): Promise<void> {
  await query(
    `INSERT INTO telegram_chats (chat_id, title) VALUES ($1, $2)
     ON CONFLICT (chat_id) DO UPDATE SET title = EXCLUDED.title`,
    [chatId, title],
  );
}

export async function removeChat(chatId: number): Promise<void> {
  await query('DELETE FROM telegram_chats WHERE chat_id = $1', [chatId]);
}

export async function migrateChat(from: number, to: number): Promise<void> {
  // Telegram announces the upgrade from both sides; the second update finds nothing to move.
  await query(
    `UPDATE telegram_chats SET chat_id = $2
     WHERE chat_id = $1 AND NOT EXISTS (SELECT 1 FROM telegram_chats WHERE chat_id = $2)`,
    [from, to],
  );
}

export async function isChatListed(chatId: number): Promise<boolean> {
  const result = await query('SELECT 1 FROM telegram_chats WHERE chat_id = $1', [chatId]);
  return Boolean(result.rowCount);
}

/** Returns null when Telegram re-delivers an update we already stored. */
export async function queueMessage(message: TelegramMessage, senderKey: string): Promise<number | null> {
  const result = await query<{ id: number }>(
    `INSERT INTO telegram_messages (chat_id, message_id, message, sender_key) VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (chat_id, message_id) DO NOTHING
     RETURNING id`,
    [message.chat.id, message.message_id, JSON.stringify(message), senderKey],
  );
  return result.rows[0]?.id ?? null;
}

export async function hasPendingFrom(chatId: number, senderKey: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM telegram_messages WHERE chat_id = $1 AND sender_key = $2 AND status = 'pending' LIMIT 1`,
    [chatId, senderKey],
  );
  return Boolean(result.rowCount);
}

export async function hasNewerPending(id: number, chatId: number, senderKey: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM telegram_messages
     WHERE chat_id = $1 AND sender_key = $2 AND status = 'pending' AND id > $3 LIMIT 1`,
    [chatId, senderKey, id],
  );
  return Boolean(result.rowCount);
}

/** Atomically takes every waiting message from one sender in one chat, oldest first. */
export async function claimBundle(
  chatId: number,
  senderKey: string,
): Promise<Array<{ id: number; message: TelegramMessage }>> {
  const result = await query<{ id: number; message: TelegramMessage }>(
    `UPDATE telegram_messages SET status = 'processing', updated_at = now()
     WHERE chat_id = $1 AND sender_key = $2 AND status = 'pending'
     RETURNING id, message`,
    [chatId, senderKey],
  );
  return result.rows.sort((a, b) => a.message.date - b.message.date || a.id - b.id);
}

/** The newest message carries the bundle's result; the others point to it as merged. */
export async function recordBundleResult(ids: number[], result: ProcessResult): Promise<void> {
  const head = ids[ids.length - 1];
  // Only claimed rows are updated, so a dismissal made meanwhile is never overwritten.
  await query(
    `UPDATE telegram_messages
     SET status = $2, draft = $3::jsonb, sources = $4::jsonb, error = $5, updated_at = now()
     WHERE id = $1 AND status = 'processing'`,
    [
      head,
      result.status,
      result.status === 'ready' ? JSON.stringify(result.draft) : null,
      result.status === 'ready' ? JSON.stringify(result.sources) : null,
      result.status === 'failed' ? result.error : null,
    ],
  );
  await query(
    `UPDATE telegram_messages SET status = 'merged', bundle_id = $1, updated_at = now()
     WHERE id = ANY($2::int[]) AND id <> $1 AND status = 'processing'`,
    [head, ids],
  );
}

export async function messageExists(chatId: number, messageId: number): Promise<boolean> {
  const result = await query('SELECT 1 FROM telegram_messages WHERE chat_id = $1 AND message_id = $2', [chatId, messageId]);
  return Boolean(result.rowCount);
}

export async function findChatByTitle(title: string): Promise<number | null> {
  const result = await query<{ chat_id: string }>('SELECT chat_id FROM telegram_chats WHERE title = $1', [title]);
  return result.rows.length === 1 ? Number(result.rows[0].chat_id) : null;
}

/** Stores an already-extracted bundle from a chat export, shaped like a webhook-processed one. */
export async function insertImportedBundle(
  messages: TelegramMessage[],
  senderKey: string,
  result: ProcessResult,
): Promise<void> {
  const ids: number[] = [];
  for (const message of messages) {
    const id = await queueMessage(message, senderKey);
    if (id !== null) ids.push(id);
  }
  if (!ids.length) return;
  await query(`UPDATE telegram_messages SET status = 'processing' WHERE id = ANY($1::int[])`, [ids]);
  await recordBundleResult(ids, result);
}

export async function getInboxItems(): Promise<TelegramInboxItem[]> {
  // Pending rows idle for 10 minutes are treated as stuck (e.g. the function timed out) and offered for retry.
  const result = await query<{
    id: number;
    status: TelegramInboxItem['status'];
    chat_title: string | null;
    draft: ExtractionDraft | null;
    error: string | null;
    created_at: Date;
  }>(`
    SELECT m.id, m.status, COALESCE(c.title, m.message->'chat'->>'title') AS chat_title,
           m.draft, m.error, m.created_at
    FROM telegram_messages m
    LEFT JOIN telegram_chats c ON c.chat_id = m.chat_id
    WHERE m.status IN ('ready', 'failed')
       OR (m.status IN ('pending', 'processing') AND m.updated_at < now() - interval '10 minutes')
    ORDER BY m.created_at DESC
    LIMIT 50
  `);
  return result.rows.map((row) => ({
    id: row.id,
    status: row.status,
    chatTitle: row.chat_title ?? 'Direct message',
    draft: row.draft,
    error: row.error,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function getReadyDraft(
  id: number,
): Promise<{ draft: ExtractionDraft; sources: ExtractionSource[] } | null> {
  const result = await query<{ draft: ExtractionDraft; sources: ExtractionSource[] }>(
    `SELECT draft, sources FROM telegram_messages WHERE id = $1 AND status = 'ready'`,
    [id],
  );
  return result.rows[0] ?? null;
}

/** Puts a failed or stalled bundle back in the queue; returns the bundle's chat and sender. */
export async function markForRetry(id: number): Promise<{ chatId: number; senderKey: string } | null> {
  const result = await query<{ chat_id: string; sender_key: string }>(
    `UPDATE telegram_messages SET status = 'pending', error = NULL, bundle_id = NULL, updated_at = now()
     WHERE (id = $1 AND status IN ('failed', 'pending', 'processing'))
        OR (bundle_id = $1 AND status = 'merged')
     RETURNING chat_id, sender_key`,
    [id],
  );
  const row = result.rows[0];
  return row ? { chatId: Number(row.chat_id), senderKey: row.sender_key } : null;
}

export async function closeInboxItem(id: number, status: 'saved' | 'dismissed'): Promise<void> {
  // Drop the stored files: saved items now live in Storage, dismissed ones are not needed.
  await query(
    `UPDATE telegram_messages SET status = $2, sources = NULL, updated_at = now()
     WHERE id = $1 AND status IN ('pending', 'processing', 'ready', 'failed')`,
    [id, status],
  );
}
