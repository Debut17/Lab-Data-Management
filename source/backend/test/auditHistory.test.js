import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { createMySqlAuditRepository } from '../src/repositories/mysqlAuditRepository.js';

const users = [
  { id: 'admin-1', email: 'admin@local.test', displayName: 'Administrator', role: 'SYSTEM_ADMIN' },
  { id: 'member-1', email: 'member@local.test', displayName: 'Member', role: 'LAB_MEMBER' },
];

function createContext({ listError } = {}) {
  const calls = [];
  const app = createApp({
    auditRepository: {
      async list(options) {
        calls.push(options);
        if (listError) throw listError;
        return { auditLogs: [{ id: '9', action: 'ROLE_ASSIGNED' }], hasMore: false };
      },
    },
    resourceRepository: { async listBookable() { return []; } },
    userRepository: {
      async findByEmail(email) { return users.find((user) => user.email === email) ?? null; },
      async findActiveById(id) { return users.find((user) => user.id === id) ?? null; },
    },
    authSecret: 'test-secret-with-enough-entropy-for-tests',
    allowDevLogin: true,
    logger: { error() {} },
  });
  return { app, calls };
}

async function agentFor(app, email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/dev-login').send({ email }).expect(200);
  return agent;
}

describe('GET /api/admin/audit-logs', () => {
  test('requires an authenticated System Administrator', async () => {
    const { app, calls } = createContext();
    await request(app).get('/api/admin/audit-logs').expect(401);
    const member = await agentFor(app, 'member@local.test');
    await member.get('/api/admin/audit-logs').expect(403);
    assert.equal(calls.length, 0);
  });

  test('returns a bounded page and prevents caching', async () => {
    const { app, calls } = createContext();
    const admin = await agentFor(app, 'admin@local.test');
    const response = await admin.get('/api/admin/audit-logs?page=2&limit=5').expect(200);
    assert.deepEqual(calls, [{ page: 2, limit: 5 }]);
    assert.deepEqual(response.body.data, {
      auditLogs: [{ id: '9', action: 'ROLE_ASSIGNED' }],
      page: 2,
      limit: 5,
      hasMore: false,
    });
    assert.match(response.headers['cache-control'], /no-store/);
  });

  test('uses safe defaults and rejects invalid or extra query parameters', async () => {
    const { app, calls } = createContext();
    const admin = await agentFor(app, 'admin@local.test');
    await admin.get('/api/admin/audit-logs').expect(200);
    assert.deepEqual(calls, [{ page: 1, limit: 20 }]);
    for (const query of ['page=0', 'limit=51', 'page=abc', 'limit=-1', 'offset=100']) {
      const response = await admin.get(`/api/admin/audit-logs?${query}`).expect(422);
      assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    }
    assert.equal(calls.length, 1);
  });

  test('hides database errors', async () => {
    const { app } = createContext({ listError: new Error('private database detail') });
    const admin = await agentFor(app, 'admin@local.test');
    const response = await admin.get('/api/admin/audit-logs').expect(500);
    assert.doesNotMatch(JSON.stringify(response.body), /private database detail/);
  });
});

describe('MySQL audit history repository', () => {
  test('joins actor names, orders stably, maps JSON and detects another page', async () => {
    const calls = [];
    const repository = createMySqlAuditRepository({
      async execute(sql, values) {
        calls.push({ sql, values });
        return [[
          { id: 3, actorId: 'admin-1', actorName: 'Administrator', action: 'ROLE_ASSIGNED', entityType: 'USER', affectedRecordId: 'member-1', changesJson: '{"role":{"before":"LAB_MEMBER","after":"LAB_STAFF"}}', createdAt: new Date('2026-10-24T08:00:00.000Z') },
          { id: 2, actorId: 'admin-1', actorName: 'Administrator', action: 'RESOURCE_CREATED', entityType: 'RESOURCE', affectedRecordId: 'resource-1', changesJson: null, createdAt: new Date('2026-10-23T08:00:00.000Z') },
        ]];
      },
    });
    const result = await repository.list({ page: 2, limit: 1 });
    assert.match(calls[0].sql, /JOIN users/);
    assert.match(calls[0].sql, /ORDER BY a\.created_at DESC, a\.id DESC/);
    assert.deepEqual(calls[0].values, [2, 1]);
    assert.equal(result.hasMore, true);
    assert.deepEqual(result.auditLogs, [{
      id: '3',
      actorId: 'admin-1',
      actorName: 'Administrator',
      action: 'ROLE_ASSIGNED',
      entityType: 'USER',
      affectedRecordId: 'member-1',
      changes: { role: { before: 'LAB_MEMBER', after: 'LAB_STAFF' } },
      createdAt: '2026-10-24T08:00:00.000Z',
    }]);
  });

  test('keeps legacy audit rows without a field diff', async () => {
    const repository = createMySqlAuditRepository({
      async execute() {
        return [[{ id: 1, actorId: 'admin-1', actorName: 'Administrator', action: 'RESOURCE_CREATED', entityType: 'RESOURCE', affectedRecordId: 'resource-1', changesJson: null, createdAt: new Date('2026-10-22T08:00:00.000Z') }]];
      },
    });
    const result = await repository.list({ page: 1, limit: 20 });
    assert.equal(result.hasMore, false);
    assert.equal(result.auditLogs[0].changes, null);
  });
});
