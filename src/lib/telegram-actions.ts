'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { OpportunityInputSchema } from '@/domain/opportunity/schema';
import { isAuthenticated } from '@/lib/actions';
import { saveOpportunityBatch } from '@/lib/save-opportunities';
import { processTelegramBundle } from '@/lib/telegram/process';
import { closeInboxItem, getReadyDraft, markForRetry } from '@/lib/telegram/store';

const InboxIdSchema = z.number().int().positive();

const SaveTelegramDraftSchema = z.object({
  telegramMessageId: InboxIdSchema,
  opportunities: z.array(OpportunityInputSchema).min(1).max(10),
  duplicateConfirmationToken: z.string().max(5_000).optional(),
});

export async function saveTelegramDraft(input: unknown) {
  if (!(await isAuthenticated())) return { success: false as const, message: 'Unauthorized' };
  const parsed = SaveTelegramDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, message: 'Please correct the highlighted opportunity fields.' };
  }

  const { telegramMessageId, opportunities, duplicateConfirmationToken } = parsed.data;
  // Sources stay server-side: they can be larger than the request body limit.
  const stored = await getReadyDraft(telegramMessageId);
  if (!stored) return { success: false as const, message: 'This inbox item is no longer available.' };

  const result = await saveOpportunityBatch({
    opportunities,
    sources: stored.sources,
    discoveredSourceUrls: stored.draft.discoveredSourceUrls,
    duplicateConfirmationToken,
  });
  if (result.success) await closeInboxItem(telegramMessageId, 'saved');
  return result;
}

export async function retryTelegramMessage(id: number) {
  if (!(await isAuthenticated())) return { success: false as const, message: 'Unauthorized' };
  const parsed = InboxIdSchema.safeParse(id);
  if (!parsed.success) return { success: false as const, message: 'Invalid inbox item.' };
  const bundle = await markForRetry(parsed.data);
  if (!bundle) return { success: false as const, message: 'This inbox item cannot be retried.' };
  await processTelegramBundle(bundle.chatId, bundle.senderKey);
  revalidatePath('/');
  return { success: true as const };
}

export async function dismissTelegramMessage(id: number) {
  if (!(await isAuthenticated())) return { success: false as const, message: 'Unauthorized' };
  const parsed = InboxIdSchema.safeParse(id);
  if (!parsed.success) return { success: false as const, message: 'Invalid inbox item.' };
  await closeInboxItem(parsed.data, 'dismissed');
  revalidatePath('/');
  return { success: true as const };
}
