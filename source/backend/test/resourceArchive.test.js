import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { ResourceArchiveError } from '../src/repositories/mysqlResourceRepository.js';

const AUTH_SECRET = 'test-secret-with-enough-entropy-for-tests';
const RESOURCE_ID = '10000000-0000-4000-8000-000000000001';
const users = [
  { id: 'user-admin', email: 'admin@local.test', displayName: 'Local Administrator', role: 'SYSTEM_ADMIN' },
  { id: 'user-member', email: 'member@local.test', displayName: 'Local Lab Member', role: 'LAB_MEMBER' },
  { id: 'user-staff', email: 'staff@local.test', displayName: 'Local Lab Staff', role: 'LAB_STAFF' },
];

function createArchiveContext({ archiveError } = {}) {
  const resources = [
    { id: RESOURCE_ID, name: 'BX53 Upright Microscope', archived: false },
    { id: '10000000-0000-4000-8000-000000000002', name: 'High-Speed Centrifuge', archived: false },
  ];
  const archived = [];
  const resourceRepository = {
    async create() {},
    async listForMembers() {
      return resources.filter((resource) => !resource.archived);
    },
    async listForAdministrator() {
      return resources;
    },
    async archive(id, actorId) {
      if (archiveError) throw archiveError;
      const resource = resources.find((candidate) => candidate.id === id);
      if (!resource) throw new ResourceArchiveError('RESOURCE_NOT_FOUND', 404, 'The resource was not found.');
      if (resource.archived) {
        throw new ResourceArchiveError('RESOURCE_ALREADY_ARCHIVED', 409, 'This resource is already archived.');
      }
      resource.archived = true;
      archived.push({ id, actorId });
      return resource;
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
  return { app, archived };
}

async function login(agent, email) {
  await agent.post('/api/auth/dev-login').send({ email }).expect(200);
}

describe('US-10 archive resource API', () => {
  test('requires authentication and a System Administrator role', async () => {
    const { app, archived } = createArchiveContext();

    await request(app).post(`/api/admin/resources/${RESOURCE_ID}/archive`).expect(401);
    for (const email of ['member@local.test', 'staff@local.test']) {
      const agent = request.agent(app);
      await login(agent, email);
      const response = await agent.post(`/api/admin/resources/${RESOURCE_ID}/archive`).expect(403);
      assert.equal(response.body.error.message, 'System Administrator access is required.');
    }

    assert.equal(archived.length, 0);
  });

  test('archives a resource and records the acting administrator from the session', async () => {
    const { app, archived } = createArchiveContext();
    const admin = request.agent(app);
    await login(admin, 'admin@local.test');

    const response = await admin.post(`/api/admin/resources/${RESOURCE_ID}/archive`).expect(200);

    assert.equal(response.body.data.archived, true);
    assert.deepEqual(archived, [{ id: RESOURCE_ID, actorId: 'user-admin' }]);
  });

  test('hides the archived resource from members but keeps it in the administrator view', async () => {
    const { app } = createArchiveContext();
    const admin = request.agent(app);
    const member = request.agent(app);
    await login(admin, 'admin@local.test');
    await login(member, 'member@local.test');

    await admin.post(`/api/admin/resources/${RESOURCE_ID}/archive`).expect(200);

    const memberView = await member.get('/api/resources').expect(200);
    const adminView = await admin.get('/api/admin/resources').expect(200);
    assert.ok(!memberView.body.data.some((resource) => resource.id === RESOURCE_ID));
    assert.equal(memberView.body.data.length, 1);
    const archivedResource = adminView.body.data.resources.find((resource) => resource.id === RESOURCE_ID);
    assert.equal(archivedResource.archived, true);
  });

  test('rejects an invalid identifier, unknown resource, and repeated archive', async () => {
    const { app } = createArchiveContext();
    const admin = request.agent(app);
    await login(admin, 'admin@local.test');

    const invalid = await admin.post('/api/admin/resources/not-a-uuid/archive').expect(422);
    const missing = await admin
      .post('/api/admin/resources/10000000-0000-4000-8000-000000000099/archive')
      .expect(404);
    await admin.post(`/api/admin/resources/${RESOURCE_ID}/archive`).expect(200);
    const repeated = await admin.post(`/api/admin/resources/${RESOURCE_ID}/archive`).expect(409);

    assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');
    assert.equal(missing.body.error.code, 'RESOURCE_NOT_FOUND');
    assert.equal(repeated.body.error.code, 'RESOURCE_ALREADY_ARCHIVED');
  });

  test('explains why a resource with active bookings cannot be archived', async () => {
    const { app } = createArchiveContext({
      archiveError: new ResourceArchiveError(
        'RESOURCE_HAS_ACTIVE_BOOKINGS',
        409,
        'This resource has 2 pending or upcoming bookings. Decline or cancel them before archiving.',
      ),
    });
    const admin = request.agent(app);
    await login(admin, 'admin@local.test');

    const response = await admin.post(`/api/admin/resources/${RESOURCE_ID}/archive`).expect(409);

    assert.equal(response.body.error.code, 'RESOURCE_HAS_ACTIVE_BOOKINGS');
    assert.match(response.body.error.message, /2 pending or upcoming bookings/);
  });

  test('hides internal details when the archive fails', async () => {
    const { app } = createArchiveContext({ archiveError: new Error('database password leaked') });
    const admin = request.agent(app);
    await login(admin, 'admin@local.test');

    const response = await admin.post(`/api/admin/resources/${RESOURCE_ID}/archive`).expect(500);

    assert.equal(response.body.error.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(JSON.stringify(response.body), /database password/i);
  });
});
