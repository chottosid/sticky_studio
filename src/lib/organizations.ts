// Resolves free-text organization and professor names to rows. Kept free of 'server-only' so the
// import and backfill scripts can load it through jiti; every write path shares this one resolver.
import type { PoolClient } from 'pg';

type Queryable = Pick<PoolClient, 'query'>;

/** A comma part naming a department or school rather than the university itself. */
const UNIT_PART = /^(department|dept|school|college (of|for)|faculty|center|centre|institute (of|for)|division|computer|cse|cis|eecs|data|engineering|information|electrical|samueli|donald bren|cockrell|manning|mccormick|khoury|siebel|gsas|ai )/;

/** Other spellings of one place that wording rules cannot fold together. Keys are normalized. */
const KNOWN_ALIASES: Record<string, string> = {
  njit: 'new jersey institute technology',
  'unc charlotte': 'university north carolina charlotte',
  'university missouri columbia': 'university missouri',
  'university minnesota twin cities': 'university minnesota',
  'massachusetts institute technology': 'massachusetts institute technology',
  mit: 'massachusetts institute technology',
  'rutgers university new brunswick': 'rutgers university',
  'mats program': 'mats',
};

/** Nicer names for places that are usually written in short form. Keys are normalized. */
const DISPLAY_NAMES: Record<string, string> = {
  'university california berkeley': 'University of California, Berkeley',
  'new jersey institute technology': 'New Jersey Institute of Technology',
  'massachusetts institute technology': 'Massachusetts Institute of Technology',
  'university north carolina charlotte': 'University of North Carolina at Charlotte',
};

const words = (value: string) => value
  .normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/\buniv\b\.?/g, 'university').replace(/\binst\b\.?/g, 'institute')
  .replace(/^uc\b/, 'university of california').replace(/^nyu\b/, 'new york university')
  .replace(/[^a-z0-9]+/g, ' ').trim();

/** "University of Illinois Urbana-Champaign (Siebel School)" -> "University of Illinois Urbana-Champaign". */
export function cleanOrganizationName(name: string): string {
  const withoutParens = name.replace(/\s*\([^)]*\)/g, '').replace(/\bUniv\.(?=\s)/g, 'University').replace(/\bInst\.(?=\s)/g, 'Institute').replace(/\s+-\s+/g, ', ').trim();
  const parts = withoutParens.split(',').map((part) => part.trim()).filter(Boolean);
  // "Johns Hopkins University, <anything>": the name is already complete, so the rest is a department.
  if (/\b(university|college|institute|technology)$/i.test(parts[0] ?? '') && !/^(university|college|institute) of\b/i.test(parts[0])) return parts[0];
  const cut = parts.findIndex((part, index) => index > 0 && UNIT_PART.test(words(part)));
  return (cut === -1 ? parts : parts.slice(0, cut)).join(', ');
}

/** Stable comparison key: same university, whatever the department suffix, "Univ." or "the". */
export function organizationKey(name: string): string {
  let key = words(cleanOrganizationName(name)).split(' ').filter((word) => !['of', 'at', 'the', 'in', 'and'].includes(word)).join(' ');
  // "New York University Center for Data Science": a unit written without a comma, after a university name.
  const unit = key.match(/^(.+?)\s+(?:center|centre|school|department|faculty|division|institute)\b/);
  if (unit && /\b(university|college)\b/.test(unit[1])) key = unit[1];
  return KNOWN_ALIASES[key] ?? key;
}

export function professorKey(name: string): string {
  return words(name.replace(/\b(prof|professor|dr)\b\.?/gi, '')).split(' ').join(' ');
}

/** The name shown for an organization: a canonical spelling for common places, else the cleaned original. */
export function organizationDisplayName(name: string): string {
  const cleaned = cleanOrganizationName(name.trim());
  return DISPLAY_NAMES[organizationKey(cleaned)] ?? cleaned;
}

/** Finds or creates the organization for a free-text name. Returns null when the name is empty. */
export async function resolveOrganization(client: Queryable, name: string | null | undefined): Promise<number | null> {
  const key = organizationKey(name ?? '');
  if (!key) return null;
  const display = organizationDisplayName(name ?? '');
  const found = await client.query<{ id: number }>(
    'SELECT id FROM organizations WHERE name_key = $1 OR $1 = ANY(alias_keys) ORDER BY id LIMIT 1', [key]);
  if (found.rows[0]) return found.rows[0].id;
  const created = await client.query<{ id: number }>(
    `INSERT INTO organizations (name, name_key) VALUES ($1, $2)
     ON CONFLICT (name_key) DO UPDATE SET name_key = EXCLUDED.name_key RETURNING id`, [display, key]);
  return created.rows[0].id;
}

/** Points the opportunity at its organization and (for higher study) its named professors. */
export async function syncOpportunityLinks(
  client: Queryable,
  opportunityId: string | number,
  opportunity: { organizationName: string | null; category: string; attributes: object },
): Promise<void> {
  const organizationId = await resolveOrganization(client, opportunity.organizationName);
  await client.query('UPDATE opportunities SET organization_id = $2 WHERE id = $1', [opportunityId, organizationId]);
  await client.query('DELETE FROM opportunity_professors WHERE opportunity_id = $1', [opportunityId]);
  if (!organizationId || opportunity.category !== 'higher-study') return;
  // Only higher-study attributes carry professors, so read them loosely.
  const attributes = opportunity.attributes as { professorNames?: string[]; department?: string | null; researchAreas?: string[] };
  for (const name of new Set(attributes.professorNames ?? [])) {
    const key = professorKey(name);
    if (!key) continue;
    // Only fill details the professor row lacks; never overwrite what was entered by hand.
    const professor = await client.query<{ id: number }>(
      `INSERT INTO professors (organization_id, name, name_key, department, research_areas)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, name_key) DO UPDATE SET
         department = COALESCE(professors.department, EXCLUDED.department),
         research_areas = CASE WHEN cardinality(professors.research_areas) = 0 THEN EXCLUDED.research_areas ELSE professors.research_areas END
       RETURNING id`,
      [organizationId, name.replace(/^\s*(prof\.?|professor|dr\.?)\s+/i, '').trim(), key, attributes.department ?? null, attributes.researchAreas ?? []]);
    await client.query('INSERT INTO opportunity_professors (opportunity_id, professor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [opportunityId, professor.rows[0].id]);
  }
}
