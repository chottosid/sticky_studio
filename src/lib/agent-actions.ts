'use server';

import { AgentProviderError } from '@/ai/agent';
import { AgentRequestSchema, type AgentResult } from '@/domain/opportunity/agent';
import { isAuthenticated } from './actions';
import { outreachDraft, researchOpportunities, weeklyTasks } from './agent';

export async function runAgent(input: unknown): Promise<
  { success: true; result: AgentResult } | { success: false; message: string }
> {
  if (!(await isAuthenticated())) return { success: false, message: 'Sign in to use the agent.' };
  const parsed = AgentRequestSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: 'Check the request and try again.' };

  const request = parsed.data;
  try {
    switch (request.kind) {
      case 'week':
        return { success: true, result: { kind: 'week', tasks: await weeklyTasks(request.candidate) } };
      case 'research':
        return { success: true, result: { kind: 'research', proposals: await researchOpportunities(request.query, request.candidate) } };
      case 'outreach': {
        const draft = await outreachDraft(request.candidate, request.opportunityId, request.instructions, request.previousDraft);
        if (!draft) return { success: false, message: 'The opportunity or applicant is unavailable.' };
        return { success: true, result: { kind: 'outreach', ...draft } };
      }
    }
  } catch (error) {
    if (error instanceof AgentProviderError) return { success: false, message: error.message };
    console.error('Agent request failed:', { kind: request.kind, error: error instanceof Error ? error.name : 'UnknownError' });
    return { success: false, message: 'The agent could not finish this request. Try again.' };
  }
}
