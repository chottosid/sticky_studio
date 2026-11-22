import 'server-only';
import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { Pool } from 'pg';
import type { QueryResult, QueryResultRow } from 'pg';

const databaseUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const local = databaseUrl && ['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname);
// pg connection-string SSL parameters override the ssl object when both are present.
for (const option of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'ssl']) databaseUrl?.searchParams.delete(option);
const localSupabaseCa = '.local/supabase-postgres-ca.crt';
const ca = process.env.DATABASE_CA_CERT || (existsSync(localSupabaseCa) ? readFileSync(localSupabaseCa, 'utf8') : undefined);

const pool = new Pool({
  connectionString: databaseUrl?.href,
  ssl: local ? false : { rejectUnauthorized: true, ...(ca ? { ca: ca.replace(/\\n/g, '\n') } : {}) },
  connectionTimeoutMillis: 10_000,
  // Each serverless instance keeps its own pool; a small one keeps warm instances
  // from exhausting the Supabase pooler's client limit.
  max: 3,
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export async function query<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<QueryResult<Row>> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  
  const client = await pool.connect();
  try {
    const result = await client.query<Row>(text, [...params]);
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
