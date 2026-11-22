# Sticky Studio

A single-user opportunity manager for jobs, internships, contests, and higher-study positions. Submitted images, PDFs, or text are converted into a structured draft, optionally enriched from bounded same-site links, and shown for human review. Extraction never saves automatically. An optional Telegram bot queues opportunities from groups into a review inbox (see DEPLOYMENT.md).

## Local setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and configure it.
3. Create the private source bucket: `npm run storage:setup`
4. Apply versioned database migrations: `npm run db:migrate`
5. Start the app: `npm run dev`

The development server runs at <http://localhost:9002>.

## Agent

Open **Agent** from the signed-in header. Ask “What’s due this week?” to rank saved opportunities using the selected applicant's deadlines and current assessments. Ask “Find funded PhDs in computer vision” for linked sources and proposals you can review before saving. Ask “Draft a cold email” and choose a saved opportunity, or start from **Draft outreach** on its detail page. Copy the draft for manual sending or refine it in the conversation with a request such as “Make it shorter.” The conversation stays in the current Agent page session.

Research and drafting use `OPENROUTER_AGENT_API_KEY`, a separate server-side OpenRouter key with a monthly credit limit. The optional `OPENROUTER_AGENT_MODEL` defaults to `google/gemini-2.5-flash-lite`. Start a private chat with the configured Telegram bot using `/start` to receive deadline reminders.

## Separate applicant priorities

The ledger assesses Swarup and Archita independently using their public portfolios at [swarupsidhartho.com](https://swarupsidhartho.com/) and [archi120.github.io](https://archi120.github.io/). Each opportunity shows a tier for each person; filter or sort by either applicant. The detail page explains profile evidence, eligibility, strengths, gaps and the next action. P1 means focus first, P2 worth pursuing, P3 stretch/secondary and P4 low fit. Explicit eligibility failures and insufficient evidence have separate labels. These tiers are effort priorities, not acceptance probabilities.

Portfolio snapshots refresh at most daily during assessment work. New or edited opportunities are assessed after saving; the daily assessment cron also renews missing or stale results. A changed portfolio, changed opportunity or assessment older than seven days needs review. Use **Refresh portfolios & assess**, **Assess pending**, or the detail page’s **Reassess both** to update manually. Add test scores and constraints under each person’s **Additional facts & preferences**; missing information is not invented or transferred between applicants.

All model calls use OpenRouter with `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` (default `openai/gpt-6-luna-pro`). The key stays server-side. Portfolio and opportunity text are sent to that provider for assessment. There is no silent Gemini fallback.

For a trusted local bulk refresh:

```bash
npm run opportunities:assess -- --refresh-profiles --concurrency 2
# Reassess even current results, with additional model usage:
npm run opportunities:assess -- --force
```

The CLI sends no email or applications. Reviewed PhD leads can be imported with `node scripts/import-opportunity-research.js reviewed.json` (dry run) and `--apply` after review. Imports preserve original announcements, add sources and audit records, and never trigger notification mail. An undated lab call remains a research lead with its uncertainty stated.

## Quality checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` runs all checks before compiling the production app.

## Production deployment

Follow [DEPLOYMENT.md](./DEPLOYMENT.md). Database migrations are intentionally CLI-only: there is no public HTTP migration route and the app does not mutate its schema during startup.
