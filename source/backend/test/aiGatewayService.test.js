import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  AiGatewayError,
  createAiGatewayService,
} from '../src/services/aiGatewayService.js';

const TEST_GATEWAY_URL = 'https://gateway.example.test';
const TEST_GATEWAY_TOKEN = 'test-backend-gateway-token';
const uploadedFile = {
  buffer: Buffer.from('%PDF-1.7\nresource document'),
  originalName: 'microscope.pdf',
  mimeType: 'application/pdf',
  size: 30,
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createService(fetchImpl) {
  return createAiGatewayService({
    baseUrl: TEST_GATEWAY_URL,
    token: TEST_GATEWAY_TOKEN,
    fetchImpl,
  });
}

describe('AI gateway service', () => {
  test('sends scanned PDFs to the narrow OCR endpoint', async () => {
    const calls = [];
    const service = createService(async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({
        success: true,
        data: { text: 'BX53 Microscope\nModel BX53' },
      });
    });

    const text = await service.extractText(uploadedFile);

    assert.equal(text, 'BX53 Microscope\nModel BX53');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${TEST_GATEWAY_URL}/ocr-resource-document`);
    assert.equal(
      calls[0].init.headers.Authorization,
      `Bearer ${TEST_GATEWAY_TOKEN}`,
    );
    assert.ok(calls[0].init.body instanceof FormData);
    const forwardedFile = calls[0].init.body.get('file');
    assert.equal(forwardedFile.name, 'microscope.pdf');
    assert.equal(forwardedFile.type, 'application/pdf');
    assert.deepEqual(
      Buffer.from(await forwardedFile.arrayBuffer()),
      uploadedFile.buffer,
    );
  });

  test('sends extracted text to the fixed resource extraction endpoint', async () => {
    const calls = [];
    const service = createService(async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({
        success: true,
        data: {
          name: 'BX53 Upright Microscope',
          category: 'Microscope',
          location: '',
          description: null,
          responsiblePerson: null,
          availabilityStatus: 'AVAILABLE',
          currentStatus: 'OPERATIONAL',
          specifications: 'Manufacturer: Olympus; Model: BX53',
          unexpected: 'must be removed',
        },
      });
    });

    const result = await service.extractResource('BX53 resource document');

    assert.equal(calls[0].url, `${TEST_GATEWAY_URL}/extract-resource`);
    assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      text: 'BX53 resource document',
    });
    assert.deepEqual(result, {
      name: 'BX53 Upright Microscope',
      category: 'Microscope',
      location: null,
      description: null,
      responsiblePerson: null,
      availabilityStatus: 'AVAILABLE',
      currentStatus: 'OPERATIONAL',
      specifications: 'Manufacturer: Olympus; Model: BX53',
    });
  });

  test('supports a rate-limited public gateway without sending an authorization header', async () => {
    const calls = [];
    const service = createAiGatewayService({
      baseUrl: TEST_GATEWAY_URL,
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return jsonResponse({
          success: true,
          data: { name: 'Public gateway microscope' },
        });
      },
    });

    const result = await service.extractResource('Microscope');

    assert.equal(result.name, 'Public gateway microscope');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.headers.Authorization, undefined);
  });

  test('rejects unsafe gateway configuration before making a request', () => {
    assert.throws(
      () => createAiGatewayService({
        baseUrl: 'http://public-gateway.example.test',
        token: TEST_GATEWAY_TOKEN,
        fetchImpl: async () => assert.fail('Fetch must not run.'),
      }),
      /HTTPS/i,
    );
    assert.throws(
      () => createAiGatewayService({
        baseUrl: TEST_GATEWAY_URL,
        token: 42,
        fetchImpl: async () => assert.fail('Fetch must not run.'),
      }),
      /token/i,
    );
  });

  test('maps network and upstream failures without exposing provider details', async () => {
    const networkService = createService(async () => {
      throw new Error('socket failure containing private infrastructure');
    });
    const upstreamService = createService(async () => new Response(
      'provider response containing a credential',
      { status: 429 },
    ));

    await assert.rejects(
      networkService.extractResource('Microscope'),
      (error) => {
        assert.ok(error instanceof AiGatewayError);
        assert.equal(error.code, 'AI_GATEWAY_UNAVAILABLE');
        assert.doesNotMatch(error.message, /private infrastructure/i);
        return true;
      },
    );
    await assert.rejects(
      upstreamService.extractResource('Microscope'),
      (error) => {
        assert.ok(error instanceof AiGatewayError);
        assert.equal(error.code, 'AI_GATEWAY_UNAVAILABLE');
        assert.doesNotMatch(error.message, /credential/i);
        return true;
      },
    );
  });

  test('rejects malformed or oversized gateway data', async () => {
    const malformedService = createService(async () => jsonResponse({
      success: true,
      data: { name: 42 },
    }));
    const oversizedTextService = createService(async () => assert.fail('Fetch must not run.'));

    await assert.rejects(
      malformedService.extractResource('Microscope'),
      (error) => {
        assert.ok(error instanceof AiGatewayError);
        assert.equal(error.code, 'AI_GATEWAY_INVALID_RESPONSE');
        return true;
      },
    );
    await assert.rejects(
      oversizedTextService.extractResource('x'.repeat(60_001)),
      (error) => {
        assert.ok(error instanceof AiGatewayError);
        assert.equal(error.code, 'SOURCE_TEXT_INVALID');
        return true;
      },
    );
  });
});
