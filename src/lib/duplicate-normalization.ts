const TRACKING_PARAMETERS = new Set([
  'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'ref_src', 'source',
]);

function canonicalDoi(url: URL): string | null {
  let doi: string | null = null;
  if (url.hostname === 'doi.org' || url.hostname === 'dx.doi.org') {
    doi = url.pathname.slice(1);
  } else {
    const match = /\/doi\/(?:pdf|abs|full|epdf)?\/?(10\.\d{4,9}\/[^?#]+)/i.exec(url.pathname);
    doi = match?.[1] || null;
  }
  if (!doi) return null;
  return `https://doi.org/${decodeURIComponent(doi).replace(/\.pdf$/i, '').toLowerCase()}`;
}

function canonicalArxiv(url: URL): string | null {
  if (!/(^|\.)arxiv\.org$/i.test(url.hostname)) return null;
  const match = /^\/(?:abs|pdf)\/([^/?#]+?)(?:\.pdf)?$/i.exec(url.pathname);
  return match ? `https://arxiv.org/abs/${match[1].toLowerCase()}` : null;
}

export function canonicalizeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.hash = '';

    const doi = canonicalDoi(url);
    if (doi) return doi;
    const arxiv = canonicalArxiv(url);
    if (arxiv) return arxiv;

    for (const key of Array.from(url.searchParams.keys())) {
      if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMETERS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
      url.port = '';
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeComparable(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(?:dr|prof|professor)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function extractUrls(value: string): string[] {
  const matches = value.match(/https?:\/\/[^\s<>()\[\]"']+/gi) || [];
  return Array.from(new Set(matches
    .map((url) => url.replace(/[.,;:!?]+$/, ''))
    .map(canonicalizeUrl)
    .filter((url): url is string => Boolean(url))));
}
