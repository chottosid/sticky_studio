const { createHash } = require('node:crypto');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const BUCKET = 'opportunity-sources';
const TRACKING_PARAMETERS = new Set(['fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'ref_src', 'source']);

function canonicalizeUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.hash = '';
    let doi = null;
    if (['doi.org', 'dx.doi.org'].includes(url.hostname)) doi = url.pathname.slice(1);
    else doi = /\/doi\/(?:pdf|abs|full|epdf)?\/?(10\.\d{4,9}\/[^?#]+)/i.exec(url.pathname)?.[1] || null;
    if (doi) return `https://doi.org/${decodeURIComponent(doi).replace(/\.pdf$/i, '').toLowerCase()}`;
    if (/(^|\.)arxiv\.org$/i.test(url.hostname)) {
      const match = /^\/(?:abs|pdf)\/([^/?#]+?)(?:\.pdf)?$/i.exec(url.pathname);
      if (match) return `https://arxiv.org/abs/${match[1].toLowerCase()}`;
    }
    for (const key of Array.from(url.searchParams.keys())) {
      if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMETERS.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return null;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  const storage = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    : null;
  if (!storage) {
    console.warn('Storage credentials are unavailable; URL signals will be backfilled, but historical file hashes will be skipped.');
  }
  const client = await pool.connect();
  let updated = 0;
  let skipped = 0;
  try {
    const sources = await client.query(
      'SELECT id, source_url, storage_path, canonical_url, content_sha256 FROM opportunity_sources ORDER BY id',
    );
    for (const source of sources.rows) {
      let canonicalUrl = source.canonical_url || (source.source_url ? canonicalizeUrl(source.source_url) : null);
      let contentSha256 = source.content_sha256;
      if (!contentSha256 && source.storage_path && storage) {
        const { data, error } = await storage.storage.from(BUCKET).download(source.storage_path);
        if (error || !data) {
          console.warn(`Skipped source ${source.id}: ${error?.message || 'download failed'}`);
          skipped += 1;
        } else {
          contentSha256 = createHash('sha256').update(Buffer.from(await data.arrayBuffer())).digest('hex');
        }
      } else if (!contentSha256 && source.storage_path) {
        skipped += 1;
      }
      await client.query(
        'UPDATE opportunity_sources SET canonical_url = $1, content_sha256 = $2 WHERE id = $3',
        [canonicalUrl, contentSha256, source.id],
      );
      updated += 1;
    }

    const opportunities = await client.query(
      'SELECT id, application_url FROM opportunities WHERE application_url IS NOT NULL',
    );
    for (const opportunity of opportunities.rows) {
      const canonicalUrl = canonicalizeUrl(opportunity.application_url);
      if (!canonicalUrl) continue;
      await client.query(
        `INSERT INTO opportunity_sources (
          opportunity_id, source_type, mime_type, source_url, canonical_url
        ) SELECT $1, 'enriched-url', 'text/html', $2, $3
        WHERE NOT EXISTS (
          SELECT 1 FROM opportunity_sources WHERE opportunity_id = $1 AND canonical_url = $3
        )`,
        [opportunity.id, opportunity.application_url, canonicalUrl],
      );
    }
    console.log(`Duplicate-signal backfill complete: ${updated} sources updated, ${skipped} downloads skipped.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Duplicate-signal backfill failed:', error);
  process.exitCode = 1;
});
