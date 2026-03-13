import 'dotenv/config';
import OpenAI from 'openai';
import { query } from '../src/lib/db';

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

const MODEL = 'openrouter/healer-alpha';

type OpportunityCategory = 'job' | 'internship' | 'contest' | 'higher-study';

async function categorizeOpportunity(name: string, details: string): Promise<OpportunityCategory> {
  const system = `You are a classifier. Categorize the opportunity into exactly one of these categories:
- "job": Full-time employment, career positions
- "internship": Student internships, co-ops,- "contest": Competitions, hackathons, awards
- "higher-study": PhD, masters, scholarships, fellowships, research positions

Return ONLY the category name (job/internship/contest/higher-study), nothing else.`;

  try {
    const res = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Name: ${name}\n\nDetails: ${details}\n\nCategory:` },
      ],
      temperature: 0,
      max_tokens: 20,
    });

    const category = res.choices[0]?.message?.content?.trim().toLowerCase() as OpportunityCategory;
    const validCategories: OpportunityCategory[] = ['job', 'internship', 'contest', 'higher-study'];

    if (validCategories.includes(category)) {
      return category;
    }
    return 'job';
  } catch (error) {
    console.error('LLM error:', error);
    return 'job';
  }
}

async function main() {
  console.log('🔍 Fetching all opportunities...\n');

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

  console.log(`📋 Found ${opportunities.length} opportunities to categorize\n`);
  console.log('Starting LLM-based categorization...\n');

  const stats = {
    total: opportunities.length,
    updated: 0,
    unchanged: 0,
    failed: 0,
    errors: 0,
    byCategory: { job: 0, internship: 0, contest: 0, 'higher-study': 0 }
  };

  for (let i = 0; i < opportunities.length; i++) {
    const opp = opportunities[i];
    const progress = `[${i + 1}/${opportunities.length}]`;

    process.stdout.write(`${progress} [${opp.id}] "${opp.name.substring(0, 40)}..." `);

    const category = await categorizeOpportunity(opp.name, opp.details);
    stats.byCategory[category]++;

    if (category !== opp.category) {
      process.stdout.write(` (${opp.category} → ${category})`);
      try {
        await query(`UPDATE opportunities SET category = $1 WHERE id = $2`, [category, opp.id]);
        console.log(' ✅');
        stats.updated++;
      } catch (error) {
        console.log(' ❌ DB error');
        stats.failed++;
      }
    } else {
      console.log(` (${opp.category} ✓)`);
      stats.unchanged++;
    }

    // Rate limiting delay
    await new Promise(resolve => setTimeout(resolve, 500));
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
