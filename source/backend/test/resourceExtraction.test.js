import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';

import { createApp } from '../src/app.js';

const AUTH_SECRET = 'test-secret-with-enough-entropy-for-tests';
const PDF_HEADER = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
const MAX_PDF_SIZE_BYTES = 5 * 1024 * 1024;

function createTestContext({ resourceExtractionService } = {}) {
  const users = [
    {
      id: 'user-admin',
      email: 'admin@local.test',
      displayName: 'Local Administrator',
      role: 'SYSTEM_ADMIN',
    },
    {
      id: 'user-member',
      email: 'member@local.test',
      displayName: 'Local Lab Member',
      role: 'LAB_MEMBER',
    },
  ];

  return createApp({
    resourceRepository: { async create() {} },
    userRepository: {
      async findByEmail(email) {
        return users.find((user) => user.email === email) ?? null;
      },
    },
    resourceExtractionService,
    authSecret: AUTH_SECRET,
    allowDevLogin: true,
    logger: { error() {} },
  });
}

async function login(agent, email) {
  await agent
    .post('/api/auth/dev-login')
    .send({ email })
    .expect(200);
}

describe('POST /api/resources/extract', () => {
  test('rejects an unauthenticated upload before processing the file', async () => {
    const extract = async () => assert.fail('Extraction must not run.');
    const app = createTestContext({ resourceExtractionService: { extract } });

    const response = await request(app)
      .post('/api/resources/extract')
      .attach('file', PDF_HEADER, {
        filename: 'resource.pdf',
        contentType: 'application/pdf',
      })
      .expect(401);

    assert.equal(response.body.error.code, 'UNAUTHENTICATED');
  });

  test('rejects a non-admin upload before processing the file', async () => {
    const extract = async () => assert.fail('Extraction must not run.');
    const app = createTestContext({ resourceExtractionService: { extract } });
    const agent = request.agent(app);
    await login(agent, 'member@local.test');

    const response = await agent
      .post('/api/resources/extract')
      .attach('file', PDF_HEADER, {
        filename: 'resource.pdf',
        contentType: 'application/pdf',
      })
      .expect(403);

    assert.equal(response.body.error.code, 'FORBIDDEN');
  });

  test('rejects a request without a PDF', async () => {
    const app = createTestContext();
    const agent = request.agent(app);
    await login(agent, 'admin@local.test');

    const response = await agent
      .post('/api/resources/extract')
      .expect(400);

    assert.equal(response.body.error.code, 'PDF_REQUIRED');
  });

  test('rejects unsupported MIME types and file extensions', async () => {
    const app = createTestContext();
    const agent = request.agent(app);
    await login(agent, 'admin@local.test');

    const textResponse = await agent
      .post('/api/resources/extract')
      .attach('file', Buffer.from('not a pdf'), {
        filename: 'resource.txt',
        contentType: 'text/plain',
      })
      .expect(415);
    const extensionResponse = await agent
      .post('/api/resources/extract')
      .attach('file', PDF_HEADER, {
        filename: 'resource.txt',
        contentType: 'application/pdf',
      })
      .expect(415);

    assert.equal(textResponse.body.error.code, 'UNSUPPORTED_FILE_TYPE');
    assert.equal(extensionResponse.body.error.code, 'UNSUPPORTED_FILE_TYPE');
  });

  test('rejects content without a PDF signature', async () => {
    const app = createTestContext();
    const agent = request.agent(app);
    await login(agent, 'admin@local.test');

    const response = await agent
      .post('/api/resources/extract')
      .attach('file', Buffer.from('plain text disguised as a PDF'), {
        filename: 'resource.pdf',
        contentType: 'application/pdf',
      })
      .expect(415);

    assert.equal(response.body.error.code, 'INVALID_PDF');
  });

  test('rejects a PDF larger than the upload limit', async () => {
    const app = createTestContext();
    const agent = request.agent(app);
    await login(agent, 'admin@local.test');
    const oversizedPdf = Buffer.concat([
      PDF_HEADER,
      Buffer.alloc(MAX_PDF_SIZE_BYTES + 1 - PDF_HEADER.length),
    ]);

    const response = await agent
      .post('/api/resources/extract')
      .attach('file', oversizedPdf, {
        filename: 'large-resource.pdf',
        contentType: 'application/pdf',
      })
      .expect(413);

    assert.equal(response.body.error.code, 'PDF_TOO_LARGE');
  });

  test('passes a valid PDF to the configured extraction service', async () => {
    const calls = [];
    const resourceExtractionService = {
      async extract(file) {
        calls.push(file);
        return {
          name: 'BX53 Upright Microscope',
          category: 'Microscope',
          location: null,
        };
      },
    };
    const app = createTestContext({ resourceExtractionService });
    const agent = request.agent(app);
    await login(agent, 'admin@local.test');

    const response = await agent
      .post('/api/resources/extract')
      .attach('file', PDF_HEADER, {
        filename: 'resource.pdf',
        contentType: 'application/pdf',
      })
      .expect(200);

    assert.equal(response.body.success, true);
    assert.equal(response.body.data.name, 'BX53 Upright Microscope');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].originalName, 'resource.pdf');
    assert.equal(calls[0].mimeType, 'application/pdf');
    assert.deepEqual(calls[0].buffer, PDF_HEADER);
  });

  test('keeps manual creation available when extraction is not configured', async () => {
    const app = createTestContext();
    const agent = request.agent(app);
    await login(agent, 'admin@local.test');

    const response = await agent
      .post('/api/resources/extract')
      .attach('file', PDF_HEADER, {
        filename: 'resource.pdf',
        contentType: 'application/pdf',
      })
      .expect(503);

    assert.equal(response.body.error.code, 'AI_ASSISTANCE_UNAVAILABLE');
    assert.match(response.body.error.message, /continue.*manually/i);
  });
});
