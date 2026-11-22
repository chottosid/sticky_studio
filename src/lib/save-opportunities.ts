import 'server-only';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { runAssessmentJobs, scheduleAssessments } from './applicant-assessments';
import type { Evidence, ExtractionSource, OpportunityInput } from '@/domain/opportunity/schema';
import { insertOpportunity } from './data';
import { getClient, query } from './db';
import { lockSourceStorage, removeStoredSources, uploadOpportunitySources, type UploadedSource } from './source-storage';
import { createDuplicateConfirmationToken, findDuplicateMatches, verifyDuplicateConfirmationToken } from './duplicates';

export type SaveOpportunityBatchInput = {
  opportunities: OpportunityInput[];
  sources: ExtractionSource[];
  discoveredSourceUrls: string[];
  evidence?: Evidence[][];
  requestId?: string;
  telegramMessageId?: number;
  duplicateConfirmationToken?: string;
};

const savedMessage = (count: number) => ({ success: true as const, message: `Saved ${count} ${count === 1 ? 'opportunity' : 'opportunities'}` });

async function publishBatch(input: SaveOpportunityBatchInput, uploaded: UploadedSource[]) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    if (input.requestId) {
      const receipt = await client.query(`
        INSERT INTO opportunity_save_receipts(request_id, saved_count) VALUES ($1, $2)
        ON CONFLICT DO NOTHING RETURNING request_id
      `, [input.requestId, input.opportunities.length]);
      if (!receipt.rowCount) {
        await client.query('COMMIT');
        return [];
      }
    }
    if (input.telegramMessageId) {
      const claim = await client.query(`
        UPDATE telegram_messages SET status = 'saved', sources = NULL, updated_at = now()
        WHERE id = $1 AND status = 'ready' RETURNING id
      `, [input.telegramMessageId]);
      if (!claim.rowCount) throw new Error('This inbox item is no longer available.');
    }
    if (input.sources.length > 0) {
      await lockSourceStorage(client);
      await uploadOpportunitySources(input.sources, uploaded);
    }
    const ids: string[] = [];
    for (const [index, opportunity] of input.opportunities.entries()) {
      ids.push(await insertOpportunity(client, opportunity, uploaded, input.discoveredSourceUrls, input.evidence?.[index] ?? []));
    }
    await client.query('COMMIT');
    return ids;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Callers authenticate before invoking this server-only module. */
export async function saveOpportunityBatch(input: SaveOpportunityBatchInput) {
  const { opportunities, sources, discoveredSourceUrls } = input;
  const duplicateInput = { opportunities, sources, discoveredSourceUrls };
  const uploaded: UploadedSource[] = [];
  try {
    if (input.requestId) {
      const { rows } = await query<{ saved_count: number }>('SELECT saved_count FROM opportunity_save_receipts WHERE request_id = $1', [input.requestId]);
      if (rows[0]) return savedMessage(rows[0].saved_count);
    }
    if (!await verifyDuplicateConfirmationToken(duplicateInput, input.duplicateConfirmationToken)) {
      const duplicateMatches = [];
      for (const opportunity of opportunities) {
        const matches = await findDuplicateMatches({ opportunity, sources, discoveredSourceUrls });
        duplicateMatches.push(...matches.map((match) => ({ ...match, draftName: opportunity.name })));
      }
      if (duplicateMatches.length) {
        return {
          success: false as const, code: 'DUPLICATE_WARNING' as const, message: 'Possible duplicate opportunities found.',
          duplicateMatches,
          duplicateConfirmationToken: await createDuplicateConfirmationToken(duplicateInput, duplicateMatches),
        };
      }
    }
    const ids = await publishBatch(input, uploaded);
    if (ids.length) after(async () => {
      const keys = await scheduleAssessments({ ids });
      if (keys.length) await runAssessmentJobs(2, keys);
    });
    revalidatePath('/');
    revalidatePath('/ledger');
    revalidatePath('/inbox');
    revalidatePath('/agent');
    return savedMessage(ids.length || opportunities.length);
  } catch (error) {
    await removeStoredSources(uploaded.map((source) => source.storagePath)).catch(() => console.error('Could not clean up staged source files.'));
    console.error('Could not save opportunity:', error);
    return { success: false as const, message: error instanceof Error ? error.message : 'Failed to save the opportunity.' };
  }
}
