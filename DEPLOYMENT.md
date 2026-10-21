# Production migration and deployment

The migration is additive and retains the existing opportunity rows and base64 source columns. The old cleanup cron has been removed, so past opportunities remain available.

## 1. Back up and configure

1. Create a Supabase database backup or confirm Point-in-Time Recovery is available for the project.
2. In the deployment environment, add the new variables from `.env.example`:
   - `SESSION_SECRET`: a new random secret of at least 32 characters.
   - `SUPABASE_URL`: the project API URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: server-only service-role key; never prefix it with `NEXT_PUBLIC_`.
   - Optional `APP_TIMEZONE`, `OPENROUTER_MODEL`, and `GEMINI_MODEL` overrides.
3. Keep the existing `DATABASE_URL`, authentication, LLM, SMTP, and cron variables.

## 2. Prepare storage and schema

Run these from a trusted machine using the production environment variables:

```bash
npm ci
npm run storage:setup
npm run db:migrate
```

`storage:setup` creates a private `opportunity-sources` bucket with a 10 MB object limit. `db:migrate` records each SQL file in `schema_migrations`, so it is safe to rerun.

Verify before deploying:

```sql
SELECT name, applied_at FROM schema_migrations ORDER BY name;
SELECT COUNT(*) FROM opportunities;
SELECT indexname FROM pg_indexes WHERE tablename IN ('opportunities', 'opportunity_sources');
```

## 3. Deploy compatible application code

Deploy only after both migrations are recorded. Existing records remain readable through their legacy `document_uri`; new records use private Storage and short-lived signed links.

The new signed session format invalidates old `session=authenticated` cookies. Log in again after deployment—this is expected.

## 4. Migrate existing source documents

After the new deployment is healthy, run:

```bash
npm run db:migrate-sources
npm run db:backfill-duplicates
```

Both scripts are idempotent. The first uploads only rows without an existing stored source, downloads each object, compares its SHA-256 hash, and then inserts the source record. The duplicate-signal backfill canonicalizes historical source/application URLs and records SHA-256 hashes for stored files. Without Supabase storage credentials it still backfills URLs and reports the file hashes it skipped. They intentionally leave `document_uri` untouched for rollback safety.

Verify:

```sql
SELECT COUNT(*) AS legacy_documents
FROM opportunities
WHERE COALESCE(document_uri, '') <> '';

SELECT COUNT(DISTINCT opportunity_id) AS migrated_opportunities
FROM opportunity_sources
WHERE storage_path IS NOT NULL;

SELECT COUNT(*) AS sources_with_duplicate_signals
FROM opportunity_sources
WHERE canonical_url IS NOT NULL OR content_sha256 IS NOT NULL;
```

Open each existing opportunity in the UI and confirm its signed source link works. After at least one stable release and a fresh backup, a separate cleanup migration may remove legacy base64 data; it is deliberately not included here.

## 5. Operational checks and rollback

- Confirm extraction produces a review draft and no row/storage object appears before **Save Opportunity**.
- Submit a paraphrase of an existing announcement, review every proposed match, cancel once, then confirm **Save anyway** only saves after explicit approval.
- Save one no-deadline opportunity and confirm it appears under Upcoming without reminder errors.
- Confirm 7/3/1-day reminders still run through `/api/cron/reminders` with `CRON_SECRET`.
- Confirm the Vercel cleanup cron is gone; existing history must not be deleted.

If the application deployment must be rolled back, the additive columns do not break the previous code and legacy `document_uri` values are still present. Roll back the application first; do not drop new columns or the bucket during an incident.

## Telegram bot

> **Required for every deployment of this release, even without Telegram:** run `npm run db:migrate` (adds `004_telegram.sql`) *before* deploying. The home page reads the Telegram inbox table and fails without it.

1. Add `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` and `TELEGRAM_OWNER_ID` to the deployment environment.
2. Run `npm run db:migrate` (adds `004_telegram.sql`).
3. In @BotFather: `/setprivacy` → choose the bot → **Disable**.
4. After deploying, register the webhook from a trusted machine:

   ```bash
   npm run telegram:setup -- https://your-production-domain
   ```

5. Add the bot to a group **from the owner account**. Groups added by anyone else are left immediately. If the bot was in a group before this release, remove it and add it again.
6. Forwarding a post to the bot in a private chat from the owner account also queues it.

New opportunities appear in the **Telegram inbox** on the home page; nothing is saved until you review it. For local testing, expose port 9002 over https (for example `cloudflared tunnel --url http://localhost:9002`) and run `npm run telegram:setup -- <tunnel-url>`. Re-run it with the production URL afterwards, because only one webhook can be registered at a time.

### Multi-message posts and importing history

- Run `npm run db:migrate` before deploying (adds `005_telegram_bundles.sql`).
- Messages one person posts within 60 s of each other (a screenshot, then its text) are extracted together as one inbox item. The webhook's background run waits out that window, so `/api/telegram/webhook` uses `maxDuration = 300`, which needs Vercel Fluid compute.
- To import a group's earlier messages: in Telegram Desktop use **Export chat history** (HTML, with photos), add the bot to that group, then run `npm run telegram:import -- <export folder>` from a trusted machine with production env vars. It is safe to re-run; already imported posts are skipped and failed ones are retried.

## Release: shared sources, login limit, redesign

Run `npm run db:migrate` **before** deploying this release (adds `006_shared_sources_and_login_attempts.sql`). Sign-in reads the new `login_attempts` table, and the dropped unique index is what lets one post save several opportunities.
