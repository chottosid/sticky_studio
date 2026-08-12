import type { ExtractionSource } from '@/lib/types';

export function sourcePayload(source: ExtractionSource): { bytes: Buffer; mimeType: string } {
  if (source.kind === 'text') {
    return { bytes: Buffer.from(source.text, 'utf8'), mimeType: 'text/plain' };
  }

  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(source.dataUri);
  if (!match) throw new Error(`${source.name} has an invalid data URI.`);
  return { bytes: Buffer.from(match[2], 'base64'), mimeType: match[1] };
}
