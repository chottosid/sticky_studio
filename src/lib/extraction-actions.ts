'use server';

import { extractOpportunityDetails } from '@/ai';
import { isAuthenticated } from './actions';

export async function extractOpportunityDraft(input: unknown) {
  if (!(await isAuthenticated())) {
    return { success: false as const, message: 'Unauthorized' };
  }

  try {
    const draft = await extractOpportunityDetails(input);
    return { success: true as const, draft };
  } catch (error) {
    console.error('Opportunity extraction failed:', error);
    return {
      success: false as const,
      message: error instanceof Error ? error.message : 'Extraction failed.',
    };
  }
}

