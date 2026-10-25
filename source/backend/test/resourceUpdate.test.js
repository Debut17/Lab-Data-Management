import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { ResourceUpdateError } from '../src/repositories/mysqlResourceRepository.js';

const AUTH_SECRET = 'resource-update-test-secret-long-enough';
const RESOURCE_ID = '10000000-0000-4000-8000-000000000001';
const endpoint = `/api/admin/resources/${RESOURCE_ID}`;
const users = [
  { id: 'user-admin', email: 'admin@local.test', displayName: 'Local Administrator', role: 'SYSTEM_ADMIN' },
  { id: 'user-member', email: 'member@local.test', displayName: 'Local Lab Member', role: 'LAB_MEMBER' },
  { id: 'user-staff', email: 'staff@local.test', displayName: 'Local Lab Staff', role: 'LAB_STAFF' },
];

function validBody(overrides = {}) {
  return {
    name: 'BX53 Upright Microscope',
    category: 'Microscope',
    location: 'Biology Lab B, Room 305',
    description: 'Upright microscope for laboratory observation.',
    responsiblePerson: 'Dr. Example',
    availabilityStatus: 'AVAILABLE',
    currentStatus: 'OPERATIONAL',
    specifications: 'LED illumination',
    ...overrides,
  };
}

function createUpdateContext({ updateError } = {}) {
  const updates = [];
  const resourceRepository = {
    async create() {},
    async listForMembers() { return []; },
    async listForAdministrator() { return []; },
    async update(id, resource, actorId) {
      if (updateError) throw updateError;
      updates.push({ id, resource, actorId });
      return { id, ...resource, archived: false };
    },
  };
  const app = createApp({
    resourceRepository,
    userRepository: {
      async findByEmail(email) {
        return users.find((user) => user.email === email) ?? null;
      },
      async findActiveById(id) {
        return users.find((user) => user.id === id) ?? null;
      },
    },
    authSecret: AUTH_SECRET,
    allowDevLogin: true,
    logger: { error() {} },
  });
  return { app, updates };
}

async function adminAgent(app) {
  const agent = request.agent(app);
  await agent.post('/api/auth/dev-login').send({ email: 'admin@local.test' }).expect(200);
  return agent;
}

describe('US-9 edit resource API', () => {
  test('requires authentication and a System Administrator role', async () => {
    const { app, updates } = createUpdateContext();

    await request(app).put(endpoint).send(validBody()).expect(401);
    for (const email of ['member@local.test', 'staff@local.test']) {
      const agent = request.agent(app);
      await agent.post('/api/auth/dev-login').send({ email }).expect(200);
      const response = await agent.put(endpoint).send(validBody()).expect(403);
      assert.equal(response.body.error.message, 'System Administrator access is required.');
    }

    assert.equal(updates.length, 0);
  });

  test('updates a resource and records the acting administrator from the session', async () => {
    const { app, updates } = createUpdateContext();
    const admin = await adminAgent(app);

    const response = await admin.put(endpoint).send(validBody()).expect(200);

    assert.equal(response.body.success, true);
    assert.equal(response.body.data.location, 'Biology Lab B, Room 305');
    assert.equal(updates.length, 1);
    assert.equal(updates[0].id, RESOURCE_ID);
    assert.equal(updates[0].actorId, 'user-admin');
  });

  test('trims text and stores blank optional fields as null', async () => {
    const { app, updates } = createUpdateContext();
    const admin = await adminAgent(app);

    await admin
      .put(endpoint)
      .send(validBody({ name: '  BX53 Upright Microscope  ', description: '   ', responsiblePerson: '', specifications: null }))
      .expect(200);

    assert.equal(updates[0].resource.name, 'BX53 Upright Microscope');
    assert.equal(updates[0].resource.description, null);
    assert.equal(updates[0].resource.responsiblePerson, null);
    assert.equal(updates[0].resource.specifications, null);
  });

  test('rejects an invalid resource identifier without writing', async () => {
    const { app, updates } = createUpdateContext();
    const admin = await adminAgent(app);

    const response = await admin.put('/api/admin/resources/not-a-uuid').send(validBody()).expect(422);

    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    assert.ok(response.body.error.details.some((issue) => issue.field === 'id'));
    assert.equal(updates.length, 0);
  });

  const invalidBodies = [
    ['a blank required field', { name: '   ' }, 'name'],
    ['a missing required field', { category: undefined }, 'category'],
    ['a name longer than 150 characters', { name: 'x'.repeat(151) }, 'name'],
    ['an unknown availability status', { availabilityStatus: 'BROKEN' }, 'availabilityStatus'],
    ['an unknown current status', { currentStatus: 'RETIRED' }, 'currentStatus'],
    ['an unrelated field', { archived: true }, 'request'],
  ];

  for (const [name, overrides, field] of invalidBodies) {
    test(`rejects ${name} without writing`, async () => {
      const { app, updates } = createUpdateContext();
      const admin = await adminAgent(app);

      const response = await admin.put(endpoint).send(validBody(overrides)).expect(422);

      assert.equal(response.body.error.code, 'VALIDATION_ERROR');
      assert.ok(
        response.body.error.details.some((issue) => issue.field === field),
        `expected an issue for ${field}, got ${JSON.stringify(response.body.error.details)}`,
      );
      assert.equal(updates.length, 0);
    });
  }

  const repositoryErrors = [
    ['RESOURCE_NOT_FOUND', 404, 'The resource was not found.'],
    ['RESOURCE_ARCHIVED', 409, 'Archived resources cannot be edited.'],
  ];

  for (const [code, status, message] of repositoryErrors) {
    test(`returns ${code} as ${status}`, async () => {
      const { app } = createUpdateContext({ updateError: new ResourceUpdateError(code, status, message) });
      const admin = await adminAgent(app);

      const response = await admin.put(endpoint).send(validBody()).expect(status);

      assert.equal(response.body.error.code, code);
      assert.equal(response.body.error.message, message);
    });
  }

  test('hides internal details when the update fails', async () => {
    const { app } = createUpdateContext({ updateError: new Error('database password leaked') });
    const admin = await adminAgent(app);

    const response = await admin.put(endpoint).send(validBody()).expect(500);

    assert.equal(response.body.error.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(JSON.stringify(response.body), /database password/i);
  });
});
