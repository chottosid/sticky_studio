// Use the same assessment queue and worker as the application.
const path = require('node:path');
const fs = require('node:fs');
require('dotenv').config({ path: ['.env.local', '.env'], quiet: true });
const publicCa = path.join(__dirname, '..', '.local', 'supabase-postgres-ca.crt');
if (!process.env.DATABASE_CA_CERT && fs.existsSync(publicCa)) process.env.DATABASE_CA_CERT = fs.readFileSync(publicCa, 'utf8');
const jiti = require('jiti')(__filename, {
  alias: { '@': path.join(__dirname, '..', 'src'),
    'server-only': require.resolve('next/dist/compiled/server-only/empty.js') },
});

async function main() {
  const { CandidateIdSchema } = jiti('../src/domain/opportunity/assessment.ts');
  const { refreshProfiles } = jiti('../src/lib/profiles.ts');
  const { scheduleAssessments, runAssessmentJobs } = jiti('../src/lib/applicant-assessments.ts');
  const args = process.argv.slice(2);
  const ids = args.filter((arg) => /^\d+$/.test(arg));
  const candidateFlag = args.find((arg) => arg.startsWith('--candidate='));
  const candidate = candidateFlag ? CandidateIdSchema.parse(candidateFlag.split('=')[1]) : undefined;
  await refreshProfiles(args.includes('--refresh-profiles'));
  const keys = await scheduleAssessments({ ids: ids.length ? ids : undefined, candidate, force: args.includes('--force') });
  const result = await runAssessmentJobs(24, keys.length ? keys : undefined);
  console.log(JSON.stringify({ queued: keys.length, ...result }));
  if (result.failed) process.exitCode = 1;
}
main().then(() => process.exit(process.exitCode || 0)).catch((error) => {
  console.error('Assessment run failed:', error.code || error.name);
  process.exit(1);
});
