# Sticky Studio

A single-user opportunity manager for jobs, internships, contests, and higher-study positions. Submitted images, PDFs, or text are converted into a structured draft, optionally enriched from bounded same-site links, and shown for human review. Extraction never saves automatically.

## Local setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and configure it.
3. Create the private source bucket: `npm run storage:setup`
4. Apply versioned database migrations: `npm run db:migrate`
5. Start the app: `npm run dev`

The development server runs at <http://localhost:9002>.

## Quality checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` runs all checks before compiling the production app.

## Production deployment

Follow [DEPLOYMENT.md](./DEPLOYMENT.md). Database migrations are intentionally CLI-only: there is no public HTTP migration route and the app does not mutate its schema during startup.
