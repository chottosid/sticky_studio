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

Open **Agent** from the signed-in header. Ask “What’s due this week?” to see the selected applicant's upcoming actions and follow-ups. Ask “Find funded PhDs in computer vision” for linked sources and proposals you can review before saving. Ask “Draft a cold email” and choose a saved opportunity, or start from **Draft outreach** on its detail page. Copy the draft for manual sending or refine it in the conversation with a request such as “Make it shorter.” The conversation stays in the current Agent page session.

Research and drafting use `OPENROUTER_AGENT_API_KEY`, a separate server-side OpenRouter key with a monthly credit limit. The optional `OPENROUTER_AGENT_MODEL` defaults to `google/gemini-2.5-flash-lite`. Start a private chat with the configured Telegram bot using `/start` to receive deadline reminders.

## Applicant workflow

Open **Today** for the selected applicant's follow-ups, upcoming applications, and verification tasks. Use **Ledger** to browse every opportunity and **Inbox** to review Telegram drafts. The detail page records each applicant's stage, follow-up date, and note independently. Set rolling or closed postings in the opportunity editor.

Assessments show fit and separate checks for decisive requirements, with the evidence used for each check. Earlier results remain in history. Use **Assess applicant** on the detail page for a fresh review. In **Settings**, refresh the portfolios or edit the additional facts and preferences. Once an assessment uses the new workflow, changes to its applicant or opportunity evidence can queue a refresh. Existing legacy assessments migrate without an automatic paid re-assessment of the full ledger.

Assessment and extraction calls use the server-side `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` (default `openai/gpt-6-luna-pro`). The assessment call receives the selected applicant's portfolio and additional facts alongside the saved opportunity evidence. Planner and reminder actions come from saved workflow data.

To queue and process a bounded batch, or explicitly reassess selected opportunity IDs:

```bash
npm run opportunities:assess -- --refresh-profiles
npm run opportunities:assess -- 42 57 --candidate=archita --force
```

Use [AGENTS.md](AGENTS.md) for read-only Codex access and approved research imports.

## Quality checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` runs all checks before compiling the production app.

## Production deployment

Follow [DEPLOYMENT.md](./DEPLOYMENT.md). Database migrations are intentionally CLI-only: there is no public HTTP migration route and the app does not mutate its schema during startup.
