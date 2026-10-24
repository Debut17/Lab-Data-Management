import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { ResourceAvailabilityError } from '../src/repositories/mysqlResourceRepository.js';

const resourceId = '11111111-1111-4111-8111-111111111111';
const endpoint = `/api/admin/resources/${resourceId}/availability`;

function context({ error } = {}) {
  const users = ['SYSTEM_ADMIN', 'LAB_MEMBER', 'LAB_STAFF'].map((role) => ({
    id: role, role, email: `${role.toLowerCase()}@local.test`, displayName: role,
  }));
  const resources = [
    { id: resourceId, name: 'Microscope', availabilityStatus: 'AVAILABLE', currentStatus: 'OPERATIONAL', archived: false },
    { id: '22222222-2222-4222-8222-222222222222', name: 'Retired equipment', availabilityStatus: 'AVAILABLE', currentStatus: 'OPERATIONAL', archived: true },
  ];
  const writes = [];
  const app = createApp({
    authSecret: 'resource-availability-test-secret-long-enough',
    allowDevLogin: true,
    logger: { error() {} },
    userRepository: {
      async findByEmail(email) { return users.find((user) => user.email === email); },
      async findActiveById(id) { return users.find((user) => user.id === id); },
    },
    resourceRepository: {
      async listForAdministrator() { return resources; },
      async listForMembers() { return resources.filter((item) => !item.archived); },
      async updateAvailability(id, availabilityStatus, actorId) {
        if (error) throw error;
        writes.push({ id, availabilityStatus, actorId });
        resources[0].availabilityStatus = availabilityStatus;
        return resources[0];
      },
    },
  });
  async function agentFor(role) {
    const agent = request.agent(app);
    await agent.post('/api/auth/dev-login').send({ email: `${role.toLowerCase()}@local.test` }).expect(200);
    return agent;
  }
  return { app, users, writes, agentFor };
}

describe('US-11 administrator resource availability API', () => {
  test('requires authentication on both routes', async () => {
    const { app } = context();
    await request(app).get('/api/admin/resources').expect(401);
    await request(app).patch(endpoint).send({ availabilityStatus: 'UNAVAILABLE' }).expect(401);
  });

  for (const role of ['LAB_MEMBER', 'LAB_STAFF']) {
    test(`denies both routes to ${role}`, async () => {
      const { agentFor, writes } = context();
      const agent = await agentFor(role);
      await agent.get('/api/admin/resources').expect(403);
      await agent.patch(endpoint).send({ availabilityStatus: 'UNAVAILABLE' }).expect(403);
      assert.equal(writes.length, 0);
    });
  }

  test('members see both saved states of the same resource while archived records stay admin-only', async () => {
    const { agentFor, writes } = context();
    const admin = await agentFor('SYSTEM_ADMIN');
    const member = await agentFor('LAB_MEMBER');
    for (const status of ['UNAVAILABLE', 'AVAILABLE']) {
      const saved = await admin.patch(endpoint).send({ availabilityStatus: status }).expect(200);
      assert.equal(saved.body.data.availabilityStatus, status);
      const list = await admin.get('/api/admin/resources').expect(200);
      assert.equal(list.body.data.resources[0].availabilityStatus, status);
      assert.equal(list.body.data.resources.length, 2);
      const visible = await member.get('/api/resources').expect(200);
      assert.equal(visible.body.data.length, 1);
      assert.equal(visible.body.data[0].id, resourceId);
      assert.equal(visible.body.data[0].availabilityStatus, status);
    }
    assert.deepEqual(writes, ['UNAVAILABLE', 'AVAILABLE'].map((availabilityStatus) => ({
      id: resourceId, availabilityStatus, actorId: 'SYSTEM_ADMIN',
    })));
  });

  test('rejects missing, invalid, and unrelated fields and invalid identifiers without writing', async () => {
    const { agentFor, writes } = context();
    const admin = await agentFor('SYSTEM_ADMIN');
    for (const body of [{}, { availabilityStatus: null }, { availabilityStatus: 'available' },
      { availabilityStatus: 'MAINTENANCE' }, { availabilityStatus: 'UNAVAILABLE', actorId: 'someone' },
      { availabilityStatus: 'AVAILABLE', currentStatus: 'MAINTENANCE' }]) {
      const result = await admin.patch(endpoint).send(body).expect(422);
      assert.equal(result.body.error.code, 'VALIDATION_ERROR');
    }
    await admin.patch('/api/admin/resources/invalid/availability').send({ availabilityStatus: 'AVAILABLE' }).expect(422);
    assert.equal(writes.length, 0);
  });

  test('rechecks the administrator role on every request', async () => {
    const { agentFor, users, writes } = context();
    const admin = await agentFor('SYSTEM_ADMIN');
    users[0].role = 'LAB_MEMBER';
    await admin.patch(endpoint).send({ availabilityStatus: 'UNAVAILABLE' }).expect(403);
    assert.equal(writes.length, 0);
  });

  for (const [code, status] of [['RESOURCE_NOT_FOUND', 404], ['RESOURCE_ARCHIVED', 409]]) {
    test(`returns ${code} as ${status}`, async () => {
      const { agentFor } = context({ error: new ResourceAvailabilityError(code, status, 'Resource cannot be changed.') });
      const admin = await agentFor('SYSTEM_ADMIN');
      const result = await admin.patch(endpoint).send({ availabilityStatus: 'AVAILABLE' }).expect(status);
      assert.equal(result.body.error.code, code);
    });
  }

  test('keeps persistence errors private', async () => {
    const { agentFor } = context({ error: new Error('private database details') });
    const admin = await agentFor('SYSTEM_ADMIN');
    const result = await admin.patch(endpoint).send({ availabilityStatus: 'UNAVAILABLE' }).expect(500);
    assert.equal(result.body.error.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(JSON.stringify(result.body), /private database/);
  });
});
