import 'server-only';

import { revalidatePath } from 'next/cache';
import type { ExtractionSource, OpportunityInput } from '@/domain/opportunity/schema';
import { saveOpportunity } from '@/lib/data';
import { sendNewOpportunityEmail } from '@/lib/email';
import { removeStoredSources, uploadOpportunitySources } from '@/lib/source-storage';
import {
  createDuplicateConfirmationToken,
  findDuplicateMatches,
  verifyDuplicateConfirmationToken,
} from '@/lib/duplicates';

export type SaveOpportunityBatchInput = {
  opportunities: OpportunityInput[];
  sources: ExtractionSource[];
  discoveredSourceUrls: string[];
  duplicateConfirmationToken?: string;
};

/** Callers must authenticate first; this module is server-only so it is never exposed as an action. */
export async function saveOpportunityBatch(input: SaveOpportunityBatchInput) {
  const { opportunities, sources, discoveredSourceUrls } = input;
  const duplicateInput = { opportunities, sources, discoveredSourceUrls };
  let uploadedSources: Awaited<ReturnType<typeof uploadOpportunitySources>> = [];
  let savedCount = 0;
  try {
    const confirmed = await verifyDuplicateConfirmationToken(
      duplicateInput,
      input.duplicateConfirmationToken,
    );
    if (!confirmed) {
      const duplicateMatches = [];
      for (const opportunity of opportunities) {
        const matches = await findDuplicateMatches({ opportunity, sources, discoveredSourceUrls });
        duplicateMatches.push(...matches.map((match) => ({ ...match, draftName: opportunity.name })));
      }
      if (duplicateMatches.length) {
        return {
          success: false as const,
          code: 'DUPLICATE_WARNING' as const,
          message: 'Possible duplicate opportunities found.',
          duplicateMatches,
          duplicateConfirmationToken: await createDuplicateConfirmationToken(duplicateInput, duplicateMatches),
        };
      }
    }

    // Upload once; every opportunity in the batch references the same
    // content-addressed objects (deduped in storage, see source-storage.ts).
    uploadedSources = await uploadOpportunitySources(sources);
    for (const opportunity of opportunities) {
      try {
        const saved = await saveOpportunity(
          opportunity,
          uploadedSources,
          Array.from(new Set(discoveredSourceUrls)),
        );
        savedCount += 1;
        await sendNewOpportunityEmail(saved);
      } catch (error) {
        // Only remove when nothing was saved — earlier saves still reference the objects.
        if (savedCount === 0) {
          await removeStoredSources(uploadedSources.map((source) => source.storagePath));
        }
        throw error;
      }
    }
    revalidatePath('/');
    return {
      success: true as const,
      message: savedCount === 1 ? `Saved “${opportunities[0].name}”` : `Saved ${savedCount} opportunities`,
    };
  } catch (error) {
    console.error('Could not save opportunity:', error);
    return {
      success: false as const,
      message: `${savedCount ? `Saved ${savedCount} before the failure. ` : ''}${error instanceof Error ? error.message : 'Failed to save the opportunity.'}`,
    };
  }
}
