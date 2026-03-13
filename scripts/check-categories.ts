import 'dotenv/config';
import { query } from '../src/lib/db';

async function main() {
  console.log('📊 Checking category distribution...\n');

  const result = await query(`
    SELECT category, COUNT(*) as count
    FROM opportunities
    GROUP BY category
    ORDER BY count DESC
  `);

  console.log('Category Distribution:');
  console.log('─'.repeat(30));

  for (const row of result.rows) {
    console.log(`  ${row.category || 'NULL'}: ${row.count}`);
  }

  console.log('─'.repeat(30));

  const total = await query(`SELECT COUNT(*) as total FROM opportunities`);
  console.log(`  Total: ${total.rows[0].total}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
