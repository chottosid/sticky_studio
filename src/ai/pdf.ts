import { DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';

function defineNodeCanvasGlobal(name: string, value: unknown): void {
  if (name in globalThis) return;
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}

async function loadPdfParse() {
  // PDF.js reads these globals while its module is evaluated, so install them
  // before dynamically importing pdf-parse.
  defineNodeCanvasGlobal('DOMMatrix', DOMMatrix);
  defineNodeCanvasGlobal('ImageData', ImageData);
  defineNodeCanvasGlobal('Path2D', Path2D);
  return import('pdf-parse');
}

export async function extractPdfText(bytes: Uint8Array, maxChars = 120_000): Promise<string> {
  const { PDFParse } = await loadPdfParse();
  const parser = new PDFParse({ data: bytes });
  try {
    return (await parser.getText()).text.slice(0, maxChars);
  } finally {
    await parser.destroy();
  }
}
