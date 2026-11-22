import 'server-only';
import type { CandidateId } from '@/domain/opportunity/assessment';
import type { OpportunityCategory } from '@/domain/opportunity/schema';
import {
  APPLICANT_POLICY, ApplicantAssessmentSchema, assessmentSummary, defaultProgress, legacySummary, nextAction,
  actionGroup, type ApplicantAssessment, type ApplicantProgress, type ApplicantSummary, type PostingStatus,
} from '@/domain/opportunity/workflow';
import { query } from './db';
import { appToday } from './deadlines';

type Row = {
  id: string;
  name: string;
  category: OpportunityCategory;
  organization: string | null;
  deadline: string | null;
  postingStatus: PostingStatus;
  candidate: CandidateId;
  stage: ApplicantProgress['stage'] | null;
  followUpOn: string | null;
  note: string | null;
  result: unknown;
  assessedAt: Date | null;
  model: string | null;
  current: boolean | null;
  legacy: { eligibility: 'eligible' | 'ineligible' | 'unclear'; fit: 'strong' | 'good' | 'partial' | 'weak' } | null;
  jobState: ApplicantSummary['jobState'] | null;
};

export async function applicantOpportunities({
  candidate, ids, includeEvidence = false,
}: { candidate?: CandidateId; ids?: string[]; includeEvidence?: boolean } = {}) {
  if (ids && ids.length === 0) return [];
  const today = appToday();
  const { rows } = await query<Row>(`
    SELECT o.id::text, o.name, o.category, o.organization_name AS organization, o.deadline::text,
      o.posting_status AS "postingStatus", p.id AS candidate,
      w.stage, w.follow_up_on::text AS "followUpOn", w.follow_up_note AS note,
      CASE WHEN $5::boolean THEN a.result ELSE
        jsonb_set(a.result, '{checks}', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'status', check_item->>'status', 'requirement', 'Check', 'sourceExcerpt', '', 'applicantExcerpt', ''))
          FROM jsonb_array_elements(a.result->'checks') check_item), '[]'::jsonb)) END AS result,
      a.assessed_at AS "assessedAt", a.model,
      a.content_revision = o.content_revision AND a.profile_hash = p.content_hash AND a.policy_version = $4 AS current,
      CASE WHEN l.result->>'contentRevision' = o.content_revision::text AND l.result->>'profileHash' = p.content_hash
        THEN jsonb_build_object('eligibility', l.result->>'eligibility', 'fit', l.result->>'fit') END AS legacy,
      CASE WHEN j.id IS NULL THEN NULL WHEN j.finished_at IS NULL THEN 'pending' WHEN j.error IS NOT NULL THEN 'failed' END AS "jobState"
    FROM opportunities o CROSS JOIN candidate_profiles p
    LEFT JOIN applicant_opportunities w ON w.opportunity_id = o.id AND w.candidate_id = p.id
    LEFT JOIN LATERAL (
      SELECT * FROM applicant_assessments WHERE opportunity_id = o.id AND candidate_id = p.id
      ORDER BY id DESC LIMIT 1
    ) a ON true
    CROSS JOIN LATERAL (SELECT o.profile_assessments->p.id AS result) l
    LEFT JOIN studio_jobs j ON j.kind = 'assessment'
      AND j.dedupe_key = concat_ws(':', o.id, p.id, o.content_revision, p.content_hash, $4::text)
    WHERE ($1::text IS NULL OR p.id = $1) AND ($2::integer[] IS NULL OR o.id = ANY($2))
      AND ($2::integer[] IS NOT NULL OR
        (w.stage IS DISTINCT FROM 'archived' AND ((o.posting_status <> 'closed' AND (o.deadline IS NULL OR o.deadline >= $3::date OR o.posting_status = 'rolling'))
          OR w.follow_up_on <= $3::date + 7)))
    ORDER BY o.deadline ASC NULLS LAST, o.id, p.id
  `, [candidate ?? null, ids ?? null, today, APPLICANT_POLICY, includeEvidence]);

  return rows.map((row) => {
    const result = ApplicantAssessmentSchema.safeParse(row.result);
    const assessment = result.success ? result.data : undefined;
    const facts = assessment && row.current ? assessmentSummary(assessment)
      : !assessment && row.legacy ? legacySummary(row.legacy) : undefined;
    const progress = row.stage ? { stage: row.stage, followUpOn: row.followUpOn, note: row.note ?? '' } : defaultProgress;
    const deadline = row.postingStatus === 'rolling' ? null : row.deadline;
    const summary: ApplicantSummary = {
      progress, action: nextAction({ deadline, postingStatus: row.postingStatus, today, progress, assessment: facts }),
      fit: facts?.fit ?? 'unknown',
      assessmentState: assessment ? (row.current ? 'current' : 'previous') : row.legacy ? 'legacy' : 'missing',
      jobState: row.jobState ?? undefined,
    };
    const { id, name, category, organization, candidate, postingStatus } = row;
    return { id, name, category, organization, candidate, postingStatus, deadline, summary,
      assessment, assessedAt: row.assessedAt?.toISOString(), model: row.model };
  });
}

export type ApplicantOpportunity = Awaited<ReturnType<typeof applicantOpportunities>>[number];
export type ApplicantDetail = ApplicantOpportunity & { history?: { assessedAt: string; model: string; result: ApplicantAssessment }[] };

export async function assessmentHistory(opportunityId: string, candidate: CandidateId) {
  const { rows } = await query<{ assessed_at: Date; model: string; result: unknown }>(`
    SELECT assessed_at, model, result FROM applicant_assessments
    WHERE opportunity_id = $1 AND candidate_id = $2 ORDER BY id DESC LIMIT 6
  `, [opportunityId, candidate]);
  return rows.slice(1).flatMap((row) => {
    const result = ApplicantAssessmentSchema.safeParse(row.result);
    return result.success ? [{ assessedAt: row.assessed_at.toISOString(), model: row.model, result: result.data }] : [];
  });
}

export function groupApplicantWork(items: ApplicantOpportunity[]) {
  const today = appToday();
  const groups = { 'follow-ups': [] as ApplicantOpportunity[], due: [] as ApplicantOpportunity[],
    prepare: [] as ApplicantOpportunity[] };
  for (const item of items) {
    const group = actionGroup(item.summary.action, item.deadline, today);
    if (group) groups[group].push(item);
  }
  groups['follow-ups'].sort((a, b) => (a.summary.progress.followUpOn ?? '').localeCompare(b.summary.progress.followUpOn ?? ''));
  return groups;
}
