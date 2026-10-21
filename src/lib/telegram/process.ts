import 'server-only';

import { extractOpportunityDetails } from '@/ai';
import { downloadFileAsDataUri } from './api';
import { buildBundleSources, groupIntoBundles, QUIET_WINDOW_SECONDS } from './message';
import { claimPendingFrom, hasNewerPending, recordBundleResult, type ClaimedRow } from './store';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits for the sender to go quiet, then extracts everything they posted.
 * If they posted again meanwhile, that newer message's run takes over instead.
 */
export async function processAfterQuietWindow(id: number, chatId: number, senderKey: string): Promise<void> {
  try {
    await sleep(QUIET_WINDOW_SECONDS * 1_000);
    if (await hasNewerPending(id, chatId, senderKey)) return;
    await processClaimedRows(await claimPendingFrom(chatId, senderKey));
  } catch (error) {
    // Rows stay pending or processing and surface in the inbox for Retry after 10 minutes.
    console.error(`Telegram message ${id} could not be processed:`, error);
  }
}

/** Splits claimed rows into posts (same rules as the importer) and extracts each one separately. */
export async function processClaimedRows(rows: ClaimedRow[]): Promise<void> {
  const idOf = new Map(rows.map((row) => [row.message, row.id]));
  const bundles = groupIntoBundles(rows.map((row) => row.message), QUIET_WINDOW_SECONDS);

  for (const bundle of bundles) {
    const ids = bundle.map((message) => idOf.get(message)!);
    try {
      const sources = await buildBundleSources(bundle, downloadFileAsDataUri, process.env.APP_TIMEZONE || 'Asia/Dhaka');
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
}
