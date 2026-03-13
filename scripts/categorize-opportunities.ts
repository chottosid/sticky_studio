import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { query } from '../src/lib/db';

// Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Models to try in order (primary -> fallbacks)
const MODELS = [
  'gemini-3-flash',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

type OpportunityCategory = 'job' | 'internship' | 'contest' | 'higher-study';

async function categorizeOpportunity(name: string, details: string): Promise<OpportunityCategory> {
  const prompt = `You are a classifier. Categorize the opportunity into exactly one of these categories:
- "job": Full-time employment, career positions
- "internship": Student internships, co-ops
- "contest": Competitions, hackathons, awards
- "higher-study": PhD, masters, scholarships, fellowships, research positions

Return ONLY the category name (job/internship/contest/higher-study), nothing else.

Name: ${name}

Details: ${details}

Category:`;

  const validCategories: OpportunityCategory[] = ['job', 'internship', 'contest', 'higher-study'];

  // Try each model in sequence
  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 20 },
      });

      const category = result.response.text().trim().toLowerCase() as OpportunityCategory;

      if (validCategories.includes(category)) {
        return category;
      }
      return 'job';
    } catch (error) {
      const isRateLimit = (error as { status?: number })?.status === 429;
      if (isRateLimit) {
        console.warn(`Model ${modelName} rate limited, trying next...`);
        continue;
      }
      console.error(`Model ${modelName} failed:`, error);
    }
  }

  console.error('All models failed, defaulting to "job"');
  return 'job';
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
  console.log('Starting Gemini-based categorization...\n');

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
    await new Promise(resolve => setTimeout(resolve, 200));
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
