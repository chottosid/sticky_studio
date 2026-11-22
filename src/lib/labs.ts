import 'server-only';
import {
  OrganizationInputSchema, ProfessorInputSchema,
  type OrganizationDetail, type OrganizationInput, type OrganizationSummary, type Professor, type ProfessorInput,
} from '@/domain/lab/schema';
import { query } from './db';
import { escapeLike, isNumericId } from './utils';
import { organizationKey, professorKey } from './organizations';
import { appToday } from './deadlines';

/** Organizations that matter for tracking people: they have professors or a higher-study opening. */
export async function listOrganizations(search?: string): Promise<OrganizationSummary[]> {
  const term = search?.trim();
  const { rows } = await query<OrganizationSummary>(`
    SELECT o.id::text, o.name, o.country,
      (SELECT count(*)::int FROM professors p WHERE p.organization_id = o.id) AS professors,
      (SELECT count(*)::int FROM professors p WHERE p.organization_id = o.id AND p.recruiting_status = 'taking') AS taking,
      (SELECT count(*)::int FROM opportunities x WHERE x.organization_id = o.id AND x.category = 'higher-study') AS openings,
      (SELECT min(x.deadline)::text FROM opportunities x WHERE x.organization_id = o.id AND x.category = 'higher-study'
         AND x.posting_status <> 'closed' AND x.deadline >= (now() AT TIME ZONE $2)::date) AS "nextDeadline"
    FROM organizations o
    WHERE ($1::text IS NULL OR o.name ILIKE $1 ESCAPE '\\' OR EXISTS (
        SELECT 1 FROM professors p WHERE p.organization_id = o.id AND (p.name ILIKE $1 ESCAPE '\\' OR array_to_string(p.research_areas, ' ') ILIKE $1 ESCAPE '\\')))
      AND (EXISTS (SELECT 1 FROM professors p WHERE p.organization_id = o.id)
        OR EXISTS (SELECT 1 FROM opportunities x WHERE x.organization_id = o.id AND x.category = 'higher-study'))
    ORDER BY (SELECT count(*) FROM professors p WHERE p.organization_id = o.id AND p.recruiting_status = 'taking') DESC,
      "nextDeadline" NULLS LAST, o.name`,
    [term ? `%${escapeLike(term)}%` : null, process.env.APP_TIMEZONE || 'Asia/Dhaka']);
  return rows;
}

export async function getOrganization(id: string): Promise<OrganizationDetail | null> {
  if (!isNumericId(id)) return null;
  const { rows: [org] } = await query<{ id: string; name: string; country: string | null; website: string | null; notes: string }>(
    'SELECT id::text, name, country, website, notes FROM organizations WHERE id = $1', [id]);
  if (!org) return null;
  const [professors, opportunities] = await Promise.all([
    query<Record<string, unknown>>(`
      SELECT p.id::text, p.name, p.department, p.homepage, p.scholar_url AS "scholarUrl", p.email,
        p.research_areas AS "researchAreas", p.recruiting_status AS "recruitingStatus",
        p.recruiting_checked_on::text AS "recruitingCheckedOn", p.recruiting_source_url AS "recruitingSourceUrl", p.notes,
        COALESCE((SELECT array_agg(op.opportunity_id::text ORDER BY op.opportunity_id) FROM opportunity_professors op WHERE op.professor_id = p.id), '{}') AS "opportunityIds"
      FROM professors p WHERE p.organization_id = $1
      ORDER BY (p.recruiting_status = 'taking') DESC, p.name`, [id]),
    query<OrganizationDetail['opportunities'][number]>(`
      SELECT id::text, name, category, deadline::text, posting_status AS "postingStatus"
      FROM opportunities WHERE organization_id = $1
      ORDER BY (posting_status = 'closed') , deadline NULLS LAST, id`, [id]),
  ]);
  const professorList = professors.rows as unknown as Professor[];
  const today = appToday();
  const upcoming = opportunities.rows.filter((o) => o.category === 'higher-study' && o.postingStatus !== 'closed' && o.deadline && o.deadline >= today);
  return {
    ...org,
    professors: professorList.length,
    taking: professorList.filter((p) => p.recruitingStatus === 'taking').length,
    openings: opportunities.rows.filter((o) => o.category === 'higher-study').length,
    nextDeadline: upcoming.map((o) => o.deadline as string).sort()[0] ?? null,
    professorList,
    opportunities: opportunities.rows,
  };
}

export async function updateOrganization(id: string, input: OrganizationInput): Promise<boolean> {
  if (!isNumericId(id)) return false;
  const value = OrganizationInputSchema.parse(input);
  // A renamed place keeps resolving under its old key, so a later import does not recreate it.
  const result = await query(`
    UPDATE organizations SET name = $2, country = $3, website = $4, notes = $5, updated_at = now(),
      alias_keys = ARRAY(SELECT DISTINCT unnest(alias_keys || ARRAY[name_key]) EXCEPT SELECT $6::text)
    , name_key = $6
    WHERE id = $1`, [id, value.name, value.country, value.website, value.notes, organizationKey(value.name)]);
  return Boolean(result.rowCount);
}

const professorValues = (value: ProfessorInput) => [
  value.name, professorKey(value.name), value.department, value.homepage, value.scholarUrl, value.email, value.researchAreas,
  value.recruitingStatus, value.recruitingCheckedOn, value.recruitingSourceUrl, value.notes,
];

export async function createProfessor(organizationId: string, input: ProfessorInput): Promise<{ id: string } | 'duplicate' | null> {
  if (!isNumericId(organizationId)) return null;
  const value = ProfessorInputSchema.parse(input);
  const { rows } = await query<{ id: string }>(`
    INSERT INTO professors (organization_id, name, name_key, department, homepage, scholar_url, email, research_areas,
      recruiting_status, recruiting_checked_on, recruiting_source_url, notes)
    VALUES ($12, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (organization_id, name_key) DO NOTHING RETURNING id::text`, [...professorValues(value), organizationId]);
  return rows[0] ?? 'duplicate';
}

export async function updateProfessor(id: string, input: ProfessorInput): Promise<boolean | 'duplicate'> {
  if (!isNumericId(id)) return false;
  const value = ProfessorInputSchema.parse(input);
  try {
    const result = await query(`
      UPDATE professors SET name = $1, name_key = $2, department = $3, homepage = $4, scholar_url = $5, email = $6,
        research_areas = $7, recruiting_status = $8, recruiting_checked_on = $9, recruiting_source_url = $10, notes = $11,
        updated_at = now()
      WHERE id = $12`, [...professorValues(value), id]);
    return Boolean(result.rowCount);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') return 'duplicate';
    throw error;
  }
}

export async function deleteProfessor(id: string): Promise<boolean> {
  if (!isNumericId(id)) return false;
  const result = await query('DELETE FROM professors WHERE id = $1', [id]);
  return Boolean(result.rowCount);
}
