const path = require('node:path');
const { existsSync } = require('node:fs');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');
const privateDirectory = path.join(root, '.local');
const researchEnvFile = path.join(privateDirectory, 'sticky-research.env');
const supabaseCertificate = path.join(privateDirectory, 'supabase-postgres-ca.crt');

require('dotenv').config({
  path: [researchEnvFile, path.join(root, '.env.local'), path.join(root, '.env')],
  quiet: true,
});

class DbCommandError extends Error {}

function connectionUrl(variable) {
  const raw = process.env[variable];
  if (!raw) throw new DbCommandError(`${variable} is required.`);
  try {
    const url = new URL(raw);
    if (url.protocol === 'postgresql:' || url.protocol === 'postgres:') return url;
  } catch {
    // Return a diagnostic without including credentials from a malformed URL.
  }
  throw new DbCommandError(`${variable} must be a PostgreSQL connection URL.`);
}

async function withDatabase(variable, operation) {
  const url = connectionUrl(variable);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const hostedSupabase = url.hostname.endsWith('.pooler.supabase.com') || url.hostname.endsWith('.supabase.co');
  if (hostedSupabase && !url.searchParams.has('sslrootcert') && existsSync(supabaseCertificate)) {
    url.searchParams.set('sslmode', 'verify-full');
    url.searchParams.set('sslrootcert', supabaseCertificate);
  }
  const client = new Client({ connectionString: url.href, ssl: !loopback, connectionTimeoutMillis: 12_000 });
  try {
    await client.connect();
    return await operation(client, url);
  } finally {
    await client.end();
  }
}

async function readOnly(client, operation) {
  await client.query('BEGIN READ ONLY');
  try {
    await client.query('SET LOCAL statement_timeout = 10000');
    return await operation();
  } finally {
    await client.query('ROLLBACK');
  }
}

function reportError(error) {
  let reason = `PostgreSQL or local filesystem operation failed (${error.code || error.name}).`;
  if (error instanceof DbCommandError) reason = error.message;
  else if (/timeout/i.test(error.message)) reason = 'The connection or query timed out.';
  else if (['SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].includes(error.code)) {
    reason = 'TLS verification failed. Save the trusted Supabase project CA to .local/supabase-postgres-ca.crt or configure sslrootcert in the connection URL.';
  }
  console.error(reason);
  process.exitCode = 1;
}

module.exports = { DbCommandError, privateDirectory, researchEnvFile, withDatabase, readOnly, reportError };
