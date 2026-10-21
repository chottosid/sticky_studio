import 'server-only';

import { extractOpportunityDetails } from '@/ai';
import { downloadFileAsDataUri } from './api';
import { buildTelegramSources } from './message';
import { getPendingMessage, recordResult } from './store';

export async function processTelegramMessage(id: number): Promise<void> {
  const message = await getPendingMessage(id);
  if (!message) return;

  try {
    const sources = await buildTelegramSources(
      message,
      downloadFileAsDataUri,
      process.env.APP_TIMEZONE || 'Asia/Dhaka',
    );
    const draft = await extractOpportunityDetails({ sources });
    await recordResult(id, draft.opportunities.length
      ? { status: 'ready', draft, sources }
      : { status: 'ignored' });
  } catch (error) {
    console.error(`Telegram message ${id} could not be processed:`, error);
    await recordResult(id, {
      status: 'failed',
      error: error instanceof Error ? error.message.slice(0, 1_000) : 'Processing failed.',
    });
  }
}
