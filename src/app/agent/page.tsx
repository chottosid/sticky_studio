import { redirect } from 'next/navigation';
import { CandidateIdSchema } from '@/domain/opportunity/assessment';
import Header from '@/components/layout/header';
import { AgentWorkspace } from '@/components/agent/agent-workspace';
import { isAuthenticated } from '@/lib/actions';
import { query } from '@/lib/db';

export const maxDuration = 90;

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ opportunity?: string | string[]; candidate?: string | string[] }> }) {
  if (!(await isAuthenticated())) redirect('/login');
  const { rows } = await query<{ id: number; name: string }>('SELECT id, name FROM opportunities ORDER BY name, id');
  const { opportunity, candidate } = await searchParams;
  const agentKey = process.env.OPENROUTER_AGENT_API_KEY;

  return (
    <>
      <Header active="agent" />
      <main className="mx-auto max-w-5xl px-2.5 py-3 sm:px-6 sm:py-7">
        <AgentWorkspace opportunities={rows.map((row) => ({ id: String(row.id), name: row.name }))}
          aiConfigured={Boolean(agentKey && agentKey !== process.env.OPENROUTER_API_KEY)}
          initialCandidate={CandidateIdSchema.catch('swarup').parse(candidate)}
          initialOpportunityId={typeof opportunity === 'string' ? opportunity : undefined} />
      </main>
    </>
  );
}
