import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, fetch } from 'undici';
import type { PreparedSource } from './input';
import { extractPdfText } from './pdf';

const MAX_PAGES = 4;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 7_000;
const MAX_REDIRECTS = 3;
const RELEVANT_LINK_WORDS = [
  'apply', 'application', 'career', 'department', 'funding', 'internship', 'job',
  'lab', 'people', 'position', 'professor', 'program', 'research', 'scholarship', 'team',
];

type FetchedPage = PreparedSource & { links: string[]; hostname: string };

export function isPrivateAddress(address: string): boolean {
  return !ipaddr.isValid(address) || ipaddr.process(address).range() !== 'unicast';
}

async function validatePublicUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP(S) source URLs are supported.');
  }
  if (url.username || url.password) throw new Error('Source URLs cannot contain credentials.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.local')) {
    throw new Error('Local source URLs are not allowed.');
  }

  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Private network source URLs are not allowed.');
  }
  return { url, addresses };
}

async function readLimitedBody(response: Awaited<ReturnType<typeof fetch>>): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_RESPONSE_BYTES) throw new Error('Source page is too large.');
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('Source page is too large.');
    }
    chunks.push(value);
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim().slice(0, 120_000);
}

function linksFromHtml(html: string, baseUrl: URL): string[] {
  const links: string[] = [];
  const pattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      const link = new URL(match[1], baseUrl);
      if (link.protocol === 'http:' || link.protocol === 'https:') {
        link.hash = '';
        links.push(link.toString());
      }
    } catch {
      // Ignore malformed links from the page.
    }
  }
  return Array.from(new Set(links));
}

export async function fetchPage(value: string, sourceId: string): Promise<FetchedPage> {
  let url = new URL(value);
  let bytes: Uint8Array = new Uint8Array();
  let contentType = '';

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const { addresses } = await validatePublicUrl(url.href);
    const first = addresses[0];
    const dispatcher = new Agent({
      connect: {
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, addresses);
          else callback(null, first.address, first.family);
        },
      },
    });
    try {
      const response = await fetch(url, {
        dispatcher,
        redirect: 'manual',
        headers: { 'User-Agent': 'StickyStudio/1.0 opportunity-enrichment' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirect === MAX_REDIRECTS) throw new Error('Too many source redirects.');
        url = new URL(location, url);
        continue;
      }
      if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
      bytes = await readLimitedBody(response);
      contentType = (response.headers.get('content-type') || '').toLowerCase();
      break;
    } finally {
      await dispatcher.destroy();
    }
  }

  if (contentType.includes('application/pdf')) {
    return {
      id: sourceId,
      label: url.toString(),
      sourceUrl: url.toString(),
      hostname: url.hostname,
      text: await extractPdfText(bytes),
      links: [],
    };
  }

  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
    throw new Error('Source is not HTML, text, or PDF.');
  }

  const decoded = new TextDecoder().decode(bytes);
  return {
    id: sourceId,
    label: url.toString(),
    sourceUrl: url.toString(),
    hostname: url.hostname,
    text: contentType.includes('text/html') ? htmlToText(decoded) : decoded.slice(0, 120_000),
    links: contentType.includes('text/html') ? linksFromHtml(decoded, url) : [],
  };
}

function linkScore(value: string): number {
  const lower = value.toLowerCase();
  return RELEVANT_LINK_WORDS.reduce((score, word) => score + (lower.includes(word) ? 1 : 0), 0);
}

export async function enrichFromUrls(seedUrls: string[]): Promise<{
  sources: PreparedSource[];
  warnings: string[];
}> {
  const sources: PreparedSource[] = [];
  const warnings: string[] = [];
  const visited = new Set<string>();
  const directPages: FetchedPage[] = [];

  for (const seed of Array.from(new Set(seedUrls)).slice(0, MAX_PAGES)) {
    try {
      const normalized = new URL(seed).toString();
      if (visited.has(normalized)) continue;
      const page = await fetchPage(normalized, `url-${sources.length + 1}`);
      visited.add(page.sourceUrl!);
      directPages.push(page);
      sources.push(page);
    } catch (error) {
      warnings.push(`Could not inspect ${seed}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  const candidates = directPages
    .flatMap((page) => page.links
      .filter((link) => {
        try { return new URL(link).hostname === page.hostname; } catch { return false; }
      })
      .map((link) => ({ link, score: linkScore(link) })))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  for (const { link } of candidates) {
    if (sources.length >= MAX_PAGES) break;
    if (visited.has(link)) continue;
    try {
      const page = await fetchPage(link, `url-${sources.length + 1}`);
      visited.add(page.sourceUrl!);
      sources.push(page);
    } catch (error) {
      warnings.push(`Could not inspect ${link}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return { sources, warnings };
}
