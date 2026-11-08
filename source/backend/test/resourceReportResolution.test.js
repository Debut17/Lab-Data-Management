import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';

import { createApp } from '../src/app.js';
import {
  ResourceReportError,
  createMySqlResourceReportRepository,
} from '../src/repositories/mysqlResourceReportRepository.js';

const reportId = '00000000-0000-4000-8000-000000000301';

const users = [
  { id: 'admin-1', email: 'admin@local.test', displayName: 'Administrator', role: 'SYSTEM_ADMIN' },
  { id: 'member-1', email: 'member@local.test', displayName: 'Member', role: 'LAB_MEMBER' },
  { id: 'staff-1', email: 'staff@local.test', displayName: 'Staff', role: 'LAB_STAFF' },
];

function createContext({ resolveError } = {}) {
  const calls = [];
  const app = createApp({
    resourceReportRepository: {
      async listForAdministrator() {
        calls.push(['listForAdministrator']);
        return [{ id: reportId, status: 'PENDING' }];
      },
      async listByReporter(reporterId) {
        calls.push(['listByReporter', reporterId]);
        return [{ id: reportId, status: 'RESOLVED', resolutionNote: 'Replaced the lamp.' }];
      },
      async resolve(id, update, actorId) {
        calls.push(['resolve', id, update, actorId]);
        if (resolveError) throw resolveError;
        return { id, ...update, reporterNotified: true };
      },
    },
    resourceRepository: {},
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

describe('administrator issue report resolution routes', () => {
  test('only System Administrators can list or update issue reports', async () => {
    const { app, calls } = createContext();
    await request(app).get('/api/admin/resource-reports').expect(401);
    await request(app).patch(`/api/admin/resource-reports/${reportId}`)
      .send({ status: 'RESOLVED', resolutionNote: 'Done' }).expect(401);
    for (const email of ['member@local.test', 'staff@local.test']) {
      const agent = await agentFor(app, email);
      await agent.get('/api/admin/resource-reports').expect(403);
      await agent.patch(`/api/admin/resource-reports/${reportId}`)
        .send({ status: 'RESOLVED', resolutionNote: 'Done' }).expect(403);
    }
    assert.equal(calls.length, 0);
  });

  test('lists reports without caching', async () => {
    const { app } = createContext();
    const admin = await agentFor(app, 'admin@local.test');
    const response = await admin.get('/api/admin/resource-reports').expect(200);
    assert.deepEqual(response.body.data, { reports: [{ id: reportId, status: 'PENDING' }] });
    assert.match(response.headers['cache-control'], /no-store/);
  });

  test('saves a status change and cleaned resolution note as the signed-in administrator', async () => {
    const { app, calls } = createContext();
    const admin = await agentFor(app, 'admin@local.test');
    const response = await admin.patch(`/api/admin/resource-reports/${reportId}`)
      .send({ status: 'RESOLVED', resolutionNote: '  Replaced the lamp.\u0007  ' })
      .expect(200);
    assert.deepEqual(calls, [[
      'resolve', reportId, { status: 'RESOLVED', resolutionNote: 'Replaced the lamp.' }, 'admin-1',
    ]]);
    assert.equal(response.body.data.reporterNotified, true);
  });

  test('allows an empty note while work is still in progress', async () => {
    const { app, calls } = createContext();
    const admin = await agentFor(app, 'admin@local.test');
    await admin.patch(`/api/admin/resource-reports/${reportId}`)
      .send({ status: 'IN_PROGRESS', resolutionNote: '' }).expect(200);
    assert.deepEqual(calls[0][2], { status: 'IN_PROGRESS', resolutionNote: '' });
  });

  test('rejects invalid updates before reaching the database', async () => {
    const { app, calls } = createContext();
    const admin = await agentFor(app, 'admin@local.test');
    const invalid = [
      [reportId, { status: 'RESOLVED', resolutionNote: '   ' }, 'resolutionNote'],
      [reportId, { status: 'CLOSED', resolutionNote: 'Done' }, 'status'],
      [reportId, { status: 'RESOLVED', resolutionNote: 'x'.repeat(2001) }, 'resolutionNote'],
      [reportId, { status: 'RESOLVED', resolutionNote: 'Done', reporterId: 'staff-1' }, 'request'],
      ['not-a-uuid', { status: 'RESOLVED', resolutionNote: 'Done' }, 'id'],
    ];
    for (const [id, body, field] of invalid) {
      const response = await admin.patch(`/api/admin/resource-reports/${id}`).send(body).expect(422);
      assert.equal(response.body.error.code, 'VALIDATION_ERROR');
      assert.ok(response.body.error.details.some((detail) => detail.field === field), field);
    }
    assert.equal(calls.length, 0);
  });

  test('returns safe domain errors', async () => {
    for (const [code, status] of [['REPORT_NOT_FOUND', 404], ['REPORT_UNCHANGED', 409]]) {
      const { app } = createContext({ resolveError: new ResourceReportError(code, status, 'Safe message.') });
      const admin = await agentFor(app, 'admin@local.test');
      const response = await admin.patch(`/api/admin/resource-reports/${reportId}`)
        .send({ status: 'RESOLVED', resolutionNote: 'Done' }).expect(status);
      assert.equal(response.body.error.code, code);
    }
  });
});

describe('GET /api/resource-reports/mine', () => {
  test('lets Lab Staff see the outcome of their own reports only', async () => {
    const { app, calls } = createContext();
    await request(app).get('/api/resource-reports/mine').expect(401);
    const member = await agentFor(app, 'member@local.test');
    await member.get('/api/resource-reports/mine').expect(403);
    const staff = await agentFor(app, 'staff@local.test');
    const response = await staff.get('/api/resource-reports/mine').expect(200);
    assert.deepEqual(calls, [['listByReporter', 'staff-1']]);
    assert.equal(response.body.data.reports[0].resolutionNote, 'Replaced the lamp.');
    assert.match(response.headers['cache-control'], /no-store/);
  });
});

const reportRow = {
  id: reportId,
  resourceId: 'resource-1',
  resourceName: 'Shared Microscope',
  problemType: 'MALFUNCTION',
  description: 'The lamp is broken.',
  reporterId: 'staff-1',
  reporterName: 'Local Lab Staff',
  reporterEmail: 'staff@local.test',
  submittedAt: new Date('2026-11-08T03:00:00.000Z'),
  status: 'RESOLVED',
  resolutionNote: 'Replaced the lamp.',
  statusUpdatedBy: 'admin-1',
  statusUpdatedByName: 'Local Administrator',
  statusUpdatedAt: new Date('2026-11-08T05:00:00.000Z'),
};

function createConnection({ current = { status: 'PENDING', resolutionNote: null } } = {}) {
  const calls = [];
  return {
    calls,
    async beginTransaction() { calls.push('begin'); },
    async execute(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FOR UPDATE')) return [current ? [current] : []];
      if (sql.includes('WHERE p.id = ?')) return [[reportRow]];
      return [{ affectedRows: 1 }];
    },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); },
  };
}

function repositoryFor(connection) {
  return createMySqlResourceReportRepository({ async getConnection() { return connection; } });
}

function sqlCalls(connection) {
  return connection.calls.filter((call) => typeof call === 'object');
}

describe('MySQL resource report resolution', () => {
  test('updates the report, records an audit entry, and notifies the reporter in one transaction', async () => {
    const connection = createConnection();
    const report = await repositoryFor(connection)
      .resolve(reportId, { status: 'RESOLVED', resolutionNote: 'Replaced the lamp.' }, 'admin-1');

    const calls = sqlCalls(connection);
    const update = calls.find((call) => call.sql.includes('UPDATE resource_reports'));
    assert.deepEqual(update.values.slice(0, 3), ['RESOLVED', 'Replaced the lamp.', 'admin-1']);
    assert.equal(update.values[4], reportId);

    const audit = calls.find((call) => call.sql.includes('INSERT INTO audit_logs'));
    assert.equal(audit.values[1], 'RESOURCE_REPORT_STATUS_CHANGED');
    assert.deepEqual(JSON.parse(audit.values[3]), {
      status: { before: 'PENDING', after: 'RESOLVED' },
      resolutionNote: { before: null, after: 'Replaced the lamp.' },
    });

    const notification = calls.find((call) => call.sql.includes('INSERT INTO notifications'));
    assert.equal(notification.values[0], 'staff-1');
    assert.match(notification.values[2], /Shared Microscope is now Resolved\. Note: Replaced the lamp\./);

    assert.deepEqual(connection.calls.filter((call) => typeof call === 'string'), ['begin', 'commit', 'release']);
    assert.equal(report.reporterNotified, true);
    assert.equal(report.statusUpdatedAt, '2026-11-08T05:00:00.000Z');
  });

  test('records a note-only edit without notifying the reporter again', async () => {
    const connection = createConnection({ current: { status: 'RESOLVED', resolutionNote: 'Old note' } });
    const report = await repositoryFor(connection)
      .resolve(reportId, { status: 'RESOLVED', resolutionNote: 'Replaced the lamp.' }, 'admin-1');
    const calls = sqlCalls(connection);
    const audit = calls.find((call) => call.sql.includes('INSERT INTO audit_logs'));
    assert.equal(audit.values[1], 'RESOURCE_REPORT_NOTE_UPDATED');
    assert.equal(calls.some((call) => call.sql.includes('INSERT INTO notifications')), false);
    assert.equal(report.reporterNotified, false);
  });

  test('rejects missing and unchanged reports without writing', async () => {
    for (const [current, code] of [
      [null, 'REPORT_NOT_FOUND'],
      [{ status: 'IN_PROGRESS', resolutionNote: null }, 'REPORT_UNCHANGED'],
    ]) {
      const connection = createConnection({ current });
      await assert.rejects(
        repositoryFor(connection).resolve(reportId, { status: 'IN_PROGRESS', resolutionNote: '' }, 'admin-1'),
        (error) => error instanceof ResourceReportError && error.code === code,
      );
      assert.equal(sqlCalls(connection)
        .some((call) => /\bUPDATE\s+resource_reports\b/i.test(call.sql)), false);
      assert.ok(connection.calls.includes('rollback'));
    }
  });

  test('hides account details from the reporter view', async () => {
    const repository = createMySqlResourceReportRepository({
      async execute() { return [[reportRow]]; },
    });
    const [report] = await repository.listByReporter('staff-1');
    assert.equal(report.resolutionNote, 'Replaced the lamp.');
    assert.equal(report.statusUpdatedByName, 'Local Administrator');
    assert.equal('reporterEmail' in report, false);
    assert.equal('statusUpdatedBy' in report, false);
  });
});
