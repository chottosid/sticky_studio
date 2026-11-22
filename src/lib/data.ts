import type { PoolClient } from 'pg';
import {
  OpportunityInputSchema,
  type Evidence,
  type OpportunityCategory,
  type OpportunityInput,
} from '@/domain/opportunity/schema';
import type { DocumentType, Opportunity, OpportunityListRow, OpportunitySource } from '@/lib/types';
import { getClient, query } from './db';
import { escapeLike, formatDeadline, isNumericId } from './utils';
import { appToday } from './deadlines';
import type { UploadedSource } from './source-storage';
import { canonicalizeUrl } from './duplicate-normalization';
import { parseAssessments, type CandidateId } from '@/domain/opportunity/assessment';

import { applicantOpportunities } from './applicant-workflow';
import { syncOpportunityLinks } from './organizations';

type Queryable = Pick<PoolClient, 'query'>;

const SELECT_COLUMNS = `
  id, name, details, deadline, category,
  organization_name, organization_type, location, application_url, contact_email,
  eligibility, requirements, attributes, created_at, updated_at,
  profile_assessments, content_revision, posting_status, field_evidence, organization_id
`;
const DETAIL_COLUMNS = `${SELECT_COLUMNS}, document_uri, document_type`;

function parseJsonValue(value: unknown, fallback: unknown) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function mapOpportunityRow(row: Record<string, unknown>): Opportunity {
  const opportunity = OpportunityInputSchema.parse({
    name: row.name,
    details: row.details || '',
    deadline: formatDeadline(row.deadline as Date | string | null),
    category: row.category || 'job',
    postingStatus: row.posting_status,
    organizationName: row.organization_name,
    organizationType: row.organization_type,
    location: row.location,
    applicationUrl: row.application_url,
    contactEmail: row.contact_email,
    eligibility: row.eligibility,
    requirements: parseJsonValue(row.requirements, []),
    attributes: parseJsonValue(row.attributes, {}),
  });

  return {
    id: String(row.id),
    ...opportunity,
    sources: [],
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
    organizationId: row.organization_id ? String(row.organization_id) : null,
    contentRevision: Number(row.content_revision || 1),
    profileAssessments: parseAssessments(parseJsonValue(row.profile_assessments, {})),
    fieldEvidence: Array.isArray(row.field_evidence) ? row.field_evidence : [],
    documentUri: row.document_uri ? String(row.document_uri) : undefined,
    documentType: row.document_type ? row.document_type as DocumentType : undefined,
  };
}

function mapSourceRow(row: Record<string, unknown>): OpportunitySource {
  return {
    id: String(row.id),
    sourceType: row.source_type as OpportunitySource['sourceType'],
    originalName: row.original_name ? String(row.original_name) : null,
    mimeType: row.mime_type ? String(row.mime_type) : null,
    storagePath: row.storage_path ? String(row.storage_path) : null,
    sourceUrl: row.source_url ? String(row.source_url) : null,
  };
}

export async function getOpportunities(
  offset = 0,
  limit = 10,
  sortBy = 'created_at',
  sortOrder: 'ASC' | 'DESC' = 'DESC',
  searchQuery?: string,
  status?: 'upcoming' | 'past',
  category?: OpportunityCategory,
  candidateId?: CandidateId,
): Promise<{ opportunities: OpportunityListRow[]; total: number; hasMore: boolean }> {
  const conditions: string[] = [];
  const parameters: unknown[] = [];

  const addParameter = (value: unknown) => {
    parameters.push(value);
    return `$${parameters.length}`;
  };

  if (searchQuery?.trim()) {
    const placeholder = addParameter(`%${escapeLike(searchQuery.trim())}%`);
    conditions.push(`(
      name ILIKE ${placeholder} ESCAPE '\\' OR details ILIKE ${placeholder} ESCAPE '\\' OR
      COALESCE(organization_name, '') ILIKE ${placeholder} ESCAPE '\\' OR
      COALESCE(location, '') ILIKE ${placeholder} ESCAPE '\\'
    )`);
  }
  // "Today" is the app's calendar day, not the database's UTC date.
  if (status) {
    const today = addParameter(appToday());
    conditions.push(status === 'upcoming'
      ? `(posting_status <> 'closed' AND (posting_status = 'rolling' OR deadline IS NULL OR deadline >= ${today}::date))`
      : `(posting_status = 'closed' OR (posting_status <> 'rolling' AND deadline < ${today}::date))`);
  }
  if (category) conditions.push(`category = ${addParameter(category)}`);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const safeSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';
  const order = sortBy === 'deadline'
    ? `ORDER BY deadline ${safeSortOrder} NULLS LAST, id ${safeSortOrder}`
    : `ORDER BY created_at ${safeSortOrder}, id ${safeSortOrder}`;

  const [countResult, result] = await Promise.all([
    query(`SELECT COUNT(*) AS total FROM opportunities ${where}`, [...parameters]),
    query<{ id: string; name: string; category: OpportunityCategory; deadline: string | null;
      postingStatus: OpportunityListRow['postingStatus']; organizationName: string | null; location: string | null }>(
      `SELECT id::text, name, category, CASE WHEN posting_status <> 'rolling' THEN deadline::text END AS deadline,
        posting_status AS "postingStatus", organization_name AS "organizationName", location
        FROM opportunities ${where} ${order} LIMIT ${addParameter(limit)} OFFSET ${addParameter(offset)}`, parameters,
    ),
  ]);
  const total = Number(countResult.rows[0].total);
  const work = await applicantOpportunities({ ids: result.rows.map((row) => row.id), candidate: candidateId });
  const actions = new Map<string, OpportunityListRow['actions']>();
  for (const item of work) {
    const existing = actions.get(item.id) ?? {};
    existing[item.candidate] = item.summary.action;
    actions.set(item.id, existing);
  }
  return {
    opportunities: result.rows.map((row) => ({ ...row, actions: actions.get(row.id) ?? {} })),
    total,
    hasMore: offset + result.rows.length < total,
  };
}

export async function getOpportunityById(id: string, { includeLegacyDocument = true } = {}): Promise<Opportunity | undefined> {
  if (!isNumericId(id)) return undefined;
  const columns = includeLegacyDocument ? DETAIL_COLUMNS : SELECT_COLUMNS;
  const result = await query(`SELECT ${columns} FROM opportunities WHERE id = $1`, [id]);
  if (!result.rowCount) return undefined;

  const opportunity = mapOpportunityRow(result.rows[0]);
  const sourceResult = await query(
    `SELECT id, source_type, original_name, mime_type, storage_path, source_url
     FROM opportunity_sources WHERE opportunity_id = $1 ORDER BY id`,
    [id],
  );
  opportunity.sources = sourceResult.rows.map(mapSourceRow);
  return opportunity;
}

export async function insertOpportunity(
  client: Queryable,
  input: OpportunityInput,
  sources: UploadedSource[],
  discoveredSourceUrls: string[],
  evidence: Evidence[],
): Promise<string> {
  const opportunity = OpportunityInputSchema.parse(input);
  const result = await client.query<{ id: number }>(
    `INSERT INTO opportunities (
      name, details, deadline, category, organization_name, organization_type,
      location, application_url, contact_email, eligibility, requirements, attributes,
      document_uri, document_type, posting_status, field_evidence
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, '', 'unknown', $13, $14::jsonb)
    RETURNING id`,
    [
      opportunity.name, opportunity.details, opportunity.deadline, opportunity.category,
      opportunity.organizationName, opportunity.organizationType, opportunity.location,
      opportunity.applicationUrl, opportunity.contactEmail, opportunity.eligibility,
      JSON.stringify(opportunity.requirements), JSON.stringify(opportunity.attributes),
      opportunity.postingStatus ?? 'unknown', JSON.stringify(evidence),
    ],
  );
  const id = String(result.rows[0].id);
  await syncOpportunityLinks(client, id, opportunity);
  for (const source of sources) await insertSource(client, id, source);

  const seen = new Set<string>();
  for (const url of [...discoveredSourceUrls, opportunity.applicationUrl || '']) {
    const canonical = canonicalizeUrl(url);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    await insertSource(client, id, {
      sourceType: 'enriched-url', originalName: null, mimeType: 'text/html', storagePath: null,
      sourceUrl: url, contentSha256: null, canonicalUrl: canonical,
    });
  }
  return id;
}

async function insertSource(
  client: Queryable,
  opportunityId: string,
  source: {
    sourceType: OpportunitySource['sourceType']; originalName: string | null; mimeType: string | null;
    storagePath: string | null; sourceUrl: string | null;
    contentSha256: string | null; canonicalUrl: string | null;
  },
) {
  await client.query(
    `INSERT INTO opportunity_sources (
      opportunity_id, source_type, original_name, mime_type, storage_path, source_url,
      content_sha256, canonical_url
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      opportunityId, source.sourceType, source.originalName, source.mimeType,
      source.storagePath, source.sourceUrl, source.contentSha256, source.canonicalUrl,
    ],
  );
}

export async function updateOpportunity(id: string, input: OpportunityInput): Promise<Opportunity | null> {
  if (!isNumericId(id)) return null;
  const opportunity = OpportunityInputSchema.parse(input);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE opportunities SET
        name = $1, details = $2, deadline = $3, category = $4,
        organization_name = $5, organization_type = $6, location = $7,
        application_url = $8, contact_email = $9, eligibility = $10,
        requirements = $11::jsonb, attributes = $12::jsonb,
        reminder_7_sent = CASE WHEN deadline IS DISTINCT FROM $3::date THEN FALSE ELSE reminder_7_sent END,
        reminder_3_sent = CASE WHEN deadline IS DISTINCT FROM $3::date THEN FALSE ELSE reminder_3_sent END,
        reminder_1_sent = CASE WHEN deadline IS DISTINCT FROM $3::date THEN FALSE ELSE reminder_1_sent END,
        updated_at = CURRENT_TIMESTAMP
        , content_revision = content_revision + 1, posting_status = $14, workflow_enabled = TRUE
       WHERE id = $13 RETURNING ${DETAIL_COLUMNS}`,
      [
        opportunity.name, opportunity.details, opportunity.deadline, opportunity.category,
        opportunity.organizationName, opportunity.organizationType, opportunity.location,
        opportunity.applicationUrl, opportunity.contactEmail, opportunity.eligibility,
        JSON.stringify(opportunity.requirements), JSON.stringify(opportunity.attributes), id, opportunity.postingStatus ?? 'unknown',
      ],
    );
    if (!result.rowCount) { await client.query('ROLLBACK'); return null; }
    await syncOpportunityLinks(client, id, opportunity);
    const refreshed = await client.query(`SELECT ${DETAIL_COLUMNS} FROM opportunities WHERE id = $1`, [id]);
    await client.query('COMMIT');
    return mapOpportunityRow(refreshed.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteOpportunity(id: string): Promise<{ deleted: boolean; storagePaths: string[] }> {
  if (!isNumericId(id)) return { deleted: false, storagePaths: [] };
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const sourceResult = await client.query(
      'SELECT storage_path FROM opportunity_sources WHERE opportunity_id = $1 AND storage_path IS NOT NULL',
      [id],
    );
    const result = await client.query('DELETE FROM opportunities WHERE id = $1 RETURNING id', [id]);
    // removeStoredSources keeps any object another opportunity still references.
    const storagePaths = sourceResult.rows.map((row) => String(row.storage_path));
    await client.query('COMMIT');
    return {
      deleted: Boolean(result.rowCount),
      storagePaths,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Where a source lives: a private Storage object or an external URL. */
export async function getSourceLocation(id: string): Promise<{ storagePath: string | null; sourceUrl: string | null } | null> {
  if (!isNumericId(id)) return null;
  const result = await query<{ storage_path: string | null; source_url: string | null }>(
    'SELECT storage_path, source_url FROM opportunity_sources WHERE id = $1',
    [id],
  );
  const row = result.rows[0];
  return row ? { storagePath: row.storage_path, sourceUrl: row.source_url } : null;
}
