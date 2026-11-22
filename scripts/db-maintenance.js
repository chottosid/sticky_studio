const { createHash, randomUUID } = require('node:crypto');
const { mkdir, open } = require('node:fs/promises');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');
const { DbCommandError, privateDirectory, withDatabase, readOnly, reportError } = require('./db-access');
const { BUCKET } = require('./setup-storage');

async function audit() {
  const report = await withDatabase('DATABASE_URL', (client) => readOnly(client, async () => {
    const { rows: tables } = await client.query(`
      SELECT relname AS table_name, n_live_tup AS estimated_rows,
             pg_table_size(relid) AS data_bytes, pg_indexes_size(relid) AS index_bytes
      FROM pg_stat_user_tables WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(relid) DESC, relname`);
    const { rows: indexes } = await client.query(`
      SELECT relname AS table_name, indexrelname AS index_name, idx_scan AS scans,
             pg_relation_size(indexrelid) AS bytes
      FROM pg_stat_user_indexes WHERE schemaname = 'public'
      ORDER BY pg_relation_size(indexrelid) DESC, indexrelname`);
    const { rows: [legacyAttachments] } = await client.query(`
      SELECT count(*) AS rows, coalesce(sum(octet_length(o.document_uri)), 0) AS raw_bytes,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.opportunity_sources s
          WHERE s.opportunity_id = o.id AND s.storage_path IS NOT NULL)) AS rows_with_stored_source
      FROM public.opportunities o WHERE coalesce(o.document_uri, '') <> ''`);
    return { tables, indexes, legacyAttachments };
  }));
  console.log(JSON.stringify(report, null, 2));
}

function attachmentHash(uri) {
  const data = /^data:[^;,]+;base64,([\s\S]+)$/i.exec(uri)?.[1]?.replace(/\s/g, '');
  if (!data || !/^[a-z0-9+/]+={0,2}$/i.test(data)) return null;
  const bytes = Buffer.from(data, 'base64');
  if (bytes.toString('base64').replace(/=+$/, '') !== data.replace(/=+$/, '')) return null;
  return hash(bytes);
}

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function verifyCopies(rows, sources, storage) {
  const verified = [];
  const skipped = [];
  for (const row of rows) {
    const checksum = attachmentHash(row.document_uri);
    if (!checksum) {
      skipped.push({ opportunityId: row.id, reason: 'Unsupported or invalid legacy data URI' });
      continue;
    }
    let match;
    for (const source of sources) {
      if (source.opportunity_id !== row.id) continue;
      const { data, error } = await storage.download(source.storage_path);
      if (!error && data && hash(Buffer.from(await data.arrayBuffer())) === checksum) {
        match = source;
        break;
      }
    }
    if (match) verified.push({ ...row, sourceId: match.id, storagePath: match.storage_path, sha256: checksum });
    else skipped.push({ opportunityId: row.id, reason: 'No downloadable, byte-identical linked file' });
  }
  return { verified, skipped };
}

async function saveBackup(rows) {
  await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
  const filename = `legacy-attachments-${randomUUID()}.json`;
  const file = await open(path.join(privateDirectory, filename), 'wx', 0o600);
  try {
    await file.writeFile(JSON.stringify(rows, null, 2));
    await file.sync();
  } finally {
    await file.close();
  }
  const backup = `.local/${filename}`;
  console.error(`Recovery backup written to ${backup}`);
  return backup;
}

function verifyStorageProject(database, storage) {
  const postgresProject = database.hostname.endsWith('.pooler.supabase.com')
    ? /^[^.]+\.([^.]+)$/.exec(database.username)?.[1] : /^db\.([^.]+)\.supabase\.co$/.exec(database.hostname)?.[1];
  const storageProject = /^([^.]+)\.supabase\.co$/.exec(new URL(storage).hostname)?.[1];
  if (postgresProject && storageProject && postgresProject !== storageProject) {
    throw new DbCommandError('The PostgreSQL connection and Supabase Storage URL point to different projects.');
  }
}

async function retireLegacy(apply) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new DbCommandError('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to verify stored attachments.');
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { verified, skipped } = await withDatabase('DATABASE_URL', async (client, database) => {
    verifyStorageProject(database, url);
    const { data: bucket, error } = await supabase.storage.getBucket(BUCKET);
    if (error || !bucket || bucket.public) throw new DbCommandError('Could not verify the private opportunity-sources bucket.');
    const { rows, sources } = await readOnly(client, async () => {
      const { rows } = await client.query(`SELECT id, document_uri, document_type FROM public.opportunities
        WHERE coalesce(document_uri, '') <> '' ORDER BY id`);
      const { rows: sources } = await client.query(`SELECT id, opportunity_id, storage_path FROM public.opportunity_sources
        WHERE opportunity_id = ANY($1::int[]) AND storage_path IS NOT NULL ORDER BY id`, [rows.map((row) => row.id)]);
      return { rows, sources };
    });
    return verifyCopies(rows, sources, supabase.storage.from(BUCKET));
  });

  const report = { verified: verified.map((row) => row.id), skipped, cleared: 0, backup: null };
  if (apply && verified.length) {
    report.backup = await saveBackup(verified);
    report.cleared = await withDatabase('DATABASE_URL', async (client) => {
      await client.query('BEGIN');
      try {
        for (const row of verified) {
          const result = await client.query(`
            UPDATE public.opportunities o SET document_uri = NULL, document_type = NULL
            WHERE o.id = $1 AND o.document_uri = $2 AND o.document_type IS NOT DISTINCT FROM $3
              AND EXISTS (SELECT 1 FROM public.opportunity_sources s
                WHERE s.id = $4 AND s.opportunity_id = o.id AND s.storage_path = $5 FOR SHARE)`,
          [row.id, row.document_uri, row.document_type, row.sourceId, row.storagePath]);
          if (result.rowCount !== 1) throw new DbCommandError(`Opportunity ${row.id} changed since verification. Re-run the preview.`);
        }
        await client.query('COMMIT');
        return verified.length;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    });
  }
  console.log(JSON.stringify(report, null, 2));
}

async function main() {
  const [command, flag, ...extra] = process.argv.slice(2);
  if (command === 'audit' && flag === undefined) return audit();
  if (command === 'retire' && (flag === undefined || flag === '--apply') && !extra.length) {
    return retireLegacy(flag === '--apply');
  }
  throw new DbCommandError('Use npm run db:audit or npm run db:retire-legacy-sources [-- --apply].');
}

main().catch(reportError);
