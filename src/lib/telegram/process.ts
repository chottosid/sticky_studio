import 'server-only';

import { extractOpportunityDetails } from '@/ai';
import { downloadFileAsDataUri } from './api';
import { buildBundleSources, QUIET_WINDOW_SECONDS } from './message';
import { claimBundle, hasNewerPending, recordBundleResult } from './store';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits for the sender to go quiet, then extracts everything they posted as one bundle.
 * If they posted again meanwhile, that newer message's run takes the whole bundle instead.
 */
export async function processAfterQuietWindow(id: number, chatId: number, senderKey: string): Promise<void> {
  await sleep(QUIET_WINDOW_SECONDS * 1_000);
  if (await hasNewerPending(id, chatId, senderKey)) return;
  await processTelegramBundle(chatId, senderKey);
}

export async function processTelegramBundle(chatId: number, senderKey: string): Promise<void> {
  const rows = await claimBundle(chatId, senderKey);
  if (!rows.length) return;
  const ids = rows.map((row) => row.id);

  try {
    const sources = await buildBundleSources(
      rows.map((row) => row.message),
      downloadFileAsDataUri,
      process.env.APP_TIMEZONE || 'Asia/Dhaka',
    );
    const draft = await extractOpportunityDetails({ sources });
    await recordBundleResult(ids, draft.opportunities.length
      ? { status: 'ready', draft, sources }
      : { status: 'ignored' });
  } catch (error) {
    console.error(`Telegram bundle ${ids.join(',')} could not be processed:`, error);
    await recordBundleResult(ids, {
      status: 'failed',
      error: error instanceof Error ? error.message.slice(0, 1_000) : 'Processing failed.',
    });
  }
}
