import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { extractOpportunityDetails } from '@/ai';
import { parseTelegramExportHtml } from '@/lib/telegram/export';
import {
  buildBundleSources,
  groupIntoBundles,
  QUIET_WINDOW_SECONDS,
  senderKey,
  shouldProcess,
  type DownloadFile,
} from '@/lib/telegram/message';
import { findChatByTitle, insertImportedBundle, messageExists } from '@/lib/telegram/store';

/** Imports a Telegram Desktop HTML export into the review inbox, bundled like live messages. */
export async function main(directory: string | undefined): Promise<void> {
  if (!directory) throw new Error('Usage: npm run telegram:import -- <export directory>');
  const html = await readFile(path.join(directory, 'messages.html'), 'utf8');

  const { title } = parseTelegramExportHtml(html);
  const chat = await findChatByTitle(title);
  if (!chat) throw new Error(`Add the bot to "${title}" first; no single allowlisted chat has that title.`);
  const { chatId, addedAt } = chat;
  // Only history: the bot already receives everything posted after it joined.
  const parsed = parseTelegramExportHtml(html, chatId).messages;
  const messages = parsed
    .filter((message) => message.date * 1_000 < addedAt.getTime())
    // Negated ids: in basic groups message ids differ per account, so an exported id could
    // equal an unrelated live one and make ON CONFLICT drop it. Export ids are always positive.
    .map((message) => ({ ...message, message_id: -message.message_id }));
  if (messages.length < parsed.length) {
    console.log(`Skipping ${parsed.length - messages.length} messages posted after the bot joined.`);
  }

  const readLocalFile: DownloadFile = async (file, mimeType) => {
    const bytes = await readFile(path.join(directory, file));
    return `data:${mimeType};base64,${bytes.toString('base64')}`;
  };
  const timezone = process.env.APP_TIMEZONE || 'Asia/Dhaka';

  const bundles = groupIntoBundles(messages, QUIET_WINDOW_SECONDS).filter((bundle) => bundle.some(shouldProcess));
  console.log(`"${title}": ${messages.length} messages in ${bundles.length} bundles`);

  for (const bundle of bundles) {
    const label = bundle.map((message) => -message.message_id).join('+');
    const head = bundle[bundle.length - 1];
    if (await messageExists(chatId, head.message_id)) {
      console.log(`- ${label}: already imported, skipped`);
      continue;
    }
    try {
      const sources = await buildBundleSources(bundle, readLocalFile, timezone);
      const draft = await extractOpportunityDetails({ sources });
      await insertImportedBundle(bundle, senderKey(head), draft.opportunities.length
        ? { status: 'ready', draft, sources }
        : { status: 'ignored' });
      const names = draft.opportunities.map((item) => item.opportunity.name);
      console.log(`- ${label}: ${names.length ? names.join('; ') : 'no opportunity found'}`);
    } catch (error) {
      // Not stored: inbox Retry re-downloads from Telegram, but these files only exist on disk.
      const message = error instanceof Error ? error.message : 'Extraction failed.';
      console.log(`- ${label}: failed (${message.slice(0, 200)}); re-run the import to retry it`);
    }
  }
}
