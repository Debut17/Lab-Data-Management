import path from 'node:path';

import multer from 'multer';

export const MAX_PDF_SIZE_BYTES = 5 * 1024 * 1024;

export class PdfUploadValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PdfUploadValidationError';
    this.code = code;
  }
}

function acceptPdfOnly(_request, file, callback) {
  const extension = path.extname(file.originalname).toLowerCase();
  const isSupported = file.mimetype === 'application/pdf' && extension === '.pdf';

  if (!isSupported) {
    callback(
      new PdfUploadValidationError(
        'UNSUPPORTED_FILE_TYPE',
        'Only PDF files are supported.',
      ),
    );
    return;
  }

  callback(null, true);
}

export const receiveResourcePdf = multer({
  storage: multer.memoryStorage(),
  fileFilter: acceptPdfOnly,
  limits: {
    fileSize: MAX_PDF_SIZE_BYTES,
    files: 1,
    fields: 0,
    parts: 1,
    fieldNameSize: 100,
    headerPairs: 100,
  },
}).single('file');

export function hasPdfSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return false;
  }

  return buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'));
}

export function mapPdfUploadError(error) {
  if (error instanceof PdfUploadValidationError) {
    return {
      status: 415,
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return {
        status: 413,
        code: 'PDF_TOO_LARGE',
        message: 'The PDF must be 5 MiB or smaller.',
      };
    }

    return {
      status: 400,
      code: 'INVALID_UPLOAD',
      message: 'The PDF upload is invalid.',
    };
  }

  return null;
}
