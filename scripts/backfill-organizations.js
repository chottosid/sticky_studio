// Link existing opportunities to organizations and professors (migration 010).
// Dry run (default) only reads and writes a review file; --apply links rows. It never deletes anything.
//   node scripts/backfill-organizations.js [mapping.json] [--apply]
const fs = require('node:fs/promises');
const path = require('node:path');
const { withDatabase, readOnly, reportError } = require('./db-access');
const jiti = require('jiti')(__filename, { alias: { '@': path.join(__dirname, '..', 'src') } });
const { organizationDisplayName, organizationKey, professorKey, syncOpportunityLinks } = jiti('../src/lib/organizations.ts');

const apply = process.argv.includes('--apply');
const output = process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? path.join(__dirname, '..', '.local', 'organization-mapping.json');

const rowsSql = `SELECT id, name, category, organization_name, attributes FROM opportunities ORDER BY id`;

async function main() {
  await withDatabase('DATABASE_URL', async (client) => {
    const { rows } = await readOnly(client, () => client.query(rowsSql));
    const groups = new Map();
    for (const row of rows) {
      const key = organizationKey(row.organization_name ?? '');
      if (!key) continue;
      const group = groups.get(key) ?? { key, variants: {}, professors: new Set(), opportunities: [] };
      group.variants[row.organization_name] = (group.variants[row.organization_name] ?? 0) + 1;
      group.opportunities.push(row.id);
      for (const name of row.category === 'higher-study' ? row.attributes?.professorNames ?? [] : []) group.professors.add(`${name} (${professorKey(name)})`);
      groups.set(key, group);
    }
    const review = [...groups.values()].map((g) => ({
      // Same name --apply will store: the first row's spelling by id, unless a canonical display name exists.
      organization: organizationDisplayName(g.opportunities.length ? rows.find((r) => r.id === g.opportunities[0]).organization_name : ''),
      key: g.key, variants: g.variants, professors: [...g.professors], opportunityIds: g.opportunities,
    })).sort((a, b) => b.opportunityIds.length - a.opportunityIds.length);
    await fs.mkdir(path.dirname(output), { recursive: true });
    // Organizations that may still be one place: one key is a word-prefix of the other, or the first two words match.
    const suspects = [];
    for (let i = 0; i < review.length; i += 1) for (let j = i + 1; j < review.length; j += 1) {
      const [a, b] = [review[i].key, review[j].key];
      const lead = (k) => k.split(' ').slice(0, 2).join(' ');
      if (a.startsWith(`${b} `) || b.startsWith(`${a} `) || (lead(a) === lead(b) && lead(a).includes(' ') && !lead(a).startsWith('university '))) suspects.push([review[i].organization, review[j].organization]);
    }
    await fs.writeFile(output, JSON.stringify({ suspectPairs: suspects, organizations: review }, null, 1));
    const merged = review.filter((g) => Object.keys(g.variants).length > 1).length;
    console.log(JSON.stringify({ organizations: review.length, withSeveralSpellings: merged, suspectPairs: suspects.length, rowsWithoutOrganization: rows.length - review.reduce((n, g) => n + g.opportunityIds.length, 0), mappingFile: output }));
    if (!apply) return;

    await client.query('BEGIN');
    try {
      for (const row of rows) await syncOpportunityLinks(client, row.id, {
        organizationName: row.organization_name, category: row.category, attributes: row.attributes ?? {},
      });
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    const { rows: [counts] } = await client.query(`SELECT
      (SELECT count(*) FROM organizations)::int AS organizations, (SELECT count(*) FROM professors)::int AS professors,
      (SELECT count(*) FROM opportunity_professors)::int AS links,
      (SELECT count(*) FROM opportunities WHERE organization_id IS NULL AND organization_name IS NOT NULL)::int AS unlinked`);
    console.log(JSON.stringify(counts));
  });
}
main().catch(reportError);
