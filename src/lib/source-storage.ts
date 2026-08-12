import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { ExtractionSource, OpportunitySource } from '@/lib/types';

export const OPPORTUNITY_SOURCE_BUCKET = 'opportunity-sources';

function getStorageClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for source storage.');
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function sourceBody(source: ExtractionSource): { bytes: Buffer; mimeType: string } {
  if (source.kind === 'text') {
    return { bytes: Buffer.from(source.text, 'utf8'), mimeType: 'text/plain; charset=utf-8' };
  }

  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(source.dataUri);
  if (!match) throw new Error(`${source.name} has an invalid data URI.`);
  return { bytes: Buffer.from(match[2], 'base64'), mimeType: match[1] };
}

function safeFileName(name: string): string {
  const normalized = name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized.slice(0, 120) || 'source';
}

export type UploadedSource = {
  sourceType: 'upload' | 'pasted-text';
  originalName: string;
  mimeType: string;
  storagePath: string;
  sourceUrl: null;
};

export async function uploadOpportunitySources(sources: ExtractionSource[]): Promise<UploadedSource[]> {
  const client = getStorageClient();
  const groupId = crypto.randomUUID();
  const uploaded: UploadedSource[] = [];
  const totalBytes = sources.reduce((total, source) => total + sourceBody(source).bytes.length, 0);
  if (totalBytes > 10 * 1024 * 1024) {
    throw new Error('The combined source size must be 10 MB or less.');
  }

  try {
    for (const [index, source] of sources.entries()) {
      const { bytes, mimeType } = sourceBody(source);
      const originalName = source.kind === 'text' ? `${source.name}.txt` : source.name;
      const storagePath = `${groupId}/${index + 1}-${safeFileName(originalName)}`;
      const { error } = await client.storage
        .from(OPPORTUNITY_SOURCE_BUCKET)
        .upload(storagePath, bytes, { contentType: mimeType, upsert: false });

      if (error) throw new Error(`Could not upload ${originalName}: ${error.message}`);
      uploaded.push({
        sourceType: source.kind === 'text' ? 'pasted-text' : 'upload',
        originalName,
        mimeType,
        storagePath,
        sourceUrl: null,
      });
    }
    return uploaded;
  } catch (error) {
    await removeStoredSources(uploaded.map((source) => source.storagePath));
    throw error;
  }
}

export async function removeStoredSources(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const client = getStorageClient();
  const { error } = await client.storage.from(OPPORTUNITY_SOURCE_BUCKET).remove(paths);
  if (error) console.error('Could not remove source objects:', error.message);
}

export async function attachSignedUrls(sources: OpportunitySource[]): Promise<OpportunitySource[]> {
  const paths = sources.flatMap((source) => source.storagePath ? [source.storagePath] : []);
  if (paths.length === 0) return sources;

  try {
    const client = getStorageClient();
    const { data, error } = await client.storage
      .from(OPPORTUNITY_SOURCE_BUCKET)
      .createSignedUrls(paths, 60 * 10);
    if (error) throw error;
    const signedByPath = new Map(data.map((item) => [item.path, item.signedUrl]));
    return sources.map((source) => ({
      ...source,
      signedUrl: source.storagePath ? signedByPath.get(source.storagePath) || null : source.sourceUrl,
    }));
  } catch (error) {
    console.error('Could not create signed source URLs:', error);
    return sources;
  }
}
