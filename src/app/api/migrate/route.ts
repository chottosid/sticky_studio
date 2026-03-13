import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    // Add category column if it doesn't exist
    await query(`
      ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'job'
    `);

    // Create index for category
    await query(`
      CREATE INDEX IF NOT EXISTS idx_opportunities_category ON opportunities(category)
    `);

    // Update existing records to have default category
    await query(`
      UPDATE opportunities SET category = 'job' WHERE category IS NULL
    `);

    return NextResponse.json({
      success: true,
      message: 'Migration completed successfully. Category column added.'
    });
  } catch (error) {
    console.error('Migration failed:', error);
    return NextResponse.json({
      success: false,
      error: String(error)
    }, { status: 500 });
  }
}
