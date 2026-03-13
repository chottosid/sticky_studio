import 'dotenv/config';
import { query } from '../src/lib/db';

type OpportunityCategory = 'job' | 'internship' | 'contest' | 'higher-study';

const categoryKeywords: Record<OpportunityCategory, string[]> {
  job: ['job', 'employment', 'position', 'career', 'hiring', 'full-time', 'role', 'engineer', 'developer', 'manager', 'director', 'analyst', 'work'],
  internship: ['internship', 'summer', 'co-op', 'student', 'trainee', 'fellow'],
  contest: ['contest', 'competition', 'hackathon', 'challenge', 'award', 'prize', 'winner'],
  higher-study: ['phd', 'doctoral', 'master', 'msc', 'ma', 'mba', 'scholarship', 'fellowship', 'research', 'university', 'graduate', 'postdoc', 'study'],
};

function categorizeByKeywords(name: string, details: string): OpportunityCategory {
  const text = `${name} ${details}`.toLowerCase();

  const categories: OpportunityCategory[] = ['job', 'internship', 'contest', 'higher-study'];

  for (const cat of categories) {
    const keywords = categoryKeywords[cat];
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return cat;
      }
    }
  }

  return 'job'; // Default
}

async function main() {
  console.log('🔍 Fetching ALL opportunities to recategorize...\n');

  const result = await query(`
    SELECT id, name, details, category
    FROM opportunities
    ORDER BY id
  `);

  const opportunities = result.rows;

  if (opportunities.length === 0) {
    console.log('No opportunities found!');
    return;
  }

  console.log(`📋 Found ${opportunities.length} opportunities\n`);
  console.log('Categorizing using keyword matching (no LLM needed)...\n');

  const stats = {
    total: opportunities.length,
    updated: 0,
    unchanged: 0,
    failed: 0,
    byCategory: { job: 0, internship: 0, contest: 0, 'higher-study': 0 }
  };

  for (let i = 0; i < opportunities.length; i++) {
    const opp = opportunities[i];
    const progress = `[${i + 1}/${opportunities.length}]`;

    process.stdout.write(`${progress} [${opp.id}] "${opp.name.substring(0, 40)}..." `);

    const newCategory = categorizeByKeywords(opp.name, opp.details);
    stats.byCategory[newCategory]++;

    if (newCategory !== opp.category) {
      process.stdout.write(`(${opp.category} → ${newCategory})`);
      try {
        await query(`UPDATE opportunities SET category = $1 WHERE id = $2`, [newCategory, opp.id]);
        console.log(' ✅');
        stats.updated++;
      } catch (error) {
        console.log(' ❌');
        stats.failed++;
      }
    } else {
      process.stdout.write(`(${opp.category} ✓)\n`);
      stats.unchanged++;
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('📊 Summary:');
  console.log('═'.repeat(50));
  console.log(`   Total processed: ${stats.total}`);
  console.log(`   ✅ Updated: ${stats.updated}`);
  console.log(`   ✓ Unchanged: ${stats.unchanged}`);
  console.log(`   ❌ Failed: ${stats.failed}`);
  console.log('─'.repeat(50));
  console.log('New Distribution:');
  console.log(`   job: ${stats.byCategory.job}`);
  console.log(`   internship: ${stats.byCategory.internship}`);
  console.log(`   contest: ${stats.byCategory.contest}`);
  console.log(`   higher-study: ${stats.byCategory['higher-study']}`);
  console.log('═'.repeat(50));
}

main()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
