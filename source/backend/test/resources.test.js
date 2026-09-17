import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';

import { createApp } from '../src/app.js';

const AUTH_SECRET = 'test-secret-with-enough-entropy-for-tests';

function createTestContext({ createError } = {}) {
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
  const createdResources = [];
  const resourceRepository = {
    async create(resource, actorId) {
      if (createError) {
        throw createError;
      }

      const savedResource = {
        id: 'resource-123',
        ...resource,
        createdAt: '2026-09-17T12:00:00.000Z',
      };
      createdResources.push({ resource, actorId });
      return savedResource;
    },
  };
  const userRepository = {
    async findByEmail(email) {
      return users.find((user) => user.email === email) ?? null;
    },
  };
  const app = createApp({
    resourceRepository,
    userRepository,
    authSecret: AUTH_SECRET,
    allowDevLogin: true,
    logger: { error() {} },
  });

  return { app, createdResources };
}

async function login(agent, email) {
  const response = await agent
    .post('/api/auth/dev-login')
    .send({ email })
    .expect(200);

  assert.match(response.headers['set-cookie'][0], /HttpOnly/);
  assert.match(response.headers['set-cookie'][0], /SameSite=Strict/);
}

const validResource = {
  name: '  BX53 Upright Microscope  ',
  category: 'Microscope',
  location: '  Lab A, Room 201  ',
  description: 'Upright microscope for laboratory observation.',
  responsiblePerson: 'Dr. Example',
  availabilityStatus: 'AVAILABLE',
  currentStatus: 'OPERATIONAL',
  specifications: 'LED illumination; brightfield observation',
};

describe('POST /api/resources', () => {
  test('rejects an unauthenticated request', async () => {
    const { app, createdResources } = createTestContext();

    const response = await request(app)
      .post('/api/resources')
      .send(validResource)
      .expect(401);

    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'UNAUTHENTICATED');
    assert.equal(createdResources.length, 0);
  });

  test('rejects an authenticated non-admin user', async () => {
    const { app, createdResources } = createTestContext();
    const agent = request.agent(app);
    await login(agent, 'member@local.test');

    const response = await agent
      .post('/api/resources')
      .send(validResource)
      .expect(403);

    assert.equal(response.body.error.code, 'FORBIDDEN');
    assert.equal(createdResources.length, 0);
  });

  test('creates a validated resource and records the acting administrator', async () => {
    const { app, createdResources } = createTestContext();
    const agent = request.agent(app);
    await login(agent, 'admin@local.test');

    const response = await agent
      .post('/api/resources')
      .send(validResource)
      .expect(201);

    assert.equal(response.body.success, true);
    assert.equal(response.body.data.id, 'resource-123');
    assert.equal(response.body.data.name, 'BX53 Upright Microscope');
    assert.equal(response.body.data.location, 'Lab A, Room 201');
    assert.equal(createdResources.length, 1);
    assert.equal(createdResources[0].actorId, 'user-admin');
  });

  test('rejects missing or whitespace-only required fields without writing', async () => {
    const { app, createdResources } = createTestContext();
    const agent = request.agent(app);
    await login(agent, 'admin@local.test');

    const response = await agent
      .post('/api/resources')
      .send({ ...validResource, name: ' ', category: '', location: undefined })
      .expect(422);

    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    assert.deepEqual(
      response.body.error.details.map((detail) => detail.field).sort(),
      ['category', 'location', 'name'],
    );
    assert.equal(createdResources.length, 0);
  });

  test('rejects invalid status values', async () => {
    const { app, createdResources } = createTestContext();
    const agent = request.agent(app);
    await login(agent, 'admin@local.test');

    const response = await agent
      .post('/api/resources')
      .send({ ...validResource, availabilityStatus: 'MAYBE' })
      .expect(422);

    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    assert.equal(response.body.error.details[0].field, 'availabilityStatus');
    assert.equal(createdResources.length, 0);
  });

  test('returns a safe error when persistence fails', async () => {
    const { app } = createTestContext({
      createError: new Error('database password appeared here'),
    });
    const agent = request.agent(app);
    await login(agent, 'admin@local.test');

    const response = await agent
      .post('/api/resources')
      .send(validResource)
      .expect(500);

    assert.equal(response.body.error.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(JSON.stringify(response.body), /database password/i);
  });
});

describe('POST /api/auth/dev-login', () => {
  test('is unavailable when local demo authentication is disabled', async () => {
    const { app: baseApp } = createTestContext();
    const app = createApp({
      resourceRepository: { create() {} },
      userRepository: { findByEmail() {} },
      authSecret: AUTH_SECRET,
      allowDevLogin: false,
      logger: { error() {} },
    });

    await request(baseApp)
      .post('/api/auth/dev-login')
      .send({ email: 'admin@local.test' })
      .expect(200);
    const response = await request(app)
      .post('/api/auth/dev-login')
      .send({ email: 'admin@local.test' })
      .expect(404);

    assert.equal(response.body.error.code, 'NOT_FOUND');
  });

  test('rejects an invalid or unknown local-review identity', async () => {
    const { app } = createTestContext();

    const invalidResponse = await request(app)
      .post('/api/auth/dev-login')
      .send({ email: 'not-an-email' })
      .expect(422);
    const unknownResponse = await request(app)
      .post('/api/auth/dev-login')
      .send({ email: 'unknown@local.test' })
      .expect(401);

    assert.equal(invalidResponse.body.error.code, 'VALIDATION_ERROR');
    assert.equal(unknownResponse.body.error.code, 'INVALID_LOGIN');
  });

  test('returns the session user and clears the cookie on logout', async () => {
    const { app } = createTestContext();
    const agent = request.agent(app);
    await login(agent, 'admin@local.test');

    const sessionResponse = await agent.get('/api/auth/session').expect(200);
    assert.equal(sessionResponse.body.data.user.role, 'SYSTEM_ADMIN');

    const logoutResponse = await agent.post('/api/auth/logout').expect(200);
    assert.match(logoutResponse.headers['set-cookie'][0], /lab_session=;/);
    await agent.get('/api/auth/session').expect(401);
  });
});

describe('API request safety', () => {
  test('rejects malformed and oversized JSON bodies', async () => {
    const { app } = createTestContext();

    const malformedResponse = await request(app)
      .post('/api/resources')
      .set('Content-Type', 'application/json')
      .send('{broken')
      .expect(400);
    const oversizedResponse = await request(app)
      .post('/api/resources')
      .send({ name: 'x'.repeat(33 * 1024) })
      .expect(413);

    assert.equal(malformedResponse.body.error.code, 'INVALID_JSON');
    assert.equal(oversizedResponse.body.error.code, 'PAYLOAD_TOO_LARGE');
  });

  test('returns a consistent not-found response', async () => {
    const { app } = createTestContext();

    const response = await request(app).get('/api/not-a-route').expect(404);

    assert.equal(response.body.error.code, 'NOT_FOUND');
  });
});
