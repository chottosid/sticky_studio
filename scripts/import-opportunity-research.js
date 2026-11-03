// Import reviewed research as tracker records. Dry run by default; never sends notifications.
const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');
require('dotenv').config({ quiet: true });
const jiti = require('jiti')(__filename, { alias: { '@': path.join(__dirname, '..', 'src') } });
const { OpportunityInputSchema } = jiti('../src/domain/opportunity/schema.ts');
const { canonicalizeUrl } = jiti('../src/lib/duplicate-normalization.ts');

async function main() {
  const filename = process.argv[2];
  if (!filename) throw new Error('Usage: node scripts/import-opportunity-research.js <reviewed.json> [--apply]');
  const records = JSON.parse(await fs.readFile(filename, 'utf8'));
  for (const record of records) {
    record.opportunity = OpportunityInputSchema.parse(record.opportunity);
    if (!record.auditKey || !Array.isArray(record.sourceUrls)) throw new Error('Each row needs an audit key and source URLs.');
  }
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify(records.map((r) => ({ key: r.auditKey, name: r.opportunity.name, deadline: r.opportunity.deadline, sources: r.sourceUrls.length })), null, 2));
    return;
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
  const client = await pool.connect();
  let inserted = 0; let matched = 0; let skipped = 0;
  try {
    for (const record of records) {
      await client.query('BEGIN');
      try {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [record.auditKey]);
        const prior = await client.query('SELECT 1 FROM opportunity_research_audits WHERE audit_key=$1', [record.auditKey]);
        if (prior.rowCount) { await client.query('ROLLBACK'); skipped += 1; continue; }
        const o = record.opportunity;
        const profs = o.category === 'higher-study' ? o.attributes.professorNames : [];
        // Match the actual advisor/announcement, never a university name alone.
        const existing = profs.length ? await client.query(`SELECT * FROM opportunities
          WHERE category='higher-study' AND attributes->'professorNames' ?| $1::text[]`, [profs]) : { rows: [] };
        if (existing.rows.length > 1) throw new Error(`Ambiguous existing records for ${o.name}; manual review required.`);
        let id; let original = null;
        if (existing.rows.length) {
          original = existing.rows[0]; id = original.id; matched += 1;
          // Keep original announcement content and append the reviewed findings.
          await client.query(`UPDATE opportunities SET details=details || $2,
            organization_name=COALESCE(organization_name,$3),
            application_url=COALESCE(application_url,$4), contact_email=COALESCE(contact_email,$5),
            content_revision=content_revision+1, updated_at=now() WHERE id=$1`,
          [id, `\n\n--- Research cross-check ---\n${o.details}`, o.organizationName, o.applicationUrl, o.contactEmail]);
        } else {
          const result = await client.query(`INSERT INTO opportunities
            (name,details,deadline,category,organization_name,organization_type,location,application_url,contact_email,
             eligibility,requirements,attributes,document_uri,document_type)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,'','unknown') RETURNING id`,
          [o.name,o.details,o.deadline,o.category,o.organizationName,o.organizationType,o.location,o.applicationUrl,o.contactEmail,
            o.eligibility,JSON.stringify(o.requirements),JSON.stringify(o.attributes)]);
          id = result.rows[0].id; inserted += 1;
        }
        for (const url of new Set(record.sourceUrls)) {
          const canonical = canonicalizeUrl(url);
          if (!canonical) continue;
          await client.query(`INSERT INTO opportunity_sources (opportunity_id,source_type,source_url,mime_type,canonical_url)
            SELECT $1,'enriched-url',$2,'text/html',$3 WHERE NOT EXISTS
            (SELECT 1 FROM opportunity_sources WHERE opportunity_id=$1 AND canonical_url=$3)`, [id,url,canonical]);
        }
        await client.query(`INSERT INTO opportunity_research_audits (opportunity_id,audit_key,original_data,findings)
          VALUES ($1,$2,$3::jsonb,$4::jsonb)`, [id,record.auditKey,JSON.stringify(original),JSON.stringify(record.findings)]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
    console.log(JSON.stringify({ inserted, matched, skipped }));
  } finally { client.release(); await pool.end(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
