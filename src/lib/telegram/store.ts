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

type ProcessResult =
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
export async function queueMessage(message: TelegramMessage): Promise<number | null> {
  const result = await query<{ id: number }>(
    `INSERT INTO telegram_messages (chat_id, message_id, message) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (chat_id, message_id) DO NOTHING
     RETURNING id`,
    [message.chat.id, message.message_id, JSON.stringify(message)],
  );
  return result.rows[0]?.id ?? null;
}

export async function getPendingMessage(id: number): Promise<TelegramMessage | null> {
  const result = await query<{ message: TelegramMessage }>(
    `SELECT message FROM telegram_messages WHERE id = $1 AND status = 'pending'`,
    [id],
  );
  return result.rows[0]?.message ?? null;
}

export async function recordResult(id: number, result: ProcessResult): Promise<void> {
  // Only a pending row is updated, so a dismissal made meanwhile is never overwritten.
  await query(
    `UPDATE telegram_messages
     SET status = $2, draft = $3::jsonb, sources = $4::jsonb, error = $5, updated_at = now()
     WHERE id = $1 AND status = 'pending'`,
    [
      id,
      result.status,
      result.status === 'ready' ? JSON.stringify(result.draft) : null,
      result.status === 'ready' ? JSON.stringify(result.sources) : null,
      result.status === 'failed' ? result.error : null,
    ],
  );
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
       OR (m.status = 'pending' AND m.updated_at < now() - interval '10 minutes')
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

export async function markForRetry(id: number): Promise<boolean> {
  const result = await query(
    `UPDATE telegram_messages SET status = 'pending', error = NULL, updated_at = now()
     WHERE id = $1 AND status IN ('failed', 'pending')`,
    [id],
  );
  return Boolean(result.rowCount);
}

export async function closeInboxItem(id: number, status: 'saved' | 'dismissed'): Promise<void> {
  // Drop the stored files: saved items now live in Storage, dismissed ones are not needed.
  await query(
    `UPDATE telegram_messages SET status = $2, sources = NULL, updated_at = now()
     WHERE id = $1 AND status IN ('pending', 'ready', 'failed')`,
    [id, status],
  );
}
