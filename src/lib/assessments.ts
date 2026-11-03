import 'server-only';
import { assessFit } from '@/ai/fit-assessment';
import { getOpenRouterModel } from '@/ai/provider';
import { ASSESSMENT_VERSION, assessmentIsCurrent, parseAssessments, type ProfileAssessments } from '@/domain/opportunity/assessment';
import { getOpportunityById } from './data';
import { query } from './db';
import { appToday } from './deadlines';
import { refreshProfiles } from './profiles';

export async function assessmentQueue(force = false): Promise<string[]> {
  const profiles = await refreshProfiles();
  const { rows } = await query(`SELECT id,content_revision,profile_assessments FROM opportunities
    WHERE assessment_claimed_until IS NULL OR assessment_claimed_until < now()
    ORDER BY (deadline IS NULL OR deadline >= $1::date) DESC, deadline ASC NULLS LAST, id`, [appToday()]);
  return rows.filter((row) => force || profiles.some((profile) => !assessmentIsCurrent(
    row.profile_assessments?.[profile.id], row.content_revision, profile.contentHash,
  ))).map((row) => String(row.id));
}

/** At most 3 rows / 2 profiles per request. A lease avoids duplicate concurrent AI requests. */
export async function assessOpportunities(ids: string[], force = false) {
  const profiles = await refreshProfiles();
  if (profiles.length !== 2 || profiles.some((profile) => !profile.text || !profile.contentHash)) {
    throw new Error('Both portfolio snapshots must be available before priorities can be assessed.');
  }
  const snapshots = await query(`SELECT id,content_revision,profile_assessments FROM opportunities
    WHERE id=ANY($1::integer[])`, [ids.slice(0, 3)]);
  const pending = snapshots.rows.filter((row) => force || profiles.some((profile) => !assessmentIsCurrent(
    parseAssessments(row.profile_assessments)[profile.id], row.content_revision, profile.contentHash,
  ))).map((row) => ({ id: row.id, revision: row.content_revision, assessments: row.profile_assessments }));
  if (!pending.length) return { assessed: 0, skipped: ids.length };
  // A queued ID may have been completed by another worker since the queue was read.
  // Compare the snapshot as well as the lease so it cannot incur a second AI call.
  const claimed = await query(`UPDATE opportunities AS o SET assessment_claimed_until=now()+interval '4 minutes'
    FROM jsonb_to_recordset($1::jsonb) AS requested(id integer, revision integer, assessments jsonb)
    WHERE o.id=requested.id AND o.content_revision=requested.revision
    AND o.profile_assessments=requested.assessments
    AND (o.assessment_claimed_until IS NULL OR o.assessment_claimed_until < now())
    RETURNING o.id`, [JSON.stringify(pending)]);
  const claimedIds = claimed.rows.map((row) => String(row.id));
  if (!claimedIds.length) return { assessed: 0, skipped: ids.length };
  try {
    const opportunities = (await Promise.all(claimedIds.map(getOpportunityById)))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (!opportunities.length) return { assessed: 0, skipped: ids.length };
    const decisions = await assessFit(opportunities, profiles, appToday());
    let assessed = 0;
    for (const decision of decisions) {
      const opportunity = opportunities.find((item) => item.id === decision.opportunityId)!;
      const stored: ProfileAssessments = {};
      for (const candidate of decision.candidates) {
        const { candidateId, ...result } = candidate;
        stored[candidateId] = {
          ...result, profileHash: profiles.find((profile) => profile.id === candidateId)!.contentHash,
          contentRevision: opportunity.contentRevision || 1, assessedAt: new Date().toISOString(),
          policyVersion: ASSESSMENT_VERSION, model: getOpenRouterModel(),
        };
      }
      // Discard a result if either the opportunity or a profile changed while the model ran.
      const result = await query(`UPDATE opportunities SET profile_assessments=$2::jsonb
        WHERE id=$1 AND content_revision=$3
        AND (SELECT content_hash FROM candidate_profiles WHERE id='swarup')=$4
        AND (SELECT content_hash FROM candidate_profiles WHERE id='archita')=$5`,
      [opportunity.id, JSON.stringify(stored), opportunity.contentRevision || 1,
        profiles.find((profile) => profile.id === 'swarup')!.contentHash,
        profiles.find((profile) => profile.id === 'archita')!.contentHash]);
      assessed += result.rowCount || 0;
    }
    return { assessed, skipped: ids.length - assessed };
  } finally {
    await query('UPDATE opportunities SET assessment_claimed_until=NULL WHERE id=ANY($1::integer[])', [claimedIds]);
  }
}
