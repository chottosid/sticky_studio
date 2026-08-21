import { createHash } from 'node:crypto';
import type { DuplicateMatch, ExtractionSource, OpportunityInput } from '@/domain/opportunity/schema';
import { canonicalizeUrl, extractUrls } from './duplicate-normalization';
import { sourceContentSha256 } from './source-payload';

const CONFIRMATION_SECONDS = 10 * 60;

export type DuplicateInput = {
  opportunities: OpportunityInput[];
  sources: ExtractionSource[];
  discoveredSourceUrls: string[];
};

function duplicateFingerprint(input: DuplicateInput): string {
  const sourceHashes = input.sources.map(sourceContentSha256).sort();
  const urls = Array.from(new Set([
    ...input.discoveredSourceUrls,
    ...input.opportunities.flatMap((opportunity) => opportunity.applicationUrl ? [opportunity.applicationUrl] : []),
    ...input.sources.flatMap((source) => source.kind === 'text' ? extractUrls(source.text) : []),
  ].map(canonicalizeUrl).filter((url): url is string => Boolean(url)))).sort();
  return createHash('sha256').update(JSON.stringify({
    opportunities: input.opportunities,
    sourceHashes,
    urls,
  })).digest('hex');
}

async function hmac(value: string): Promise<string> {
  const secret = process.env.SESSION_SECRET || process.env.APP_USER_PASSWORD;
  if (!secret) throw new Error('SESSION_SECRET is not configured.');
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createDuplicateConfirmationToken(input: DuplicateInput, matches: DuplicateMatch[]): Promise<string> {
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    expiresAt: Math.floor(Date.now() / 1_000) + CONFIRMATION_SECONDS,
    fingerprint: duplicateFingerprint(input),
    matchIds: matches.map((match) => match.id).sort(),
  })).toString('base64url');
  return `${payload}.${await hmac(payload)}`;
}

export async function verifyDuplicateConfirmationToken(input: DuplicateInput, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const separator = token.lastIndexOf('.');
  if (separator < 0) return false;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = await hmac(payload);
  if (signature.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < signature.length; index += 1) {
    difference |= signature.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  if (difference !== 0) return false;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      version?: number; expiresAt?: number; fingerprint?: string;
    };
    return value.version === 1
      && typeof value.expiresAt === 'number'
      && value.expiresAt > Date.now() / 1_000
      && value.fingerprint === duplicateFingerprint(input);
  } catch {
    return false;
  }
}
