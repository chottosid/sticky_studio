import { PDFParse } from 'pdf-parse';
import {
  ExtractionRequestSchema,
  type ExtractionSource,
} from '@/domain/opportunity/schema';

export const MAX_EXTRACTION_BYTES = 10 * 1024 * 1024;
const MAX_SOURCE_TEXT_CHARS = 120_000;

export type PreparedSource = {
  id: string;
  label: string;
  text?: string;
  imageDataUri?: string;
  sourceUrl?: string;
};

function decodeDataUri(dataUri: string): { mimeType: string; bytes: Buffer } {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUri);
  if (!match) throw new Error('A file has an invalid data URI.');

  return {
    mimeType: match[1].toLowerCase(),
    bytes: Buffer.from(match[2], 'base64'),
  };
}

export function extractionSourceSize(source: ExtractionSource): number {
  if (source.kind === 'text') return Buffer.byteLength(source.text, 'utf8');
  return decodeDataUri(source.dataUri).bytes.length;
}

async function extractPdfText(bytes: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const result = await parser.getText();
    return result.text.slice(0, MAX_SOURCE_TEXT_CHARS);
  } finally {
    await parser.destroy();
  }
}

export async function prepareExtractionSources(input: unknown): Promise<{
  originalSources: ExtractionSource[];
  preparedSources: PreparedSource[];
}> {
  const { sources } = ExtractionRequestSchema.parse(input);
  const totalBytes = sources.reduce((total, source) => total + extractionSourceSize(source), 0);

  if (totalBytes > MAX_EXTRACTION_BYTES) {
    throw new Error('The combined source size must be 10 MB or less.');
  }

  const preparedSources: PreparedSource[] = [];
  for (const source of sources) {
    if (source.kind === 'text') {
      preparedSources.push({
        id: source.id,
        label: source.name,
        text: source.text.slice(0, MAX_SOURCE_TEXT_CHARS),
      });
      continue;
    }

    const decoded = decodeDataUri(source.dataUri);
    if (source.kind === 'image') {
      if (!decoded.mimeType.startsWith('image/')) {
        throw new Error(`${source.name} is not a supported image.`);
      }
      preparedSources.push({ id: source.id, label: source.name, imageDataUri: source.dataUri });
      continue;
    }

    if (decoded.mimeType !== 'application/pdf') {
      throw new Error(`${source.name} is not a PDF.`);
    }
    const text = await extractPdfText(decoded.bytes);
    if (!text.trim()) {
      throw new Error(`${source.name} contains no extractable text. Try uploading screenshots of its pages.`);
    }
    preparedSources.push({ id: source.id, label: source.name, text });
  }

  return { originalSources: sources, preparedSources };
}

export function extractHttpUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>()\[\]"']+/gi) || [];
  const normalized = matches.map((value) => value.replace(/[.,;:!?]+$/, ''));
  return Array.from(new Set(normalized));
}

export function urlsFromPreparedSources(sources: PreparedSource[]): string[] {
  return Array.from(new Set(sources.flatMap((source) => extractHttpUrls(source.text || ''))));
}

