import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { PDFParse } from 'pdf-parse';
import type { PreparedSource } from './input';

const MAX_PAGES = 4;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 7_000;
const MAX_REDIRECTS = 3;
const RELEVANT_LINK_WORDS = [
  'apply', 'application', 'career', 'department', 'funding', 'internship', 'job',
  'lab', 'people', 'position', 'professor', 'program', 'research', 'scholarship', 'team',
];

type FetchedPage = PreparedSource & { links: string[]; hostname: string };

function isPrivateIpv4(address: string): boolean {
  const [a, b] = address.split('.').map(Number);
  return a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a === 0;
}

export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) return isPrivateIpv4(address);
  const normalized = address.toLowerCase();
  return normalized === '::1'
    || normalized === '::'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb')
    || normalized.startsWith('::ffff:127.')
    || normalized.startsWith('::ffff:10.')
    || normalized.startsWith('::ffff:192.168.');
}

async function validatePublicUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP(S) source URLs are supported.');
  }
  if (url.username || url.password) throw new Error('Source URLs cannot contain credentials.');
  if (url.hostname === 'localhost' || url.hostname.endsWith('.local')) {
    throw new Error('Local source URLs are not allowed.');
  }

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Private network source URLs are not allowed.');
  }
  return url;
}

async function readLimitedBody(response: Response): Promise<Uint8Array> {
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

async function pdfText(bytes: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data: bytes });
  try {
    return (await parser.getText()).text.slice(0, 120_000);
  } finally {
    await parser.destroy();
  }
}

async function fetchPage(value: string, sourceId: string): Promise<FetchedPage> {
  let url = await validatePublicUrl(value);
  let response: Response | null = null;

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    response = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'StickyStudio/1.0 opportunity-enrichment' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirect === MAX_REDIRECTS) throw new Error('Too many source redirects.');
      url = await validatePublicUrl(new URL(location, url).toString());
      continue;
    }
    break;
  }

  if (!response?.ok) throw new Error(`Source returned HTTP ${response?.status || 'error'}.`);
  const bytes = await readLimitedBody(response);
  const contentType = (response.headers.get('content-type') || '').toLowerCase();

  if (contentType.includes('application/pdf')) {
    return {
      id: sourceId,
      label: url.toString(),
      sourceUrl: url.toString(),
      hostname: url.hostname,
      text: await pdfText(bytes),
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
