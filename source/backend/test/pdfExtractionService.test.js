import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  PdfExtractionError,
  createPdfExtractionService,
} from '../src/services/pdfExtractionService.js';

function createPdfBuffer(text = '') {
  const escapedText = text
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
  const content = text
    ? `BT\n/F1 18 Tf\n72 720 Td\n(${escapedText}) Tj\nET`
    : '';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  ];

  let document = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(document, 'latin1'));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(document, 'latin1');
  const xrefEntries = offsets
    .slice(1)
    .map((offset) => `${offset.toString().padStart(10, '0')} 00000 n `)
    .join('\n');
  document += [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    xrefEntries,
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    `startxref\n${xrefOffset}`,
    '%%EOF',
  ].join('\n');

  return Buffer.from(document, 'latin1');
}

const uploadedFile = {
  buffer: createPdfBuffer('BX53 Upright Microscope in Laboratory A'),
  originalName: 'microscope.pdf',
  mimeType: 'application/pdf',
  size: 1024,
};
const scannedFile = {
  ...uploadedFile,
  buffer: createPdfBuffer(),
};

describe('PDF extraction service', () => {
  test('extracts an embedded text layer locally without invoking OCR', async () => {
    const ocrService = {
      async extractText() {
        assert.fail('OCR must not run for a text-based PDF.');
      },
    };
    const service = createPdfExtractionService({ ocrService });

    const result = await service.extractText(uploadedFile);

    assert.equal(result.method, 'embedded');
    assert.match(result.text, /BX53 Upright Microscope/);
  });

  test('uses OCR when the PDF has no usable text layer', async () => {
    const calls = [];
    const service = createPdfExtractionService({
      ocrService: {
        async extractText(file) {
          calls.push(file);
          return '  BX53 Microscope\r\n\r\n  Model BX53  ';
        },
      },
    });

    const result = await service.extractText(scannedFile);

    assert.deepEqual(result, {
      text: 'BX53 Microscope\nModel BX53',
      method: 'ocr',
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].originalName, 'microscope.pdf');
    assert.equal(calls[0].buffer, scannedFile.buffer);
  });

  test('returns a clear scanned-PDF error when OCR is unavailable', async () => {
    const service = createPdfExtractionService({
    });

    await assert.rejects(
      service.extractText(scannedFile),
      (error) => {
        assert.ok(error instanceof PdfExtractionError);
        assert.equal(error.code, 'OCR_UNAVAILABLE');
        assert.match(error.message, /scanned.*OCR.*unavailable/i);
        return true;
      },
    );
  });

  test('maps unreadable PDFs to a safe extraction error without invoking OCR', async () => {
    const ocrService = {
      async extractText() {
        assert.fail('OCR must not run for a structurally unreadable PDF.');
      },
    };
    const service = createPdfExtractionService({
      parsePdfText: async () => {
        throw new Error('parser internals must not leak');
      },
      ocrService,
    });

    await assert.rejects(
      service.extractText(uploadedFile),
      (error) => {
        assert.ok(error instanceof PdfExtractionError);
        assert.equal(error.code, 'PDF_UNREADABLE');
        assert.doesNotMatch(error.message, /parser internals/i);
        return true;
      },
    );
  });

  test('maps OCR provider failures to a safe error', async () => {
    const service = createPdfExtractionService({
      parsePdfText: async () => '',
      ocrService: {
        async extractText() {
          throw new Error('provider token and internal details');
        },
      },
    });

    await assert.rejects(
      service.extractText(uploadedFile),
      (error) => {
        assert.ok(error instanceof PdfExtractionError);
        assert.equal(error.code, 'OCR_FAILED');
        assert.doesNotMatch(error.message, /provider token/i);
        return true;
      },
    );
  });

  test('rejects an OCR response that contains no usable text', async () => {
    const service = createPdfExtractionService({
      parsePdfText: async () => '',
      ocrService: {
        async extractText() {
          return ' \n\t ';
        },
      },
    });

    await assert.rejects(
      service.extractText(uploadedFile),
      (error) => {
        assert.ok(error instanceof PdfExtractionError);
        assert.equal(error.code, 'OCR_EMPTY');
        return true;
      },
    );
  });
});
