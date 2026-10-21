import type { TelegramMessage } from './message';

// Parses the HTML that Telegram Desktop's "Export chat history" writes (messages.html).
// ponytail: regex over the export's fixed markup, not a DOM parser; handles text, photos,
// links and forwards — add files/ (PDF) and multi-page exports when an export needs them.

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»' };

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? entity;
    return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
  });
}

const plain = (html: string) => decode(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).trim();

/** "12.09.2026 12:27:48 UTC+06:00" → Unix seconds. */
function exportDate(title: string): number {
  const match = /(\d{2})\.(\d{2})\.(\d{4}) (\d{2}:\d{2}:\d{2}) UTC([+-]\d{2}:\d{2})/.exec(title);
  if (!match) throw new Error(`Unrecognized export date: ${title}`);
  const [, day, month, year, time, offset] = match;
  return Date.parse(`${year}-${month}-${day}T${time}${offset}`) / 1_000;
}

/** Stable numeric stand-in for a sender, since the HTML export only has display names. */
function nameId(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) % 2_147_483_647;
  return hash + 1;
}

export function parseTelegramExportHtml(html: string, chatId = 0): { title: string; messages: TelegramMessage[] } {
  const title = plain(/<div class="page_header">[\s\S]*?<div class="text bold">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '');
  const chat = { id: chatId, type: 'group' as const, title };
  const messages: TelegramMessage[] = [];
  let sender: string | null = null;

  const blocks = html.split(/(?=<div class="message )/).slice(1);
  for (const block of blocks) {
    const header = /^<div class="message ([^"]+)" id="message(-?\d+)"/.exec(block);
    if (!header || !header[1].split(' ').includes('default')) continue;

    const [outer, forwarded] = block.split('<div class="forwarded body">');
    const outerName = /<div class="from_name">([\s\S]*?)<\/div>/.exec(outer)?.[1];
    if (outerName) sender = plain(outerName);
    const posted = /class="pull_right date details" title="([^"]+)"/.exec(outer)?.[1];
    if (!posted || !sender) continue;

    const message: TelegramMessage = {
      message_id: Number(header[2]),
      date: exportDate(posted),
      chat,
      from: { id: nameId(sender), is_bot: false },
    };

    const forwardedFrom = forwarded && /<div class="from_name">([\s\S]*?)<span class="date details" title="([^"]+)"/.exec(forwarded);
    if (forwardedFrom) {
      message.forward_origin = {
        type: 'hidden_user', sender_user_name: plain(forwardedFrom[1]), date: exportDate(forwardedFrom[2]),
      };
    }

    const photo = /<a class="photo_wrap[^"]*" href="([^"]+)"/.exec(block)?.[1];
    if (photo) message.photo = [{ file_id: decode(photo), width: 0, height: 0 }];

    const textHtml = /<div class="text">([\s\S]*?)<\/div>/.exec(block)?.[1];
    if (textHtml) {
      message.text = plain(textHtml);
      const hidden = Array.from(textHtml.matchAll(/<a href="(https?:[^"]+)">([\s\S]*?)<\/a>/g))
        .filter(([, href, label]) => decode(href) !== plain(label))
        .map(([, href]) => ({ type: 'text_link', url: decode(href) }));
      if (hidden.length) message.entities = hidden;
    }
    messages.push(message);
  }
  return { title, messages };
}
