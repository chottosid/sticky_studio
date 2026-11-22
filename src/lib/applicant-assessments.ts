import 'server-only';
import { assessApplicant } from '@/ai/applicant-assessment';
import { getOpenRouterModel } from '@/ai/provider';
import type { CandidateId } from '@/domain/opportunity/assessment';
import { getOpportunityById } from './data';
import { query } from './db';
import { appToday } from './deadlines';
import { runJobs, type Job } from './jobs';
import { getCandidateProfiles } from './profiles';

import { APPLICANT_POLICY } from '@/domain/opportunity/workflow';

type AssessmentJob = {
  opportunityId: string; candidate: CandidateId; revision: number; profileHash: string; policy: string;
};

export async function scheduleAssessments(options: { ids?: string[]; candidate?: CandidateId; force?: boolean; limit?: number } = {}) {
  const { ids, candidate, force = false, limit = 24 } = options;
  const { rows } = await query<{ dedupe_key: string }>(`
    WITH inputs AS (
      SELECT o.id, p.id AS candidate, o.content_revision, p.content_hash,
        concat_ws(':', o.id, p.id, o.content_revision, p.content_hash, $4::text) AS job_key
      FROM opportunities o CROSS JOIN candidate_profiles p
      WHERE length(p.profile_text) > 0 AND length(p.content_hash) > 0
        AND ($1::integer[] IS NULL OR o.id = ANY($1))
        AND ($2::text IS NULL OR p.id = $2)
        AND ($1::integer[] IS NOT NULL OR ((o.workflow_enabled OR EXISTS (SELECT 1 FROM applicant_assessments previous
          WHERE previous.opportunity_id = o.id AND previous.candidate_id = p.id)) AND o.posting_status <> 'closed'
          AND (o.posting_status = 'rolling' OR o.deadline IS NULL OR o.deadline >= $3::date)))
      ORDER BY o.deadline ASC NULLS LAST, o.id, p.id
    ), chosen AS (
      SELECT i.* FROM inputs i LEFT JOIN studio_jobs j ON j.kind = 'assessment' AND j.dedupe_key = i.job_key
      WHERE j.id IS NULL OR ($5::boolean AND j.finished_at IS NOT NULL)
      LIMIT $6
    )
    INSERT INTO studio_jobs(kind, dedupe_key, payload)
    SELECT 'assessment', job_key, jsonb_build_object('opportunityId', id::text, 'candidate', candidate,
      'revision', content_revision, 'profileHash', content_hash, 'policy', $4::text)
    FROM chosen
    ON CONFLICT (kind, dedupe_key) DO UPDATE SET finished_at = NULL, attempts = 0, error = NULL, run_after = now()
      WHERE $5::boolean AND studio_jobs.finished_at IS NOT NULL
    RETURNING dedupe_key
  `, [ids ?? null, candidate ?? null, appToday(), APPLICANT_POLICY, force, limit]);
  return rows.map((row) => row.dedupe_key);
}

async function runAssessment(job: Job<AssessmentJob>) {
  const input = job.payload;
  if (input.policy !== APPLICANT_POLICY) return;
  const [opportunity, profiles] = await Promise.all([
    getOpportunityById(input.opportunityId, { includeLegacyDocument: false }), getCandidateProfiles(),
  ]);
  const profile = profiles.find((item) => item.id === input.candidate);
  if (!opportunity || !profile || opportunity.contentRevision !== input.revision || profile.contentHash !== input.profileHash) return;

  const result = await assessApplicant(opportunity, profile);
  // Commit the result and acknowledge the job together. Only the current lease owner can write.
  await query(`
    WITH finished AS (
      UPDATE studio_jobs SET finished_at = now(), lease_token = NULL, lease_until = NULL, error = NULL
      WHERE id = $1 AND lease_token = $2 RETURNING id
    )
    INSERT INTO applicant_assessments(opportunity_id, candidate_id, content_revision, profile_hash, policy_version, model, result)
    SELECT o.id, p.id, o.content_revision, p.content_hash, $7, $8, $9::jsonb
    FROM finished CROSS JOIN opportunities o CROSS JOIN candidate_profiles p
    WHERE o.id = $3 AND p.id = $4 AND o.content_revision = $5 AND p.content_hash = $6
  `, [job.id, job.leaseToken, opportunity.id, profile.id, input.revision, input.profileHash,
    APPLICANT_POLICY, getOpenRouterModel(), JSON.stringify(result)]);
}

export function runAssessmentJobs(limit: number, keys?: string[]) {
  return runJobs<AssessmentJob>('assessment', limit, runAssessment, { keys, budgetMs: 135_000 });
}
