import { Pool } from 'pg';

// Load environment variables
if (typeof window === 'undefined') {
  // Only load dotenv on server side
  require('dotenv').config();
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export async function query(text: string, params?: any[]) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function getClient() {
  return await pool.connect();
}

// Initialize database schema
export async function initDatabase() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS opportunities (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        details TEXT NOT NULL,
        deadline DATE,
        document_uri TEXT NOT NULL,
        document_type VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better query performance
    await query(`
      CREATE INDEX IF NOT EXISTS idx_opportunities_created_at ON opportunities(created_at DESC);
    `);
    
    await query(`
      CREATE INDEX IF NOT EXISTS idx_opportunities_deadline ON opportunities(deadline) WHERE deadline IS NOT NULL;
    `);
    
    await query(`
      CREATE INDEX IF NOT EXISTS idx_opportunities_name ON opportunities(name);
    `);
    
    await query(`
      CREATE INDEX IF NOT EXISTS idx_opportunities_search ON opportunities USING gin(to_tsvector('english', name || ' ' || details));
    `);
    
    console.log('Database schema initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}
