import { PDFParse } from 'pdf-parse';

const DEFAULT_MINIMUM_TEXT_CHARACTERS = 20;

export class PdfExtractionError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'PdfExtractionError';
    this.code = code;
  }
}

function normalizeExtractedText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .normalize('NFKC')
    .replaceAll('\u0000', '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t\f\v ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function hasUsableText(text, minimumCharacters) {
  return text.replace(/\s/g, '').length >= minimumCharacters;
}

async function parseEmbeddedPdfText(buffer) {
  const parser = new PDFParse({
    data: new Uint8Array(buffer),
    stopAtErrors: true,
  });

  try {
    const result = await parser.getText({ pageJoiner: '' });
    return result.text;
  } finally {
    await parser.destroy();
  }
}

export function createPdfExtractionService({
  parsePdfText = parseEmbeddedPdfText,
  ocrService = null,
  minimumTextCharacters = DEFAULT_MINIMUM_TEXT_CHARACTERS,
} = {}) {
  return {
    async extractText(file) {
      if (!file || !Buffer.isBuffer(file.buffer)) {
        throw new PdfExtractionError(
          'PDF_UNREADABLE',
          'The uploaded PDF could not be read.',
        );
      }

      let embeddedText;
      try {
        embeddedText = normalizeExtractedText(await parsePdfText(file.buffer));
      } catch (error) {
        throw new PdfExtractionError(
          'PDF_UNREADABLE',
          'The uploaded PDF could not be read.',
          { cause: error },
        );
      }

      if (hasUsableText(embeddedText, minimumTextCharacters)) {
        return { text: embeddedText, method: 'embedded' };
      }

      if (!ocrService) {
        throw new PdfExtractionError(
          'OCR_UNAVAILABLE',
          'This PDF appears to be scanned. OCR is currently unavailable.',
        );
      }

      let ocrText;
      try {
        ocrText = normalizeExtractedText(await ocrService.extractText(file));
      } catch (error) {
        throw new PdfExtractionError(
          'OCR_FAILED',
          'Text could not be extracted from the scanned PDF.',
          { cause: error },
        );
      }

      if (!hasUsableText(ocrText, minimumTextCharacters)) {
        throw new PdfExtractionError(
          'OCR_EMPTY',
          'No usable text was found in the scanned PDF.',
        );
      }

      return { text: ocrText, method: 'ocr' };
    },
  };
}
