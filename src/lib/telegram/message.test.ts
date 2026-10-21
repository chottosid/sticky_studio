import { describe, expect, it } from 'vitest';
import {
  buildTelegramSources,
  chatMigration,
  isAllowedChat,
  isValidWebhookSecret,
  membershipAction,
  messageLink,
  shouldProcess,
  type TelegramChat,
  type TelegramChatMemberUpdate,
  type TelegramMessage,
} from './message';

const OWNER = 342114490;
const OCT_21 = 1792562400; // 2026-10-21T06:00:00Z
const OCT_01 = 1790834400; // 2026-10-01T06:00:00Z
const group: TelegramChat = { id: -1001234567890, type: 'supergroup', title: 'CSE Jobs' };
const ownerDm: TelegramChat = { id: OWNER, type: 'private', username: 'chottosid' };

const message = (overrides: Partial<TelegramMessage> = {}): TelegramMessage => ({
  message_id: 42, date: OCT_21, chat: group, from: { id: 1, is_bot: false }, ...overrides,
});

const membership = (overrides: Partial<TelegramChatMemberUpdate>): TelegramChatMemberUpdate => ({
  chat: group,
  from: { id: OWNER, is_bot: false },
  old_chat_member: { status: 'left' },
  new_chat_member: { status: 'member' },
  ...overrides,
});

describe('isValidWebhookSecret', () => {
  it('accepts only an exact match with a configured secret', () => {
    expect(isValidWebhookSecret('abc', 'abc')).toBe(true);
    expect(isValidWebhookSecret('abd', 'abc')).toBe(false);
    expect(isValidWebhookSecret('ab', 'abc')).toBe(false);
    expect(isValidWebhookSecret(null, 'abc')).toBe(false);
    expect(isValidWebhookSecret('abc', undefined)).toBe(false);
    expect(isValidWebhookSecret('', '')).toBe(false);
  });
});

describe('shouldProcess', () => {
  it('skips short chatter', () => {
    expect(shouldProcess(message({ text: 'thanks!' }))).toBe(false);
    expect(shouldProcess(message({}))).toBe(false);
  });

  it('keeps links, long text, photos and small PDFs', () => {
    expect(shouldProcess(message({ text: 'Apply: https://example.com/jobs' }))).toBe(true);
    expect(shouldProcess(message({ text: 'Apply here', entities: [{ type: 'text_link' }] }))).toBe(true);
    expect(shouldProcess(message({ text: 'x'.repeat(80) }))).toBe(true);
    expect(shouldProcess(message({ photo: [{ file_id: 'p', width: 90, height: 90 }] }))).toBe(true);
    expect(shouldProcess(message({
      document: { file_id: 'd', mime_type: 'application/pdf', file_size: 1_000 },
    }))).toBe(true);
  });

  it('skips oversized and non-PDF documents without text', () => {
    expect(shouldProcess(message({
      document: { file_id: 'd', mime_type: 'application/pdf', file_size: 11 * 1024 * 1024 },
    }))).toBe(false);
    expect(shouldProcess(message({ document: { file_id: 'd', mime_type: 'application/zip' } }))).toBe(false);
  });
});

describe('membershipAction', () => {
  it('allows only joins performed by the owner', () => {
    expect(membershipAction(membership({}), OWNER)).toBe('allow');
    expect(membershipAction(membership({ from: { id: 7, is_bot: false } }), OWNER)).toBe('leave');
  });

  it('removes the chat when the bot is kicked or leaves', () => {
    expect(membershipAction(membership({
      old_chat_member: { status: 'member' }, new_chat_member: { status: 'kicked' },
    }), OWNER)).toBe('remove');
  });

  it('ignores promotions by others in an already-joined group', () => {
    expect(membershipAction(membership({
      from: { id: 7, is_bot: false },
      old_chat_member: { status: 'member' },
      new_chat_member: { status: 'administrator' },
    }), OWNER)).toBe('none');
  });

  it('never acts on private chats, even when a stranger starts the bot', () => {
    expect(membershipAction(membership({
      chat: { id: 7, type: 'private' }, from: { id: 7, is_bot: false },
    }), OWNER)).toBe('none');
  });
});

describe('isAllowedChat', () => {
  it('allows listed groups and the owner DM only', () => {
    expect(isAllowedChat(group, true, OWNER)).toBe(true);
    expect(isAllowedChat(group, false, OWNER)).toBe(false);
    expect(isAllowedChat(ownerDm, false, OWNER)).toBe(true);
    expect(isAllowedChat({ id: 7, type: 'private' }, false, OWNER)).toBe(false);
  });
});

describe('chatMigration', () => {
  it('detects a group upgrade from either side', () => {
    expect(chatMigration(message({ chat: { id: -555, type: 'group' }, migrate_to_chat_id: -1009 })))
      .toEqual({ from: -555, to: -1009 });
    expect(chatMigration(message({ chat: { id: -1009, type: 'supergroup' }, migrate_from_chat_id: -555 })))
      .toEqual({ from: -555, to: -1009 });
    expect(chatMigration(message({ text: 'hello' }))).toBeNull();
  });
});

describe('messageLink', () => {
  it('links public chats, private supergroups, and nothing else', () => {
    expect(messageLink({ id: -1001, type: 'supergroup', username: 'csejobs' }, 42)).toBe('https://t.me/csejobs/42');
    expect(messageLink(group, 42)).toBe('https://t.me/c/1234567890/42');
    expect(messageLink({ id: -555, type: 'group' }, 42)).toBeNull();
    expect(messageLink(ownerDm, 42)).toBeNull();
  });
});

describe('buildTelegramSources', () => {
  const download = async (fileId: string, mimeType: string) => `data:${mimeType};base64,${fileId}`;

  it('prefixes text with the post date, chat and link', async () => {
    const sources = await buildTelegramSources(message({ text: 'Hiring a backend engineer' }), download, 'Asia/Dhaka');
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ kind: 'text', id: 'telegram-message' });
    expect(sources[0].kind === 'text' && sources[0].text).toBe(
      'Posted 2026-10-21 in Telegram chat "CSE Jobs"\nhttps://t.me/c/1234567890/42\n\nHiring a backend engineer',
    );
  });

  it('downloads the largest photo size', async () => {
    const sources = await buildTelegramSources(message({
      caption: 'Scholarship poster',
      photo: [{ file_id: 'small', width: 90, height: 90 }, { file_id: 'large', width: 1280, height: 1280 }],
    }), download, 'Asia/Dhaka');
    expect(sources[1]).toMatchObject({ kind: 'image', dataUri: 'data:image/jpeg;base64,large' });
  });

  it('downloads a PDF document', async () => {
    const sources = await buildTelegramSources(message({
      document: { file_id: 'doc', file_name: 'circular.pdf', mime_type: 'application/pdf', file_size: 500 },
    }), download, 'Asia/Dhaka');
    expect(sources[1]).toMatchObject({ kind: 'pdf', name: 'circular.pdf', dataUri: 'data:application/pdf;base64,doc' });
  });

  it('anchors a forwarded channel post to its original date and link', async () => {
    const sources = await buildTelegramSources(message({
      chat: ownerDm,
      text: 'Fully funded MSc scholarship',
      forward_origin: {
        type: 'channel', date: OCT_01, message_id: 7,
        chat: { id: -1009, type: 'channel', title: 'Scholarships BD', username: 'scholarbd' },
      },
    }), download, 'Asia/Dhaka');
    expect(sources[0].kind === 'text' && sources[0].text).toBe(
      'Posted 2026-10-01 in Telegram chat "Scholarships BD"\nhttps://t.me/scholarbd/7\n\nFully funded MSc scholarship',
    );
  });

  it('labels a forwarded user message in the owner DM without a link', async () => {
    const sources = await buildTelegramSources(message({
      chat: ownerDm, text: 'Internship open', forward_origin: { type: 'user', date: OCT_01 },
    }), download, 'Asia/Dhaka');
    expect(sources[0].kind === 'text' && sources[0].text).toBe(
      'Posted 2026-10-01 in Telegram chat "Direct message to the bot"\n\nInternship open',
    );
  });
});
