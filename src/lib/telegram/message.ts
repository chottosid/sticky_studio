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
  text?: string;
  caption?: string;
  entities?: Array<{ type: string }>;
  caption_entities?: Array<{ type: string }>;
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

/** Only join transitions are judged, so later promotions by others never eject the bot. */
export function membershipAction(
  update: TelegramChatMemberUpdate,
  ownerId: number,
): 'allow' | 'leave' | 'remove' | 'none' {
  if (update.chat.type === 'private') return 'none';
  const wasIn = !GONE_STATUSES.has(update.old_chat_member.status);
  const isIn = !GONE_STATUSES.has(update.new_chat_member.status);
  if (!wasIn && isIn) return update.from.id === ownerId ? 'allow' : 'leave';
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

export async function buildTelegramSources(
  message: TelegramMessage,
  download: DownloadFile,
  timezone: string,
): Promise<ExtractionSource[]> {
  // The "Posted" line is the date anchor the extraction prompt resolves relative dates against.
  const posted = dateInTimezone(new Date((message.forward_origin?.date ?? message.date) * 1_000), timezone);
  const header = [`Posted ${posted} in Telegram chat "${chatLabel(message)}"`, originLink(message)]
    .filter(Boolean).join('\n');
  const body = (message.text ?? message.caption ?? '').trim();

  const sources: ExtractionSource[] = [{
    id: 'telegram-message',
    kind: 'text',
    name: 'Telegram message',
    mimeType: 'text/plain',
    text: [header, body].filter(Boolean).join('\n\n').slice(0, 200_000),
  }];

  const photos = message.photo ?? [];
  const photo = photos[photos.length - 1];
  if (photo) {
    sources.push({
      id: 'telegram-photo',
      kind: 'image',
      name: 'Telegram photo',
      mimeType: 'image/jpeg',
      dataUri: await download(photo.file_id, 'image/jpeg'),
    });
  }

  if (message.document && hasPdf(message)) {
    sources.push({
      id: 'telegram-pdf',
      kind: 'pdf',
      name: message.document.file_name || 'Telegram document.pdf',
      mimeType: 'application/pdf',
      dataUri: await download(message.document.file_id, 'application/pdf'),
    });
  }
  return sources;
}
