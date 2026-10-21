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
  const chatId = await findChatByTitle(title);
  if (chatId === null) throw new Error(`Add the bot to "${title}" first; no single allowlisted chat has that title.`);
  const { messages } = parseTelegramExportHtml(html, chatId);

  const readLocalFile: DownloadFile = async (file, mimeType) => {
    const bytes = await readFile(path.join(directory, file));
    return `data:${mimeType};base64,${bytes.toString('base64')}`;
  };
  const timezone = process.env.APP_TIMEZONE || 'Asia/Dhaka';

  const bundles = groupIntoBundles(messages, QUIET_WINDOW_SECONDS).filter((bundle) => bundle.some(shouldProcess));
  console.log(`"${title}": ${messages.length} messages in ${bundles.length} bundles`);

  for (const bundle of bundles) {
    const label = bundle.map((message) => message.message_id).join('+');
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
