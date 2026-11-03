// Trusted local CLI. No email, Telegram messages, or application submissions are sent.
const path = require('node:path');
require('dotenv').config({ quiet: true });
const jiti = require('jiti')(__filename, {
  alias: { '@': path.join(__dirname, '..', 'src'),
    'server-only': require.resolve('next/dist/compiled/server-only/empty.js') },
});

async function main() {
  const { refreshProfiles } = jiti('../src/lib/profiles.ts');
  const { assessmentQueue, assessOpportunities } = jiti('../src/lib/assessments.ts');
  const profiles = await refreshProfiles(process.argv.includes('--refresh-profiles'));
  console.log('Portfolio snapshots:', profiles.map((profile) => ({ name: profile.name, ready: !!profile.text, error: profile.fetchError })));
  const ids = await assessmentQueue(process.argv.includes('--force'));
  console.log(`${ids.length} opportunities queued; both profiles assessed independently.`);
  let completed = 0;
  let failed = 0;
  let next = 0;
  const concurrencyFlag = process.argv.indexOf('--concurrency');
  const concurrency = Math.max(1, Math.min(3, Number(process.argv[concurrencyFlag + 1]) || 1));
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < ids.length) {
      const offset = next; next += 3;
      const batch = ids.slice(offset, offset + 3);
      try {
        const result = await assessOpportunities(batch, process.argv.includes('--force'));
        completed += result.assessed;
        console.log(JSON.stringify({ completed, total: ids.length, ...result, ids: batch }));
      } catch (error) {
        failed += batch.length;
        console.error('Batch failed:', batch.join(','), error.message);
      }
    }
  }));
  console.log(JSON.stringify({ completed, failed }));
  if (failed) process.exitCode = 1;
}
main().then(() => process.exit(process.exitCode || 0)).catch((error) => { console.error(error.message); process.exit(1); });
