import { z } from 'zod';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_GATEWAY_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_TEXT_CHARACTERS = 60_000;
const LOCAL_GATEWAY_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  'host.docker.internal',
]);

const resourceFieldsSchema = z.object({
  name: z.string().max(150).nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  location: z.string().max(255).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  responsiblePerson: z.string().max(150).nullable().optional(),
  availabilityStatus: z.enum(['AVAILABLE', 'UNAVAILABLE']).nullable().optional(),
  currentStatus: z.enum([
    'OPERATIONAL',
    'MAINTENANCE',
    'OUT_OF_SERVICE',
  ]).nullable().optional(),
  specifications: z.string().max(4000).nullable().optional(),
});
const ocrResultSchema = z.object({
  text: z.string().min(1).max(MAX_SOURCE_TEXT_CHARACTERS),
});

export class AiGatewayError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'AiGatewayError';
    this.code = code;
  }
}

function normalizeBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('AI gateway URL must be a valid URL.');
  }

  const isLocalHttp = url.protocol === 'http:'
    && LOCAL_GATEWAY_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !isLocalHttp) {
    throw new TypeError('AI gateway URL must use HTTPS outside local development.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TypeError('AI gateway URL must not contain credentials, a query, or a fragment.');
  }

  return url.toString().replace(/\/+$/, '');
}

function normalizeNullableString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.normalize('NFKC').replaceAll('\u0000', '').trim();
  return normalized || null;
}

function normalizeResourceFields(value) {
  const parsed = resourceFieldsSchema.safeParse(value);
  if (!parsed.success) {
    throw new AiGatewayError(
      'AI_GATEWAY_INVALID_RESPONSE',
      'The AI gateway returned invalid resource suggestions.',
    );
  }

  return {
    name: normalizeNullableString(parsed.data.name),
    category: normalizeNullableString(parsed.data.category),
    location: normalizeNullableString(parsed.data.location),
    description: normalizeNullableString(parsed.data.description),
    responsiblePerson: normalizeNullableString(parsed.data.responsiblePerson),
    availabilityStatus: parsed.data.availabilityStatus ?? null,
    currentStatus: parsed.data.currentStatus ?? null,
    specifications: normalizeNullableString(parsed.data.specifications),
  };
}

export function createAiGatewayService({
  baseUrl,
  token,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (token !== undefined && typeof token !== 'string') {
    throw new TypeError('AI gateway token must be a string when configured.');
  }
  const normalizedToken = token?.trim() || null;
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('AI gateway fetch implementation is required.');
  }

  async function request(path, { body, headers = {} }) {
    let response;
    try {
      response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
        method: 'POST',
        headers: {
          ...(normalizedToken ? { Authorization: `Bearer ${normalizedToken}` } : {}),
          ...headers,
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new AiGatewayError(
        'AI_GATEWAY_UNAVAILABLE',
        'AI-assisted extraction is currently unavailable.',
        { cause: error },
      );
    }

    if (!response.ok) {
      throw new AiGatewayError(
        'AI_GATEWAY_UNAVAILABLE',
        'AI-assisted extraction is currently unavailable.',
      );
    }

    const rawBody = await response.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_GATEWAY_RESPONSE_BYTES) {
      throw new AiGatewayError(
        'AI_GATEWAY_INVALID_RESPONSE',
        'The AI gateway returned an invalid response.',
      );
    }

    let responseBody;
    try {
      responseBody = JSON.parse(rawBody);
    } catch {
      throw new AiGatewayError(
        'AI_GATEWAY_INVALID_RESPONSE',
        'The AI gateway returned an invalid response.',
      );
    }

    if (responseBody?.success !== true || responseBody.data === undefined) {
      throw new AiGatewayError(
        'AI_GATEWAY_INVALID_RESPONSE',
        'The AI gateway returned an invalid response.',
      );
    }
    return responseBody.data;
  }

  return {
    async extractText(file) {
      if (
        !file
        || !Buffer.isBuffer(file.buffer)
        || typeof file.originalName !== 'string'
        || typeof file.mimeType !== 'string'
      ) {
        throw new AiGatewayError(
          'PDF_INVALID',
          'The PDF could not be prepared for OCR.',
        );
      }

      const form = new FormData();
      form.append(
        'file',
        new Blob([file.buffer], { type: file.mimeType }),
        file.originalName,
      );
      const data = await request('/ocr-resource-document', { body: form });
      const parsed = ocrResultSchema.safeParse(data);
      if (!parsed.success) {
        throw new AiGatewayError(
          'AI_GATEWAY_INVALID_RESPONSE',
          'The AI gateway returned invalid OCR text.',
        );
      }
      return parsed.data.text;
    },

    async extractResource(text) {
      if (
        typeof text !== 'string'
        || text.trim().length === 0
        || text.length > MAX_SOURCE_TEXT_CHARACTERS
      ) {
        throw new AiGatewayError(
          'SOURCE_TEXT_INVALID',
          'The extracted PDF text cannot be processed.',
        );
      }

      const data = await request('/extract-resource', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      return normalizeResourceFields(data);
    },
  };
}
