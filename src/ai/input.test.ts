import { describe, expect, it } from 'vitest';
import { extractHttpUrls, prepareExtractionSources } from './input';

function minimalTextPdf(text: string): string {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii').toString('base64');
}

describe('extraction input', () => {
  it('preserves Unicode pasted text without browser base64 conversion', async () => {
    const result = await prepareExtractionSources({
      sources: [{
        id: 'source-1', kind: 'text', name: 'Pasted text', mimeType: 'text/plain',
        text: 'বাংলা opportunity text',
      }],
    });
    expect(result.preparedSources[0].text).toBe('বাংলা opportunity text');
  });

  it('extracts and de-duplicates HTTP links', () => {
    expect(extractHttpUrls('Apply at https://example.com/apply. More: https://example.com/apply')).toEqual([
      'https://example.com/apply',
    ]);
  });

  it('extracts PDF text in the Node runtime', async () => {
    const result = await prepareExtractionSources({
      sources: [{
        id: 'source-pdf',
        kind: 'pdf',
        name: 'opportunity.pdf',
        mimeType: 'application/pdf',
        dataUri: `data:application/pdf;base64,${minimalTextPdf('PDF opportunity')}`,
      }],
    });

    expect(result.preparedSources[0].text).toContain('PDF opportunity');
  });
});
