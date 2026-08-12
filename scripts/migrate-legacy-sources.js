const crypto = require('node:crypto');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const { ensureBucket, BUCKET } = require('./setup-storage');
require('dotenv').config();

function decodeDataUri(value) {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(value || '');
  if (!match) return null;
  return { mimeType: match[1], bytes: Buffer.from(match[2], 'base64') };
}

function extensionFor(mimeType) {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'text/plain') return 'txt';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/gif') return 'gif';
  return 'bin';
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  await ensureBucket();

  const storage = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    const result = await pool.query(`
      SELECT o.id, o.document_uri, o.document_type
      FROM opportunities o
      WHERE COALESCE(o.document_uri, '') <> ''
        AND NOT EXISTS (
          SELECT 1 FROM opportunity_sources s
          WHERE s.opportunity_id = o.id AND s.storage_path IS NOT NULL
        )
      ORDER BY o.id
    `);

    let migrated = 0;
    let skipped = 0;
    for (const row of result.rows) {
      const decoded = decodeDataUri(row.document_uri);
      if (!decoded) {
        console.warn(`Skipping opportunity ${row.id}: legacy source is not a base64 data URI.`);
        skipped += 1;
        continue;
      }

      const hash = crypto.createHash('sha256').update(decoded.bytes).digest('hex');
      const path = `legacy/${row.id}-${hash.slice(0, 16)}.${extensionFor(decoded.mimeType)}`;
      const { error: uploadError } = await storage.storage.from(BUCKET).upload(path, decoded.bytes, {
        contentType: decoded.mimeType,
        upsert: false,
      });
      if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) throw uploadError;

      const { data: downloaded, error: downloadError } = await storage.storage.from(BUCKET).download(path);
      if (downloadError) throw downloadError;
      const downloadedBytes = Buffer.from(await downloaded.arrayBuffer());
      const downloadedHash = crypto.createHash('sha256').update(downloadedBytes).digest('hex');
      if (downloadedHash !== hash) {
        await storage.storage.from(BUCKET).remove([path]);
        throw new Error(`Hash verification failed for opportunity ${row.id}.`);
      }

      await pool.query(
        `INSERT INTO opportunity_sources (
          opportunity_id, source_type, original_name, mime_type, storage_path
        ) VALUES ($1, 'upload', $2, $3, $4)`,
        [row.id, `legacy-source-${row.id}.${extensionFor(decoded.mimeType)}`, decoded.mimeType, path],
      );
      migrated += 1;
      console.log(`Migrated and verified opportunity ${row.id}.`);
    }

    console.log(`Legacy source migration complete: ${migrated} migrated, ${skipped} skipped.`);
    console.log('Legacy document_uri values were intentionally retained for rollback safety.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Legacy source migration failed:', error);
  process.exitCode = 1;
});

