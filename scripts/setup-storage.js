const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const BUCKET = 'opportunity-sources';

async function ensureBucket() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.storage.getBucket(BUCKET);
  if (data) {
    if (data.public) throw new Error(`Bucket ${BUCKET} exists but is public; make it private before continuing.`);
    console.log(`Private bucket already exists: ${BUCKET}`);
    return;
  }
  if (error && !/not found/i.test(error.message)) throw error;

  const { error: createError } = await client.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/*', 'application/pdf', 'text/plain'],
  });
  if (createError) throw createError;
  console.log(`Created private bucket: ${BUCKET}`);
}

if (require.main === module) {
  ensureBucket().catch((error) => {
    console.error('Storage setup failed:', error);
    process.exitCode = 1;
  });
}

module.exports = { ensureBucket, BUCKET };

