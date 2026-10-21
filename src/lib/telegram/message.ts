import { timingSafeEqual } from 'node:crypto';
import type { ExtractionSource } from '@/domain/opportunity/schema';
import { dateInTimezone } from '@/lib/utils';

export type TelegramChat = {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
};

export type TelegramUser = { id: number; is_bot: boolean };

export type TelegramForwardOrigin =
  | { type: 'channel'; date: number; chat: TelegramChat; message_id: number }
  | { type: 'user' | 'hidden_user' | 'chat'; date: number };

export type TelegramMessage = {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  sender_chat?: TelegramChat;
  text?: string;
  caption?: string;
  entities?: Array<{ type: string; url?: string }>;
  caption_entities?: Array<{ type: string; url?: string }>;
  photo?: Array<{ file_id: string; width: number; height: number; file_size?: number }>;
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  forward_origin?: TelegramForwardOrigin;
  migrate_to_chat_id?: number;
  migrate_from_chat_id?: number;
};

export type TelegramChatMemberUpdate = {
  chat: TelegramChat;
  from: TelegramUser;
  old_chat_member: { status: string };
  new_chat_member: { status: string };
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  my_chat_member?: TelegramChatMemberUpdate;
};

export type DownloadFile = (fileId: string, mimeType: string) => Promise<string>;

// Matches MAX_EXTRACTION_BYTES in src/ai/input.ts; larger files fail extraction anyway.
export const MAX_TELEGRAM_FILE_BYTES = 10 * 1024 * 1024;
// A post split over several messages (screenshot, then its text) arrives within seconds.
export const QUIET_WINDOW_SECONDS = 60;
// One text source plus this many attachments fits ExtractionRequestSchema's 10-source cap.
const MAX_BUNDLE_ATTACHMENTS = 9;
const MIN_TEXT_CHARS = 80;
const URL_PATTERN = /https?:\/\/\S+/i;
const GONE_STATUSES = new Set(['left', 'kicked']);

export function isValidWebhookSecret(received: string | null, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function hasPdf(message: TelegramMessage): boolean {
  const document = message.document;
  return Boolean(document
    && document.mime_type === 'application/pdf'
    && (document.file_size ?? 0) <= MAX_TELEGRAM_FILE_BYTES);
}

/** Cheap pre-filter so chatter never reaches the LLM. */
export function shouldProcess(message: TelegramMessage): boolean {
  if (message.photo?.length || hasPdf(message)) return true;
  const text = message.text ?? message.caption ?? '';
  const entities = [...(message.entities ?? []), ...(message.caption_entities ?? [])];
  if (URL_PATTERN.test(text) || entities.some((entity) => entity.type === 'url' || entity.type === 'text_link')) {
    return true;
  }
  return text.trim().length >= MIN_TEXT_CHARS;
}

/**
 * Only join transitions are judged, so later promotions by others never eject the bot.
 * A join into an already-allowlisted chat (a supergroup upgrade moved the entry there) is kept.
 */
export function membershipAction(
  update: TelegramChatMemberUpdate,
  ownerId: number,
  listed = false,
): 'allow' | 'leave' | 'remove' | 'none' {
  if (update.chat.type === 'private') return 'none';
  const wasIn = !GONE_STATUSES.has(update.old_chat_member.status);
  const isIn = !GONE_STATUSES.has(update.new_chat_member.status);
  if (!wasIn && isIn) {
    if (update.from.id === ownerId) return 'allow';
    return listed ? 'none' : 'leave';
  }
  if (wasIn && !isIn) return 'remove';
  return 'none';
}

export function isAllowedChat(chat: TelegramChat, listed: boolean, ownerId: number): boolean {
  return listed || (chat.type === 'private' && chat.id === ownerId);
}

/** A basic group upgraded to a supergroup gets a new ID; Telegram reports it from both sides. */
export function chatMigration(message: TelegramMessage): { from: number; to: number } | null {
  if (message.migrate_to_chat_id) return { from: message.chat.id, to: message.migrate_to_chat_id };
  if (message.migrate_from_chat_id) return { from: message.migrate_from_chat_id, to: message.chat.id };
  return null;
}

/**
 * Decides what the webhook does with a message. Migration comes first so an upgrade
 * announced by an anonymous admin still moves the allowlist entry. Anonymous admins and
 * channel posts carry a stand-in bot `from` plus `sender_chat`; only real bots are ignored.
 */
export function messageAction(
  message: TelegramMessage,
  listed: boolean,
  ownerId: number,
  continuesBundle = false,
): 'migrate' | 'queue' | 'ignore' {
  if (chatMigration(message)) return 'migrate';
  if (message.from?.is_bot && !message.sender_chat) return 'ignore';
  if (!isAllowedChat(message.chat, listed, ownerId)) return 'ignore';
  // A short follow-up ("internship and jobs in japan" after a link) belongs to the waiting bundle.
  return shouldProcess(message) || continuesBundle ? 'queue' : 'ignore';
}

export function messageLink(chat: TelegramChat, messageId: number): string | null {
  if (chat.type === 'private') return null;
  if (chat.username) return `https://t.me/${chat.username}/${messageId}`;
  const id = String(chat.id);
  if ((chat.type === 'supergroup' || chat.type === 'channel') && id.startsWith('-100')) {
    return `https://t.me/c/${id.slice(4)}/${messageId}`;
  }
  return null;
}

function originLink(message: TelegramMessage): string | null {
  const origin = message.forward_origin;
  if (origin?.type === 'channel') return messageLink(origin.chat, origin.message_id);
  return messageLink(message.chat, message.message_id);
}

function chatLabel(message: TelegramMessage): string {
  const origin = message.forward_origin;
  if (origin?.type === 'channel') return origin.chat.title ?? 'Telegram channel';
  if (message.chat.type === 'private') return 'Direct message to the bot';
  return message.chat.title ?? 'Telegram group';
}

/** Who posted a message; anonymous admins and channel posts are keyed by their chat. */
export function senderKey(message: TelegramMessage): string {
  return String(message.sender_chat?.id ?? message.from?.id ?? message.chat.id);
}

/**
 * Splits a chronological message list into bundles: consecutive messages from one sender with
 * gaps of at most `quietWindowSeconds` describe one post (e.g. a screenshot and its caption).
 */
export function groupIntoBundles(messages: TelegramMessage[], quietWindowSeconds: number): TelegramMessage[][] {
  const bundles: TelegramMessage[][] = [];
  for (const message of messages) {
    const current = bundles[bundles.length - 1];
    const previous = current?.[current.length - 1];
    if (previous && senderKey(previous) === senderKey(message) && message.date - previous.date <= quietWindowSeconds) {
      current.push(message);
    } else {
      bundles.push([message]);
    }
  }
  return bundles;
}

function messageText(message: TelegramMessage, timezone: string): string {
  // The "Posted" line is the date anchor the extraction prompt resolves relative dates against.
  const posted = dateInTimezone(new Date((message.forward_origin?.date ?? message.date) * 1_000), timezone);
  const header = [`Posted ${posted} in Telegram chat "${chatLabel(message)}"`, originLink(message)]
    .filter(Boolean).join('\n');
  // text_link URLs live only in entities; surface them so the model can cite the application link.
  const hiddenLinks = [...(message.entities ?? []), ...(message.caption_entities ?? [])]
    .flatMap((entity) => (entity.type === 'text_link' && entity.url ? [entity.url] : []));
  const text = (message.text ?? message.caption ?? '').trim();
  const body = [text, hiddenLinks.length ? `Links: ${Array.from(new Set(hiddenLinks)).join(' ')}` : '']
    .filter(Boolean).join('\n');
  return [header, body].filter(Boolean).join('\n\n');
}

/** All texts of a bundle become one text source; each photo or PDF becomes its own source. */
export async function buildBundleSources(
  messages: TelegramMessage[],
  download: DownloadFile,
  timezone: string,
): Promise<ExtractionSource[]> {
  const attachments = messages.flatMap((message) => {
    const photos = message.photo ?? [];
    const photo = photos[photos.length - 1];
    return [
      ...(photo ? [{ fileId: photo.file_id, kind: 'image' as const, mimeType: 'image/jpeg', name: 'Telegram photo' }] : []),
      ...(message.document && hasPdf(message)
        ? [{
          fileId: message.document.file_id,
          kind: 'pdf' as const,
          mimeType: 'application/pdf',
          name: message.document.file_name || 'Telegram document.pdf',
        }]
        : []),
    ];
  });
  const included = attachments.slice(0, MAX_BUNDLE_ATTACHMENTS);
  const omitted = attachments.length - included.length;

  const text = [
    ...messages.map((message) => messageText(message, timezone)),
    ...(omitted ? [`(${omitted} more attachments were not included)`] : []),
  ].join('\n\n');
  const sources: ExtractionSource[] = [{
    id: 'telegram-message',
    kind: 'text',
    name: 'Telegram message',
    mimeType: 'text/plain',
    text: text.slice(0, 200_000),
  }];

  for (const [index, attachment] of included.entries()) {
    sources.push({
      id: `telegram-media-${index + 1}`,
      kind: attachment.kind,
      name: attachment.name,
      mimeType: attachment.mimeType,
      dataUri: await download(attachment.fileId, attachment.mimeType),
    });
  }
  return sources;
}
