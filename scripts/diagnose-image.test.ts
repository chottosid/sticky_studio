// TEMP diagnostic: runs the real extraction pipeline on one image and logs what
// each stage returns. Delete after use. Run: npx vitest run scripts/diagnose-image.test.ts
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { prepareExtractionSources, urlsFromPreparedSources } from '@/ai/input';
import { enrichFromUrls } from '@/ai/enrichment';
import { extractWithProvider } from '@/ai/provider';
import { mergeEnrichedOpportunities } from '@/ai/contracts';

const IMAGE = process.env.DIAG_IMAGE!;
const show = (label: string, value: unknown) => console.log(`\n=== ${label} ===\n`, JSON.stringify(value, null, 2));

function normalizeUrls(values: string[]): string[] {
  const urls: string[] = [];
  for (const value of values) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
      url.hash = '';
      urls.push(url.toString());
    } catch { /* skip */ }
  }
  return Array.from(new Set(urls)).slice(0, 20);
}

function extractionPrompt(stage: 'initial' | 'enriched'): string {
  return `Extract every distinct opportunity from all supplied sources.

Today is 2026-08-26.
- One entry per distinct opening, program, or contest; merge reposts of the same one. At most 10.
- When one post lists several openings, give each its own entry named "Role at Organization".
- Use null or [] when a fact is not supported. Never infer names or links.
- Resolve relative dates to YYYY-MM-DD; otherwise deadline must be null.
- category must be job, internship, contest, or higher-study.
- organizationName means company for jobs/internships, institution/university for higher study, and organizer for contests.
- Put category-specific facts into attributes; keep irrelevant attributes null or [].
- details is a concise factual summary, not a dump of the source.
- Evidence field paths use names such as organizationName or attributes.professorNames.
- Cite exact source IDs. Keep excerpts short.
- List useful HTTP(S) links present in sources under discoveredSourceUrls.
- Mark relevant missing fields in unresolvedFields.
${stage === 'enriched' ? '- The fetched pages exist only to complete details of the openings from the originally submitted sources; never add an opening that appears only in a fetched page. Prefer facts from the originally submitted sources when sources conflict; add a warning for unresolved conflicts.' : ''}`;
}

const names = (raw: Awaited<ReturnType<typeof extractWithProvider>>) =>
  raw.opportunities.map((o) => ({ name: o.name, category: o.category, deadline: o.deadline }));

test('diagnose image extraction', { timeout: 240_000 }, async () => {
  if (!IMAGE) return; // no-op unless DIAG_IMAGE is set; run explicitly per header
  const dataUri = `data:image/png;base64,${readFileSync(IMAGE, 'base64')}`;
  const { preparedSources } = await prepareExtractionSources({
    sources: [{ id: 'source-1', kind: 'image', name: 'post.png', mimeType: 'image/png', dataUri }],
  });

  const initial = await extractWithProvider(preparedSources, extractionPrompt('initial'));
  show('INITIAL opportunities', names(initial));
  show('INITIAL discoveredSourceUrls', initial.discoveredSourceUrls);

  const seedUrls = normalizeUrls([
    ...urlsFromPreparedSources(preparedSources),
    ...initial.discoveredSourceUrls,
    ...initial.opportunities.flatMap((o) => o.applicationUrl ? [o.applicationUrl] : []),
  ]);
  show('seedUrls', seedUrls);

  const enrichment = await enrichFromUrls(seedUrls);
  show('enrichment sources fetched', enrichment.sources.map((s) => s.label));
  show('enrichment warnings', enrichment.warnings);

  if (enrichment.sources.length) {
    const enriched = await extractWithProvider([...preparedSources, ...enrichment.sources], extractionPrompt('enriched'));
    show('ENRICHED opportunities (raw model output)', names(enriched));
    const merged = mergeEnrichedOpportunities(initial.opportunities, enriched.opportunities);
    show('MERGED opportunities (what the app would show)', names({ ...enriched, opportunities: merged.opportunities }));
    show('droppedNewOpenings', merged.droppedNewOpenings);
  }
  expect(initial.opportunities.length).toBeGreaterThan(0);
});
