import { describe, expect, it } from 'vitest';
import {
  buildBundleSources,
  chatMigration,
  groupIntoBundles,
  isAllowedChat,
  isValidWebhookSecret,
  membershipAction,
  messageAction,
  messageLink,
  senderKey,
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

describe('membershipAction after a supergroup upgrade', () => {
  it('stays when a non-owner join lands in an already-allowlisted chat', () => {
    expect(membershipAction(membership({ from: { id: 7, is_bot: false } }), OWNER, true)).toBe('none');
  });
});

describe('messageAction', () => {
  const long = 'Hiring: backend engineer at Example Corp. Apply at https://example.com/jobs before 30 Nov.';
  const anonymousAdmin = { id: 1087968824, is_bot: true };

  it('queues posts by anonymous admins in an allowlisted group', () => {
    expect(messageAction(message({ text: long, from: anonymousAdmin, sender_chat: group }), true, OWNER)).toBe('queue');
  });

  it('ignores real bots', () => {
    expect(messageAction(message({ text: long, from: { id: 99, is_bot: true } }), true, OWNER)).toBe('ignore');
  });

  it('applies a group upgrade even when an anonymous admin triggered it', () => {
    expect(messageAction(message({
      chat: { id: -555, type: 'group' }, from: anonymousAdmin, sender_chat: { id: -555, type: 'group' },
      migrate_to_chat_id: -1009,
    }), true, OWNER)).toBe('migrate');
  });

  it('queues short follow-ups that continue a waiting bundle, but only in allowed chats', () => {
    expect(messageAction(message({ text: 'internship and jobs in japan' }), true, OWNER, true)).toBe('queue');
    expect(messageAction(message({ text: 'internship and jobs in japan' }), false, OWNER, true)).toBe('ignore');
  });

  it('ignores unlisted chats and chatter', () => {
    expect(messageAction(message({ text: long }), false, OWNER)).toBe('ignore');
    expect(messageAction(message({ text: 'thanks!' }), true, OWNER)).toBe('ignore');
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

describe('senderKey', () => {
  it('uses the sender chat for anonymous admins and the user otherwise', () => {
    expect(senderKey(message({ from: { id: 5, is_bot: false } }))).toBe('5');
    expect(senderKey(message({ from: { id: 1087968824, is_bot: true }, sender_chat: group }))).toBe(String(group.id));
  });
});

describe('groupIntoBundles', () => {
  const at = (id: number, seconds: number, from = 1) =>
    message({ message_id: id, date: OCT_21 + seconds, from: { id: from, is_bot: false } });

  it('bundles consecutive messages from one sender within the quiet window', () => {
    const bundles = groupIntoBundles([at(1, 0), at(2, 14), at(3, 70), at(4, 200)], 60);
    expect(bundles.map((bundle) => bundle.map((item) => item.message_id))).toEqual([[1, 2, 3], [4]]);
  });

  it('starts a new bundle when the sender changes', () => {
    const bundles = groupIntoBundles([at(1, 0, 1), at(2, 1, 2), at(3, 2, 2)], 60);
    expect(bundles.map((bundle) => bundle.map((item) => item.message_id))).toEqual([[1], [2, 3]]);
  });
});

describe('buildBundleSources', () => {
  const download = async (fileId: string, mimeType: string) => `data:${mimeType};base64,${fileId}`;
  const photo = (fileId: string) => [{ file_id: `${fileId}-small`, width: 90, height: 90 }, { file_id: fileId, width: 1280, height: 1280 }];

  it('prefixes text with the post date, chat and link', async () => {
    const sources = await buildBundleSources([message({ text: 'Hiring a backend engineer' })], download, 'Asia/Dhaka');
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ kind: 'text', id: 'telegram-message' });
    expect(sources[0].kind === 'text' && sources[0].text).toBe(
      'Posted 2026-10-21 in Telegram chat "CSE Jobs"\nhttps://t.me/c/1234567890/42\n\nHiring a backend engineer',
    );
  });

  it('keeps URLs hidden behind text links', async () => {
    const sources = await buildBundleSources([message({
      text: 'Internship at X — Apply here',
      entities: [{ type: 'text_link', url: 'https://example.com/apply' }],
    })], download, 'Asia/Dhaka');
    expect(sources[0].kind === 'text' && sources[0].text).toContain('https://example.com/apply');
  });

  it('downloads the largest photo size', async () => {
    const sources = await buildBundleSources([message({ caption: 'Scholarship poster', photo: photo('large') })], download, 'Asia/Dhaka');
    expect(sources[1]).toMatchObject({ kind: 'image', id: 'telegram-media-1', dataUri: 'data:image/jpeg;base64,large' });
  });

  it('downloads a PDF document', async () => {
    const sources = await buildBundleSources([message({
      document: { file_id: 'doc', file_name: 'circular.pdf', mime_type: 'application/pdf', file_size: 500 },
    })], download, 'Asia/Dhaka');
    expect(sources[1]).toMatchObject({ kind: 'pdf', name: 'circular.pdf', dataUri: 'data:application/pdf;base64,doc' });
  });

  it('combines a screenshot and its follow-up text into one text source plus the image', async () => {
    const sources = await buildBundleSources([
      message({ message_id: 42, photo: photo('shot') }),
      message({ message_id: 43, date: OCT_21 + 14, text: 'UNDP Digital, AI and Innovation Internship 2026' }),
    ], download, 'Asia/Dhaka');
    expect(sources.map((source) => source.kind)).toEqual(['text', 'image']);
    const text = sources[0].kind === 'text' ? sources[0].text : '';
    expect(text).toContain('https://t.me/c/1234567890/42');
    expect(text).toContain('https://t.me/c/1234567890/43\n\nUNDP Digital, AI and Innovation Internship 2026');
  });

  it('caps attachments and says how many were left out', async () => {
    const shots = Array.from({ length: 11 }, (_, index) => message({ message_id: 100 + index, photo: photo(`p${index}`) }));
    const sources = await buildBundleSources(shots, download, 'Asia/Dhaka');
    expect(sources).toHaveLength(10);
    expect(sources[0].kind === 'text' && sources[0].text).toContain('2 more attachments were not included');
  });

  it('anchors a forwarded channel post to its original date and link', async () => {
    const sources = await buildBundleSources([message({
      chat: ownerDm,
      text: 'Fully funded MSc scholarship',
      forward_origin: {
        type: 'channel', date: OCT_01, message_id: 7,
        chat: { id: -1009, type: 'channel', title: 'Scholarships BD', username: 'scholarbd' },
      },
    })], download, 'Asia/Dhaka');
    expect(sources[0].kind === 'text' && sources[0].text).toBe(
      'Posted 2026-10-01 in Telegram chat "Scholarships BD"\nhttps://t.me/scholarbd/7\n\nFully funded MSc scholarship',
    );
  });

  it('labels a forwarded user message in the owner DM without a link', async () => {
    const sources = await buildBundleSources([message({
      chat: ownerDm, text: 'Internship open', forward_origin: { type: 'user', date: OCT_01 },
    })], download, 'Asia/Dhaka');
    expect(sources[0].kind === 'text' && sources[0].text).toBe(
      'Posted 2026-10-01 in Telegram chat "Direct message to the bot"\n\nInternship open',
    );
  });
});
