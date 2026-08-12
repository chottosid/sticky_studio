import type { PoolClient } from 'pg';
import {
  OpportunityInputSchema,
  type OpportunityCategory,
  type OpportunityInput,
} from '@/domain/opportunity/schema';
import type { DocumentType, Opportunity, OpportunitySource } from '@/lib/types';
import { getClient, query } from './db';
import { formatDeadline } from './utils';
import { attachSignedUrls, type UploadedSource } from './source-storage';
import { canonicalizeUrl } from './duplicate-normalization';

type Queryable = Pick<PoolClient, 'query'>;

const SELECT_COLUMNS = `
  id, name, details, deadline, category,
  organization_name, organization_type, location, application_url, contact_email,
  eligibility, requirements, attributes, document_uri, document_type, created_at, updated_at
`;

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
  page = 1,
  limit = 10,
  sortBy = 'created_at',
  sortOrder: 'ASC' | 'DESC' = 'DESC',
  searchQuery?: string,
  status?: 'upcoming' | 'past',
  category?: OpportunityCategory,
): Promise<{ opportunities: Opportunity[]; total: number; hasMore: boolean }> {
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const parameters: unknown[] = [];

  const addParameter = (value: unknown) => {
    parameters.push(value);
    return `$${parameters.length}`;
  };

  if (searchQuery?.trim()) {
    const placeholder = addParameter(`%${searchQuery.trim()}%`);
    conditions.push(`(
      name ILIKE ${placeholder} OR details ILIKE ${placeholder} OR
      COALESCE(organization_name, '') ILIKE ${placeholder} OR
      COALESCE(location, '') ILIKE ${placeholder}
    )`);
  }
  if (status === 'upcoming') conditions.push('(deadline IS NULL OR deadline >= CURRENT_DATE)');
  if (status === 'past') conditions.push('(deadline IS NOT NULL AND deadline < CURRENT_DATE)');
  if (category) conditions.push(`category = ${addParameter(category)}`);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const validSortColumns = ['created_at', 'deadline', 'name', 'id'];
  const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
  const safeSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';
  const order = safeSortBy === 'deadline'
    ? `ORDER BY deadline ${safeSortOrder} NULLS LAST`
    : `ORDER BY ${safeSortBy} ${safeSortOrder}`;

  const countResult = await query(`SELECT COUNT(*) AS total FROM opportunities ${where}`, parameters);
  const total = Number(countResult.rows[0].total);
  const limitPlaceholder = addParameter(limit);
  const offsetPlaceholder = addParameter(offset);
  const result = await query(
    `SELECT ${SELECT_COLUMNS} FROM opportunities ${where} ${order} LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    parameters,
  );

  return {
    opportunities: result.rows.map(mapOpportunityRow),
    total,
    hasMore: page * limit < total,
  };
}

export async function getOpportunityById(id: string): Promise<Opportunity | undefined> {
  const result = await query(`SELECT ${SELECT_COLUMNS} FROM opportunities WHERE id = $1`, [id]);
  if (!result.rowCount) return undefined;

  const opportunity = mapOpportunityRow(result.rows[0]);
  const sourceResult = await query(
    `SELECT id, source_type, original_name, mime_type, storage_path, source_url
     FROM opportunity_sources WHERE opportunity_id = $1 ORDER BY id`,
    [id],
  );
  opportunity.sources = await attachSignedUrls(sourceResult.rows.map(mapSourceRow));
  return opportunity;
}

export async function saveOpportunity(
  input: OpportunityInput,
  sources: UploadedSource[],
  discoveredSourceUrls: string[],
): Promise<Opportunity> {
  const opportunity = OpportunityInputSchema.parse(input);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO opportunities (
        name, details, deadline, category, organization_name, organization_type,
        location, application_url, contact_email, eligibility, requirements, attributes,
        document_uri, document_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, '', 'unknown')
      RETURNING ${SELECT_COLUMNS}`,
      [
        opportunity.name, opportunity.details, opportunity.deadline, opportunity.category,
        opportunity.organizationName, opportunity.organizationType, opportunity.location,
        opportunity.applicationUrl, opportunity.contactEmail, opportunity.eligibility,
        JSON.stringify(opportunity.requirements), JSON.stringify(opportunity.attributes),
      ],
    );
    const saved = mapOpportunityRow(result.rows[0]);

    for (const source of sources) {
      await insertSource(client, saved.id, source);
    }
    const sourceUrlByCanonical = new Map<string, string>();
    for (const url of [
      ...discoveredSourceUrls,
      ...(opportunity.applicationUrl ? [opportunity.applicationUrl] : []),
    ]) {
      const canonical = canonicalizeUrl(url);
      if (canonical && !sourceUrlByCanonical.has(canonical)) sourceUrlByCanonical.set(canonical, url);
    }
    const sourceUrls = Array.from(sourceUrlByCanonical.values());
    for (const url of sourceUrls) {
      await insertSource(client, saved.id, {
        sourceType: 'enriched-url', originalName: null, mimeType: 'text/html', storagePath: null, sourceUrl: url,
        contentSha256: null, canonicalUrl: canonicalizeUrl(url),
      });
    }
    await client.query('COMMIT');
    saved.sources = [
      ...sources.map((source, index) => ({ id: `new-${index}`, ...source })),
      ...sourceUrls.map((url, index) => ({
        id: `url-${index}`,
        sourceType: 'enriched-url' as const,
        originalName: null,
        mimeType: 'text/html',
        storagePath: null,
        sourceUrl: url,
      })),
    ];
    return saved;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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
  const opportunity = OpportunityInputSchema.parse(input);
  const result = await query(
    `UPDATE opportunities SET
      name = $1, details = $2, deadline = $3, category = $4,
      organization_name = $5, organization_type = $6, location = $7,
      application_url = $8, contact_email = $9, eligibility = $10,
      requirements = $11::jsonb, attributes = $12::jsonb,
      reminder_7_sent = CASE WHEN deadline IS DISTINCT FROM $3::date THEN FALSE ELSE reminder_7_sent END,
      reminder_3_sent = CASE WHEN deadline IS DISTINCT FROM $3::date THEN FALSE ELSE reminder_3_sent END,
      reminder_1_sent = CASE WHEN deadline IS DISTINCT FROM $3::date THEN FALSE ELSE reminder_1_sent END,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $13 RETURNING ${SELECT_COLUMNS}`,
    [
      opportunity.name, opportunity.details, opportunity.deadline, opportunity.category,
      opportunity.organizationName, opportunity.organizationType, opportunity.location,
      opportunity.applicationUrl, opportunity.contactEmail, opportunity.eligibility,
      JSON.stringify(opportunity.requirements), JSON.stringify(opportunity.attributes), id,
    ],
  );
  return result.rowCount ? mapOpportunityRow(result.rows[0]) : null;
}

export async function deleteOpportunity(id: string): Promise<{ deleted: boolean; storagePaths: string[] }> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const sourceResult = await client.query(
      'SELECT storage_path FROM opportunity_sources WHERE opportunity_id = $1 AND storage_path IS NOT NULL',
      [id],
    );
    const result = await client.query('DELETE FROM opportunities WHERE id = $1 RETURNING id', [id]);
    await client.query('COMMIT');
    return {
      deleted: Boolean(result.rowCount),
      storagePaths: sourceResult.rows.map((row) => String(row.storage_path)),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
