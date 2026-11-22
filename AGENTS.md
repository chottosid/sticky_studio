# Working with Sticky Studio's opportunity data

Sticky Studio's ledger lives in Supabase PostgreSQL. When asked to research opportunities, look up relevant existing entries first so you can identify duplicates and ground your recommendations. The internal agent page is optional. A session working in this checkout can use the same database directly.

## Read-only access

From the repository root, use the scoped database login and the research CLI. The commands return JSON and work independently of the website.

```bash
npm run db:research -- list
npm run db:research -- list 'geometric deep learning'
npm run db:research -- show 42
npm run db:research -- profile swarup
```

The default list shows upcoming and undated opportunities. A search includes past records and source URLs to help detect duplicates. It returns up to 50 rows.

For initial setup, run `npm run db:research -- setup` against the intended `DATABASE_URL`. It creates a restricted login with column-level read grants and saves its connection in the ignored `.local/sticky-research.env` file. To reuse the login in another checkout, supply `STICKY_RESEARCH_DATABASE_URL` in that environment. Keep connection strings and credentials out of command output, chat, and commits.

The CLI verifies TLS for hosted connections. If the pooler certificate requires an extra CA, download it from the project's Database Settings and save it as `.local/supabase-postgres-ca.crt`, or configure `sslrootcert` on the connection URL. [Supabase database TLS](https://supabase.com/docs/guides/platform/ssl-enforcement)

For custom SQL, use the research connection and project only the fields you need. The following example reads that credential directly from the private file or existing environment.

```bash
node <<'NODE'
require('dotenv').config({ path: '.local/sticky-research.env', quiet: true });
const { Pool } = require('pg');
if (!process.env.STICKY_RESEARCH_DATABASE_URL) throw new Error('Set STICKY_RESEARCH_DATABASE_URL before querying.');
const url = new URL(process.env.STICKY_RESEARCH_DATABASE_URL);
const ssl = !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
const pool = new Pool({ connectionString: url.href, ssl, connectionTimeoutMillis: 5_000 });

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query('SET LOCAL statement_timeout = 5000');
    const { rows } = await client.query(`
      SELECT id, name, category, organization_name, deadline::text, application_url
      FROM opportunities
      WHERE deadline IS NULL OR deadline >= (now() AT TIME ZONE $1)::date
      ORDER BY deadline NULLS LAST, id
      LIMIT 20`, [process.env.APP_TIMEZONE || 'Asia/Dhaka']);
    console.table(rows);
  } finally {
    try { await client.query('ROLLBACK'); } finally { client.release(); }
  }
}

main().catch((error) => {
  console.error('Database query failed', error.code || error.name);
  process.exitCode = 1;
}).finally(() => pool.end());
NODE
```

- `opportunities` stores the main record. `requirements`, `attributes`, and `profile_assessments` are JSONB. `deadline` is an app-timezone calendar date and can be `NULL`. The research login grants selected columns, so name the columns in a query.
- `opportunity_sources` joins to `opportunities.id` through `opportunity_id`. Check `canonical_url` and `content_sha256` along with the opportunity's `application_url` to detect duplicates. Files with `storage_path` are private. Open them in the signed-in app at `/api/sources/<source-id>`.
- `candidate_profiles` provides the two independent public portfolio snapshots. Use the requested applicant's profile. Assessments may require review when the profile hash, opportunity revision, policy version, or age has changed.

## Saving reviewed research

When asked to write, use the existing [research import script](scripts/import-opportunity-research.js) for reviewed leads. It takes a JSON array of `{ auditKey, opportunity, sourceUrls, findings }` records and validates each `opportunity` against `src/domain/opportunity/schema.ts`. Use a stable, unique `auditKey` and include the original announcement links. Run `node scripts/import-opportunity-research.js reviewed.json` for a dry run. Add `--apply` for the authorized write. This CLI loads `.env` unless `DATABASE_URL` already exists in the shell, so verify the target before applying.

Keep outreach drafts in the app or your response for the user to send manually. Use the public announcement to verify dates and contact details and flag any that remain uncertain.
