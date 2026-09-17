import { describe, expect, test, vi } from 'vitest';

import { handleRequest } from '../src/index.js';

const TEST_ENV = {
  TYPHOON_API_KEY: 'test-typhoon-secret',
  AI_GATEWAY_TOKEN: 'test-gateway-secret',
};
const PDF_HEADER = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');

function gatewayRequest(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${TEST_ENV.AI_GATEWAY_TOKEN}`);
  return new Request(`https://gateway.example.test${path}`, {
    ...init,
    headers,
  });
}

function jsonRequest(path, body, init = {}) {
  return gatewayRequest(path, {
    method: 'POST',
    body: JSON.stringify(body),
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

function pdfRequest(file = new File([PDF_HEADER], 'resource.pdf', {
  type: 'application/pdf',
})) {
  const form = new FormData();
  form.append('file', file);
  return gatewayRequest('/ocr-resource-document', {
    method: 'POST',
    body: form,
  });
}

async function responseBody(response) {
  return response.json();
}

describe('Worker routing and service authentication', () => {
  test('exposes a health check without exposing configuration', async () => {
    const response = await handleRequest(
      new Request('https://gateway.example.test/health'),
      {},
    );

    expect(response.status).toBe(200);
    expect(await responseBody(response)).toEqual({
      success: true,
      data: { status: 'ok' },
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  test('returns a safe not-found response for unknown routes', async () => {
    const response = await handleRequest(
      new Request('https://gateway.example.test/unknown'),
      TEST_ENV,
    );

    expect(response.status).toBe(404);
    expect((await responseBody(response)).error.code).toBe('NOT_FOUND');
  });

  test('rejects calls without the backend gateway token before upstream access', async () => {
    const fetchImpl = vi.fn();
    const response = await handleRequest(
      new Request('https://gateway.example.test/extract-resource', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Microscope model BX53' }),
      }),
      TEST_ENV,
      { fetchImpl },
    );

    expect(response.status).toBe(401);
    expect((await responseBody(response)).error.code).toBe('UNAUTHENTICATED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('allows a public deployment only when the rate-limit binding is active', async () => {
    const rateLimit = vi.fn(async () => ({ success: true }));
    const fetchImpl = vi.fn(async () => Response.json({
      choices: [{ message: { content: '{"name":"Centrifuge"}' } }],
    }));
    const response = await handleRequest(
      new Request('https://gateway.example.test/extract-resource', {
        method: 'POST',
        headers: {
          'CF-Connecting-IP': '203.0.113.10',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: 'Centrifuge' }),
      }),
      {
        TYPHOON_API_KEY: TEST_ENV.TYPHOON_API_KEY,
        AI_RATE_LIMITER: { limit: rateLimit },
      },
      { fetchImpl },
    );

    expect(response.status).toBe(200);
    expect(rateLimit).toHaveBeenCalledWith({
      key: '/extract-resource:203.0.113.10',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test('rejects rate-limited public calls before upstream access', async () => {
    const fetchImpl = vi.fn();
    const response = await handleRequest(
      new Request('https://gateway.example.test/extract-resource', {
        method: 'POST',
        headers: {
          'CF-Connecting-IP': '203.0.113.10',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: 'Centrifuge' }),
      }),
      {
        TYPHOON_API_KEY: TEST_ENV.TYPHOON_API_KEY,
        AI_RATE_LIMITER: { limit: vi.fn(async () => ({ success: false })) },
      },
      { fetchImpl },
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect((await responseBody(response)).error.code).toBe('RATE_LIMITED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('does not expose a public proxy without either authentication or rate limiting', async () => {
    const fetchImpl = vi.fn();
    const response = await handleRequest(
      new Request('https://gateway.example.test/extract-resource', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Centrifuge' }),
      }),
      { TYPHOON_API_KEY: TEST_ENV.TYPHOON_API_KEY },
      { fetchImpl },
    );

    expect(response.status).toBe(503);
    expect((await responseBody(response)).error.code).toBe('SERVICE_UNAVAILABLE');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('fails safely when gateway secrets are not configured', async () => {
    const fetchImpl = vi.fn();
    const response = await handleRequest(
      gatewayRequest('/extract-resource', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Microscope model BX53' }),
      }),
      {},
      { fetchImpl },
    );

    expect(response.status).toBe(503);
    expect((await responseBody(response)).error.code).toBe('SERVICE_UNAVAILABLE');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('POST /extract-resource', () => {
  test('rejects unsupported content types and invalid request fields', async () => {
    const textResponse = await handleRequest(
      gatewayRequest('/extract-resource', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'Microscope model BX53',
      }),
      TEST_ENV,
    );
    const extraFieldResponse = await handleRequest(
      jsonRequest('/extract-resource', {
        text: 'Microscope model BX53',
        model: 'attacker-selected-model',
      }),
      TEST_ENV,
    );
    const emptyTextResponse = await handleRequest(
      jsonRequest('/extract-resource', { text: '   ' }),
      TEST_ENV,
    );

    expect(textResponse.status).toBe(415);
    expect((await responseBody(textResponse)).error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(extraFieldResponse.status).toBe(422);
    expect((await responseBody(extraFieldResponse)).error.code).toBe('VALIDATION_ERROR');
    expect(emptyTextResponse.status).toBe(422);
  });

  test('rejects malformed JSON and oversized text', async () => {
    const malformedResponse = await handleRequest(
      gatewayRequest('/extract-resource', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not-json',
      }),
      TEST_ENV,
    );
    const oversizedResponse = await handleRequest(
      jsonRequest('/extract-resource', { text: 'x'.repeat(60_001) }),
      TEST_ENV,
    );

    expect(malformedResponse.status).toBe(400);
    expect((await responseBody(malformedResponse)).error.code).toBe('INVALID_JSON');
    expect(oversizedResponse.status).toBe(422);
    expect((await responseBody(oversizedResponse)).error.code).toBe('VALIDATION_ERROR');
  });

  test('uses the fixed Typhoon model and returns only normalized resource fields', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const requestBody = JSON.parse(init.body);
      expect(init.headers.Authorization).toBe(`Bearer ${TEST_ENV.TYPHOON_API_KEY}`);
      expect(requestBody.model).toBe('typhoon-v2.5-30b-a3b-instruct');
      expect(requestBody.stream).toBe(false);
      expect(requestBody.messages[0].content).toMatch(/never invent/i);
      expect(requestBody.messages[1].content).toContain('BX53 Upright Microscope');

      return Response.json({
        choices: [{
          message: {
            content: JSON.stringify({
              name: '  BX53 Upright Microscope  ',
              category: 'Microscope',
              location: '',
              description: 'Research microscope',
              responsiblePerson: 'Dr. Anuwry',
              availabilityStatus: 'AVAILABLE',
              currentStatus: 'OPERATIONAL',
              specifications: 'Manufacturer: Olympus; Model: BX53',
              isAdmin: true,
            }),
          },
        }],
      });
    });

    const response = await handleRequest(
      jsonRequest('/extract-resource', {
        text: 'BX53 Upright Microscope by Olympus. Model BX53.',
      }),
      TEST_ENV,
      { fetchImpl },
    );

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.opentyphoon.ai/v1/chat/completions');
    expect(await responseBody(response)).toEqual({
      success: true,
      data: {
        name: 'BX53 Upright Microscope',
        category: 'Microscope',
        location: null,
        description: 'Research microscope',
        responsiblePerson: 'Dr. Anuwry',
        availabilityStatus: 'AVAILABLE',
        currentStatus: 'OPERATIONAL',
        specifications: 'Manufacturer: Olympus; Model: BX53',
      },
    });
  });

  test('accepts a fenced JSON response but rejects malformed model output', async () => {
    const fencedFetch = vi.fn(async () => Response.json({
      choices: [{
        message: {
          content: '```json\n{"name":"Centrifuge","availabilityStatus":"INVALID"}\n```',
        },
      }],
    }));
    const malformedFetch = vi.fn(async () => Response.json({
      choices: [{ message: { content: 'not valid JSON' } }],
    }));

    const fencedResponse = await handleRequest(
      jsonRequest('/extract-resource', { text: 'Centrifuge' }),
      TEST_ENV,
      { fetchImpl: fencedFetch },
    );
    const malformedResponse = await handleRequest(
      jsonRequest('/extract-resource', { text: 'Centrifuge' }),
      TEST_ENV,
      { fetchImpl: malformedFetch },
    );

    expect(fencedResponse.status).toBe(200);
    expect((await responseBody(fencedResponse)).data.availabilityStatus).toBeNull();
    expect(malformedResponse.status).toBe(502);
    expect((await responseBody(malformedResponse)).error.code).toBe('MALFORMED_AI_RESPONSE');
  });

  test('does not expose an upstream failure response', async () => {
    const fetchImpl = vi.fn(async () => new Response(
      'provider diagnostic containing credentials',
      { status: 429 },
    ));

    const response = await handleRequest(
      jsonRequest('/extract-resource', { text: 'Centrifuge' }),
      TEST_ENV,
      { fetchImpl },
    );
    const body = await responseBody(response);

    expect(response.status).toBe(502);
    expect(body.error.code).toBe('UPSTREAM_ERROR');
    expect(JSON.stringify(body)).not.toContain('credentials');
  });
});

describe('POST /ocr-resource-document', () => {
  test('rejects missing, unsupported, and disguised PDF files', async () => {
    const emptyForm = new FormData();
    const missingResponse = await handleRequest(
      gatewayRequest('/ocr-resource-document', { method: 'POST', body: emptyForm }),
      TEST_ENV,
    );
    const textResponse = await handleRequest(
      pdfRequest(new File(['plain text'], 'resource.txt', { type: 'text/plain' })),
      TEST_ENV,
    );
    const disguisedResponse = await handleRequest(
      pdfRequest(new File(['plain text'], 'resource.pdf', { type: 'application/pdf' })),
      TEST_ENV,
    );

    expect(missingResponse.status).toBe(400);
    expect((await responseBody(missingResponse)).error.code).toBe('PDF_REQUIRED');
    expect(textResponse.status).toBe(415);
    expect((await responseBody(textResponse)).error.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(disguisedResponse.status).toBe(415);
    expect((await responseBody(disguisedResponse)).error.code).toBe('INVALID_PDF');
  });

  test('rejects PDFs larger than five MiB', async () => {
    const oversizedPdf = new File(
      [PDF_HEADER, new Uint8Array((5 * 1024 * 1024) + 1)],
      'large-resource.pdf',
      { type: 'application/pdf' },
    );

    const response = await handleRequest(pdfRequest(oversizedPdf), TEST_ENV);

    expect(response.status).toBe(413);
    expect((await responseBody(response)).error.code).toBe('PDF_TOO_LARGE');
  });

  test('forwards a valid PDF to Typhoon OCR with fixed parameters', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      expect(init.headers.Authorization).toBe(`Bearer ${TEST_ENV.TYPHOON_API_KEY}`);
      expect(init.body).toBeInstanceOf(FormData);
      expect(init.body.get('model')).toBe('typhoon-ocr');
      expect(init.body.get('task_type')).toBeNull();
      expect(init.body.get('file').name).toBe('resource.pdf');

      return Response.json({
        results: [
          {
            success: true,
            message: {
              choices: [{
                message: {
                  content: JSON.stringify({ natural_text: 'BX53 Microscope' }),
                },
              }],
            },
          },
          {
            success: true,
            message: {
              choices: [{ message: { content: 'Model BX53' } }],
            },
          },
        ],
      });
    });

    const response = await handleRequest(pdfRequest(), TEST_ENV, { fetchImpl });

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.opentyphoon.ai/v1/ocr');
    expect(await responseBody(response)).toEqual({
      success: true,
      data: { text: 'BX53 Microscope\nModel BX53' },
    });
  });

  test('maps failed or empty OCR results to safe gateway errors', async () => {
    const upstreamFailure = vi.fn(async () => new Response('private provider error', {
      status: 500,
    }));
    const emptyResult = vi.fn(async () => Response.json({
      results: [{ success: false, error: 'private page error' }],
    }));

    const failedResponse = await handleRequest(
      pdfRequest(),
      TEST_ENV,
      { fetchImpl: upstreamFailure },
    );
    const emptyResponse = await handleRequest(
      pdfRequest(),
      TEST_ENV,
      { fetchImpl: emptyResult },
    );

    expect(failedResponse.status).toBe(502);
    expect((await responseBody(failedResponse)).error.code).toBe('UPSTREAM_ERROR');
    expect(emptyResponse.status).toBe(502);
    expect((await responseBody(emptyResponse)).error.code).toBe('OCR_EMPTY');
  });
});
