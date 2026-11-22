# Working with Sticky Studio's opportunity data

Sticky Studio's ledger lives in Supabase PostgreSQL. When asked to research opportunities, look up relevant existing entries first so you can identify duplicates and ground your recommendations. The internal agent page is optional. A session working in this checkout can use the same database directly.

## Read-only access

From the repository root, use the scoped database login and the research CLI. The commands return JSON and work independently of the website.

```bash
npm run db:research -- list
npm run db:research -- list 'geometric deep learning'
npm run db:research -- show 42
npm run db:research -- organizations 'johns hopkins'
npm run db:research -- professors 'reinforcement learning'
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
- `organizations` has one row per university or company (`name`, normalized `name_key`, `alias_keys`, `country`, `website`). `opportunities.organization_id` points to it, and `organization_name` stays as the free-text original. Resolve a name with `resolveOrganization` in `src/lib/organizations.ts`, which strips department suffixes and folds spellings such as "Univ. of Maryland - College Park".
- `professors` tracks people per university (`organization_id`, `department`, `homepage`, `scholar_url`, `research_areas`, `recruiting_status` of unknown/taking/not_taking, `recruiting_checked_on`, `recruiting_source_url`). `opportunity_professors` links them to openings, since some openings name co-supervisors. `notes` on both tables are private to the app. Set `recruiting_status` only after checking the lab or department page, and record the source URL and date.
- `candidate_profiles` provides the two independent public portfolio snapshots. Use the requested applicant's profile. Assessments may require review when the profile hash, opportunity revision, or policy version changes.

## Applicant workflow data

The authenticated opportunity detail shows both applicants' application stages and follow-up dates. Under authorized owner access, the new database tables are:

- `applicant_opportunities` joins `opportunities.id` and `candidate_profiles.id` via `opportunity_id` and `candidate_id`. An absent row means **Considering**. Treat follow-up notes as private.
- `applicant_assessments` keeps each review with the same keys, the profile hash, opportunity revision, policy version, and `assessed_at`. The latest record is the highest ID for the pair. `result` stores fit, requirement checks, and excerpts. `opportunities.profile_assessments` preserves the original format for historical reference.
- `opportunities.posting_status` can be rolling, closed, or unknown. A known calendar deadline is in `deadline`. `field_evidence` stores reviewed source excerpts from imports and their source labels.

The research CLI continues to provide scoped access to the opportunity and its sources. Use the signed-in app for personal progress or current fit unless authorized owner access is explicitly needed.

## Reliable research sources

Web search quota runs out quickly, so start from these sources and fetch pages directly. Treat them as leads. Every opportunity still needs a primary-page check of its official posting for the deadline and funding before it goes into the ledger.

Run `node scripts/research-sources.js` to cache the data under the ignored `.local/research-sources/` folder, and to build `us-faculty-active.csv` there. The data is CC BY-NC-ND, so use it for research only and never commit or redistribute it.

1. **CSrankings** ([csrankings.org](https://csrankings.org), data in [emeryberger/CSrankings](https://github.com/emeryberger/CSrankings), branch `gh-pages`). Faculty with homepages (`csrankings-a..z.csv`) and per-area publication counts (`generated-author-info.csv`). `us-faculty-active.csv` joins them into US faculty active since 2022, with homepage, top areas, and a score. Use it to pick professors, then read their lab pages for "prospective students" or "recruiting" text. It has no open-position data.
2. **CSStipendRankings** ([csstipendrankings.org](https://csstipendrankings.org), data in [CSStipendRankings/CSStipendRankings](https://github.com/CSStipendRankings/CSStipendRankings)). `stipend-us.csv` has the stipend, fees, and summer funding per US department. `fellowship-us.csv` lists major fellowships. Use it to back a funding claim, but the data is community-submitted. The site that people often call "csstipend.org" does not exist.
3. **Department recruiting pages** list faculty who are taking students for the cycle, for example [CU Boulder](https://www.colorado.edu/cs/admissions/graduate-admissions/see-who-recruiting), [UT Austin](https://www.cs.utexas.edu/faculty/recruiting), and Vanderbilt and UAB PhD pages. These are the best source for named-professor openings in the US.
4. **GitHub lists for remote and RA roles**: [BryanBradfo/ai-residency-programs](https://github.com/BryanBradfo/ai-residency-programs) (cached as `ai-residency-programs.md`) and [speedyapply/2026-AI-College-Jobs](https://github.com/speedyapply/2026-AI-College-Jobs). Many entries require current student status or work authorization, so check eligibility on the posting. For company roles, fetch the Greenhouse, Lever, or Ashby job boards directly.

Do not open `csphdfellowships.org`, because it redirects to an unrelated host with a token. Its GitHub CSV (`csphdfellowships.csv`) is usable but dates from August 2024.

## Saving reviewed research

When asked to write, use the existing [research import script](scripts/import-opportunity-research.js) for reviewed leads. It takes a JSON array of `{ auditKey, opportunity, sourceUrls, findings }` records, links each new row to its organization and named professors, and validates each `opportunity` against `src/domain/opportunity/schema.ts`. Use a stable, unique `auditKey` and include the original announcement links. Run `node scripts/import-opportunity-research.js reviewed.json` for a dry run. Add `--apply` for the authorized write. This CLI loads `.env` unless `DATABASE_URL` already exists in the shell, so verify the target before applying.

Keep outreach drafts in the app or your response for the user to send manually. Use the public announcement to verify dates and contact details and flag any that remain uncertain.
