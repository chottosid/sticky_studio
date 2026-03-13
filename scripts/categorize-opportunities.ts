import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { query } from '../src/lib/db';

// Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const MODEL = 'gemma-3-27b-it';

type OpportunityCategory = 'job' | 'internship' | 'contest' | 'higher-study';

async function categorizeOpportunity(name: string, details: string): Promise<OpportunityCategory> {
  const prompt = `Categorize this opportunity into exactly one category:
- job: Full-time employment, career positions
- internship: Student internships, co-ops
- contest: Competitions, hackathons, awards
- higher-study: PhD positions, masters programs, scholarships, fellowships

Return ONLY the category name, nothing else.

Name: ${name}
Details: ${details}`;

  const validCategories: OpportunityCategory[] = ['job', 'internship', 'contest', 'higher-study'];

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
    });

    const category = response.text?.trim().toLowerCase() as OpportunityCategory;
    if (validCategories.includes(category)) {
      return category;
    }
    return 'job';
  } catch (error) {
    console.error('Gemma error:', error);
    return 'job';
  }
}

async function main() {
  console.log('Fetching all opportunities...\n');

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

  console.log(`Found ${opportunities.length} opportunities to categorize\n`);
  console.log('Starting Gemma-based categorization...\n');

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

    const category = await categorizeOpportunity(opp.name, opp.details);
    stats.byCategory[category]++;

    if (category !== opp.category) {
      process.stdout.write(` (${opp.category} -> ${category})`);
      try {
        await query(`UPDATE opportunities SET category = $1 WHERE id = $2`, [category, opp.id]);
        console.log(' OK');
        stats.updated++;
      } catch (error) {
        console.log(' DB error');
        stats.failed++;
      }
    } else {
      console.log(` (${opp.category} unchanged)`);
      stats.unchanged++;
    }

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n' + '='.repeat(50));
  console.log('Summary:');
  console.log('='.repeat(50));
  console.log(`   Total processed: ${stats.total}`);
  console.log(`   Updated: ${stats.updated}`);
  console.log(`   Unchanged: ${stats.unchanged}`);
  console.log(`   Failed: ${stats.failed}`);
  console.log('-'.repeat(50));
  console.log('Distribution:');
  console.log(`   job: ${stats.byCategory.job}`);
  console.log(`   internship: ${stats.byCategory.internship}`);
  console.log(`   contest: ${stats.byCategory.contest}`);
  console.log(`   higher-study: ${stats.byCategory['higher-study']}`);
  console.log('='.repeat(50));
}

main()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
