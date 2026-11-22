import 'server-only';
import { randomUUID } from 'node:crypto';
import { query } from './db';

type JobKind = 'assessment' | 'reminder';
export type Job<T> = { id: string; payload: T; attempts: number; leaseToken: string };
const MAX_ATTEMPTS = 3;

export async function claimJob<T>(kind: JobKind, keys?: string[]): Promise<Job<T> | undefined> {
  const { rows } = await query<Job<T>>(`
    WITH next_job AS (
      SELECT id FROM studio_jobs
      WHERE kind = $1 AND finished_at IS NULL AND run_after <= now()
        AND (lease_until IS NULL OR lease_until < now())
        AND ($2::text[] IS NULL OR dedupe_key = ANY($2))
      ORDER BY run_after, id LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    UPDATE studio_jobs j
    SET lease_token = $3, lease_until = now() + interval '6 minutes', attempts = attempts + 1
    FROM next_job WHERE j.id = next_job.id
    RETURNING j.id::text, j.payload, j.attempts, j.lease_token AS "leaseToken"
  `, [kind, keys ?? null, randomUUID()]);
  return rows[0];
}

export async function finishJob(job: Job<unknown>, error?: string) {
  await query(`
    UPDATE studio_jobs SET
      finished_at = CASE WHEN $3::text IS NULL OR attempts >= $4 THEN now() END,
      run_after = CASE WHEN $3::text IS NULL THEN run_after ELSE now() + interval '5 minutes' * attempts END,
      error = $3, lease_token = NULL, lease_until = NULL
    WHERE id = $1 AND lease_token = $2
  `, [job.id, job.leaseToken, error?.slice(0, 500) ?? null, MAX_ATTEMPTS]);
}

export async function runJobs<T>(
  kind: JobKind, limit: number, run: (job: Job<T>) => Promise<void>,
  { keys, budgetMs = 120_000 }: { keys?: string[]; budgetMs?: number } = {},
) {
  const start = Date.now();
  let completed = 0;
  let failed = 0;
  for (let index = 0; index < limit && Date.now() - start < budgetMs; index += 1) {
    const job = await claimJob<T>(kind, keys);
    if (!job) break;
    try {
      if (job.attempts > MAX_ATTEMPTS) throw new Error('Worker stopped before confirming its last attempt.');
      await run(job);
      await finishJob(job);
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Job failed';
      await finishJob(job, message);
      console.error('Background job failed', { kind, id: job.id, attempt: job.attempts });
      failed += 1;
    }
  }
  return { completed, failed };
}
