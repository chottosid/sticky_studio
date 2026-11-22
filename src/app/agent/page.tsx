import { redirect } from 'next/navigation';
import Header from '@/components/layout/header';
import { AgentWorkspace } from '@/components/agent/agent-workspace';
import { isAuthenticated } from '@/lib/actions';
import { query } from '@/lib/db';

export const maxDuration = 90;

export default async function AgentPage() {
  if (!(await isAuthenticated())) redirect('/login');
  const { rows } = await query<{ id: number; name: string }>('SELECT id, name FROM opportunities ORDER BY name, id');

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl space-y-7 px-4 pb-16 pt-8 sm:px-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Agent</h1>
        <AgentWorkspace opportunities={rows.map((row) => ({ id: String(row.id), name: row.name }))} />
      </main>
    </>
  );
}
