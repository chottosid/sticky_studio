import 'server-only';

import type { QueryResult, QueryResultRow } from 'pg';
import { getClient, query } from '@/lib/db';
import type { ExtractionDraft, ExtractionSource } from '@/domain/opportunity/schema';
import type { TelegramMessage } from './message';

export type TelegramInboxItem = {
  id: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  chatTitle: string;
  draft: ExtractionDraft | null;
  error: string | null;
  createdAt: string;
};

export type ProcessResult =
  | { status: 'ready'; draft: ExtractionDraft; sources: ExtractionSource[] }
  | { status: 'ignored' }
  | { status: 'failed'; error: string };

export type ClaimedRow = { id: number; message: TelegramMessage };

type Run = <Row extends QueryResultRow = QueryResultRow>(text: string, params?: readonly unknown[]) => Promise<QueryResult<Row>>;

async function inTransaction<T>(work: (run: Run) => Promise<T>): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await work((text, params = []) => client.query(text, [...params]));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

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

/** A recent waiting message from this sender means a new one may be its continuation. */
export async function hasPendingFrom(chatId: number, senderKey: string): Promise<boolean> {
  // Recent only: a stalled row must not turn every later "ok" into a follow-up.
  const result = await query(
    `SELECT 1 FROM telegram_messages
     WHERE chat_id = $1 AND sender_key = $2 AND status = 'pending' AND created_at > now() - interval '2 minutes'
     LIMIT 1`,
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

// Claims rows in one statement and points every claimed row at the claim's newest row, so a run
// that dies mid-extraction leaves one stalled inbox item whose Retry brings back all its members.
const CLAIM = (where: string) => `
  WITH picked AS (
    SELECT id FROM telegram_messages WHERE ${where} AND status = 'pending' FOR UPDATE SKIP LOCKED
  ), head AS (SELECT max(id) AS id FROM picked)
  UPDATE telegram_messages t
  SET status = 'processing', updated_at = now(),
      bundle_id = CASE WHEN t.id = head.id THEN NULL ELSE head.id END
  FROM picked, head
  WHERE t.id = picked.id
  RETURNING t.id, t.message`;

const byPostingTime = (rows: ClaimedRow[]) =>
  rows.sort((a, b) => a.message.date - b.message.date || a.id - b.id);

/** Takes every waiting message from one sender in one chat, oldest first. */
export async function claimPendingFrom(chatId: number, senderKey: string): Promise<ClaimedRow[]> {
  const result = await query<ClaimedRow>(CLAIM('chat_id = $1 AND sender_key = $2'), [chatId, senderKey]);
  return byPostingTime(result.rows);
}

/** Takes exactly these waiting rows (a retried bundle), oldest first. */
export async function claimRows(ids: number[]): Promise<ClaimedRow[]> {
  const result = await query<ClaimedRow>(CLAIM('id = ANY($1::int[])'), [ids]);
  return byPostingTime(result.rows);
}

async function recordWith(run: Run, ids: number[], result: ProcessResult): Promise<void> {
  const head = ids[ids.length - 1];
  // Only claimed rows are updated, so a dismissal made meanwhile is never overwritten.
  await run(
    `UPDATE telegram_messages
     SET status = $2, draft = $3::jsonb, sources = $4::jsonb, error = $5, bundle_id = NULL, updated_at = now()
     WHERE id = $1 AND status = 'processing'`,
    [
      head,
      result.status,
      result.status === 'ready' ? JSON.stringify(result.draft) : null,
      result.status === 'ready' ? JSON.stringify(result.sources) : null,
      result.status === 'failed' ? result.error : null,
    ],
  );
  await run(
    `UPDATE telegram_messages SET status = 'merged', bundle_id = $1, updated_at = now()
     WHERE id = ANY($2::int[]) AND id <> $1 AND status = 'processing'`,
    [head, ids],
  );
}

/** The newest message (last id) carries the bundle's result; the others point to it as merged. */
export async function recordBundleResult(ids: number[], result: ProcessResult): Promise<void> {
  await inTransaction((run) => recordWith(run, ids, result));
}

export async function messageExists(chatId: number, messageId: number): Promise<boolean> {
  const result = await query('SELECT 1 FROM telegram_messages WHERE chat_id = $1 AND message_id = $2', [chatId, messageId]);
  return Boolean(result.rowCount);
}

export async function findChatByTitle(title: string): Promise<{ chatId: number; addedAt: Date } | null> {
  const result = await query<{ chat_id: string; added_at: Date }>(
    'SELECT chat_id, added_at FROM telegram_chats WHERE title = $1',
    [title],
  );
  const row = result.rows.length === 1 ? result.rows[0] : null;
  return row ? { chatId: Number(row.chat_id), addedAt: row.added_at } : null;
}

/**
 * Stores an already-extracted bundle from a chat export, shaped like a webhook-processed one.
 * Callers pass message ids that cannot collide with live ones (see scripts/telegram-import.ts).
 */
export async function insertImportedBundle(
  messages: TelegramMessage[],
  senderKey: string,
  result: ProcessResult,
): Promise<void> {
  await inTransaction(async (run) => {
    const ids: number[] = [];
    for (const message of messages) {
      const inserted = await run<{ id: number }>(
        `INSERT INTO telegram_messages (chat_id, message_id, message, sender_key, status)
         VALUES ($1, $2, $3::jsonb, $4, 'processing')
         ON CONFLICT (chat_id, message_id) DO NOTHING
         RETURNING id`,
        [message.chat.id, message.message_id, JSON.stringify(message), senderKey],
      );
      if (inserted.rows[0]) ids.push(inserted.rows[0].id);
    }
    if (ids.length) await recordWith(run, ids, result);
  });
}

export async function getInboxItems(): Promise<TelegramInboxItem[]> {
  // Bundles idle for 10 minutes before finishing are treated as stuck (e.g. the function timed out)
  // and offered for retry; only their head row is listed.
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
       OR (m.status IN ('pending', 'processing') AND m.bundle_id IS NULL
           AND m.updated_at < now() - interval '10 minutes')
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

/**
 * Puts a failed or stalled bundle back in the queue and returns exactly its row ids.
 * Members are reset only when the head itself qualified, so a stale second click is a no-op.
 */
export async function markForRetry(id: number): Promise<number[]> {
  const result = await query<{ id: number }>(
    `WITH head AS (
       UPDATE telegram_messages SET status = 'pending', error = NULL, updated_at = now()
       WHERE id = $1 AND bundle_id IS NULL
         AND (status = 'failed'
              OR (status IN ('pending', 'processing') AND updated_at < now() - interval '10 minutes'))
       RETURNING id
     ), members AS (
       UPDATE telegram_messages SET status = 'pending', updated_at = now()
       WHERE bundle_id = $1 AND status IN ('merged', 'processing', 'pending') AND EXISTS (SELECT 1 FROM head)
       RETURNING id
     )
     SELECT id FROM head UNION ALL SELECT id FROM members`,
    [id],
  );
  return result.rows.map((row) => row.id);
}

export async function closeInboxItem(id: number, status: 'saved' | 'dismissed'): Promise<void> {
  // Drop the stored files: saved items now live in Storage, dismissed ones are not needed.
  // Members of a stalled bundle are closed with their head instead of resurfacing on their own.
  await query(
    `UPDATE telegram_messages SET status = $2, sources = NULL, updated_at = now()
     WHERE (id = $1 AND status IN ('pending', 'processing', 'ready', 'failed'))
        OR (bundle_id = $1 AND status IN ('pending', 'processing'))`,
    [id, status],
  );
}
