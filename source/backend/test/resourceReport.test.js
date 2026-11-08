import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';

import { createApp } from '../src/app.js';
import {
  ResourceReportError,
  createMySqlResourceReportRepository,
} from '../src/repositories/mysqlResourceReportRepository.js';

// US-7: Lab Staff report a resource problem and administrators are notified.

const resourceId = '10000000-0000-4000-8000-000000000001';

const users = [
  { id: 'admin-1', email: 'admin@local.test', displayName: 'Administrator', role: 'SYSTEM_ADMIN' },
  { id: 'member-1', email: 'member@local.test', displayName: 'Member', role: 'LAB_MEMBER' },
  { id: 'staff-1', email: 'staff@local.test', displayName: 'Staff', role: 'LAB_STAFF' },
];

const validReport = {
  resourceId,
  problemType: 'MALFUNCTION',
  description: 'The focus control slips.',
};

function createContext({ createError, markReadError } = {}) {
  const calls = [];
  const app = createApp({
    resourceReportRepository: {
      async create(report, reporterId) {
        calls.push(['create', report, reporterId]);
        if (createError) throw createError;
        return { id: 'report-1', ...report, reporterId, status: 'PENDING' };
      },
      async listNotifications(recipientId) {
        calls.push(['listNotifications', recipientId]);
        return [{ id: '7', isRead: false, reportId: 'report-1' }];
      },
      async markNotificationRead(id, recipientId) {
        calls.push(['markNotificationRead', id, recipientId]);
        if (markReadError) throw markReadError;
        return { id, isRead: true };
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

describe('POST /api/resource-reports', () => {
  test('only Lab Staff can submit a resource problem', async () => {
    const { app, calls } = createContext();
    await request(app).post('/api/resource-reports').send(validReport).expect(401);
    for (const email of ['member@local.test', 'admin@local.test']) {
      const agent = await agentFor(app, email);
      const response = await agent.post('/api/resource-reports').send(validReport).expect(403);
      assert.equal(response.body.error.code, 'FORBIDDEN');
    }
    assert.equal(calls.length, 0);
  });

  test('saves a cleaned report as the signed-in staff member', async () => {
    const { app, calls } = createContext();
    const staff = await agentFor(app, 'staff@local.test');
    const response = await staff.post('/api/resource-reports')
      .send({ ...validReport, description: '  The focus control slips.\u0007  ' })
      .expect(201);
    assert.deepEqual(calls, [['create', validReport, 'staff-1']]);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.status, 'PENDING');
  });

  test('accepts every supported problem type', async () => {
    const { app, calls } = createContext();
    const staff = await agentFor(app, 'staff@local.test');
    for (const problemType of ['INCORRECT_RECORD', 'DAMAGE', 'MALFUNCTION', 'OTHER']) {
      await staff.post('/api/resource-reports').send({ ...validReport, problemType }).expect(201);
    }
    assert.equal(calls.length, 4);
  });

  test('rejects invalid reports before reaching the database', async () => {
    const { app, calls } = createContext();
    const staff = await agentFor(app, 'staff@local.test');
    const invalid = [
      [{ ...validReport, resourceId: 'not-a-uuid' }, 'resourceId'],
      [{ ...validReport, problemType: 'BROKEN' }, 'problemType'],
      [{ ...validReport, description: '   ' }, 'description'],
      [{ ...validReport, description: 'x'.repeat(2001) }, 'description'],
      [{ resourceId, problemType: 'DAMAGE' }, 'description'],
      [{ ...validReport, reporterId: 'admin-1' }, 'request'],
    ];
    for (const [body, field] of invalid) {
      const response = await staff.post('/api/resource-reports').send(body).expect(422);
      assert.equal(response.body.error.code, 'VALIDATION_ERROR');
      assert.ok(response.body.error.details.some((detail) => detail.field === field), field);
    }
    assert.equal(calls.length, 0);
  });

  test('returns safe domain errors from the repository', async () => {
    for (const [code, status] of [
      ['RESOURCE_NOT_FOUND', 404],
      ['RESOURCE_ARCHIVED', 409],
      ['ADMINISTRATOR_UNAVAILABLE', 503],
    ]) {
      const { app } = createContext({ createError: new ResourceReportError(code, status, 'Safe message.') });
      const staff = await agentFor(app, 'staff@local.test');
      const response = await staff.post('/api/resource-reports').send(validReport).expect(status);
      assert.equal(response.body.error.code, code);
      assert.equal(response.body.error.message, 'Safe message.');
    }
  });

  test('hides unexpected failures behind a generic 500', async () => {
    const { app } = createContext({ createError: new Error('connection refused at 10.0.0.5') });
    const staff = await agentFor(app, 'staff@local.test');
    const response = await staff.post('/api/resource-reports').send(validReport).expect(500);
    assert.doesNotMatch(JSON.stringify(response.body), /10\.0\.0\.5/);
  });
});

describe('administrator problem notifications', () => {
  test('only System Administrators can list or mark notifications', async () => {
    const { app, calls } = createContext();
    await request(app).get('/api/admin/resource-report-notifications').expect(401);
    for (const email of ['member@local.test', 'staff@local.test']) {
      const agent = await agentFor(app, email);
      await agent.get('/api/admin/resource-report-notifications').expect(403);
      await agent.patch('/api/admin/resource-report-notifications/7/read').expect(403);
    }
    assert.equal(calls.length, 0);
  });

  test('lists only the signed-in administrator notifications without caching', async () => {
    const { app, calls } = createContext();
    const admin = await agentFor(app, 'admin@local.test');
    const response = await admin.get('/api/admin/resource-report-notifications').expect(200);
    assert.deepEqual(calls, [['listNotifications', 'admin-1']]);
    assert.equal(response.body.data.notifications[0].id, '7');
    assert.match(response.headers['cache-control'], /no-store/);
  });

  test('marks one notification read for the signed-in administrator', async () => {
    const { app, calls } = createContext();
    const admin = await agentFor(app, 'admin@local.test');
    const response = await admin.patch('/api/admin/resource-report-notifications/7/read').expect(200);
    assert.deepEqual(calls, [['markNotificationRead', '7', 'admin-1']]);
    assert.deepEqual(response.body.data, { id: '7', isRead: true });
  });

  test('rejects malformed notification identifiers', async () => {
    const { app, calls } = createContext();
    const admin = await agentFor(app, 'admin@local.test');
    for (const id of ['0', 'abc', '-1', '01', '18446744073709551616']) {
      const response = await admin.patch(`/api/admin/resource-report-notifications/${id}/read`).expect(422);
      assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    }
    assert.equal(calls.length, 0);
  });

  test('returns 404 for a notification the administrator does not own', async () => {
    const { app } = createContext({
      markReadError: new ResourceReportError('NOTIFICATION_NOT_FOUND', 404, 'Not found.'),
    });
    const admin = await agentFor(app, 'admin@local.test');
    const response = await admin.patch('/api/admin/resource-report-notifications/7/read').expect(404);
    assert.equal(response.body.error.code, 'NOTIFICATION_NOT_FOUND');
  });
});

function createConnection({
  resource = { id: resourceId, name: 'BX53 Upright Microscope', archived: 0 },
  notifiedAdministrators = 1,
  failOn,
} = {}) {
  const calls = [];
  return {
    calls,
    async beginTransaction() { calls.push('begin'); },
    async execute(sql, values) {
      calls.push({ sql, values });
      if (failOn && sql.includes(failOn)) throw new Error('write failed');
      if (sql.includes('FROM resources')) return [resource ? [resource] : []];
      if (sql.includes('FROM users WHERE id')) return [[{ displayName: 'Local Lab Staff' }]];
      if (sql.includes('INSERT INTO notifications')) return [{ affectedRows: notifiedAdministrators }];
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

function transactionSteps(connection) {
  return connection.calls.filter((call) => typeof call === 'string');
}

describe('MySQL resource report creation', () => {
  test('saves the report, notifies administrators, and audits it in one transaction', async () => {
    const connection = createConnection();
    const report = await repositoryFor(connection).create(validReport, 'staff-1');

    const calls = sqlCalls(connection);
    assert.match(calls[0].sql, /FOR UPDATE/);
    assert.deepEqual(calls[0].values, [resourceId]);

    const insert = calls.find((call) => call.sql.includes('INSERT INTO resource_reports'));
    assert.match(insert.sql, /'PENDING'/);
    assert.deepEqual(insert.values.slice(0, 5),
      [report.id, resourceId, 'MALFUNCTION', 'The focus control slips.', 'staff-1']);

    const notification = calls.find((call) => call.sql.includes('INSERT INTO notifications'));
    assert.match(notification.sql, /role = 'SYSTEM_ADMIN' AND is_active = TRUE/);
    assert.equal(notification.values[0], report.id);
    assert.equal(notification.values[1], 'A resource problem was reported for BX53 Upright Microscope.');

    const audit = calls.find((call) => call.sql.includes('INSERT INTO audit_logs'));
    assert.match(audit.sql, /'RESOURCE_PROBLEM_REPORTED'/);
    assert.deepEqual(audit.values.slice(0, 2), ['staff-1', report.id]);
    assert.deepEqual(JSON.parse(audit.values[2]), {
      resourceId: { before: null, after: resourceId },
      problemType: { before: null, after: 'MALFUNCTION' },
      description: { before: null, after: 'The focus control slips.' },
      status: { before: null, after: 'PENDING' },
    });

    // The report, its notifications and its audit entry share one timestamp.
    assert.equal(insert.values[5], notification.values[2]);
    assert.equal(insert.values[5], audit.values[3]);

    assert.deepEqual(transactionSteps(connection), ['begin', 'commit', 'release']);
    assert.match(report.id, /^[0-9a-f-]{36}$/);
    assert.deepEqual({ ...report, id: undefined, submittedAt: undefined }, {
      id: undefined,
      resourceId,
      resourceName: 'BX53 Upright Microscope',
      problemType: 'MALFUNCTION',
      description: 'The focus control slips.',
      reporterId: 'staff-1',
      reporterName: 'Local Lab Staff',
      submittedAt: undefined,
      status: 'PENDING',
    });
    assert.equal(report.submittedAt, insert.values[5].toISOString());
  });

  test('rejects missing and archived resources without writing', async () => {
    for (const [resource, code, status] of [
      [null, 'RESOURCE_NOT_FOUND', 404],
      [{ id: resourceId, name: 'Old Microscope', archived: 1 }, 'RESOURCE_ARCHIVED', 409],
    ]) {
      const connection = createConnection({ resource });
      await assert.rejects(
        repositoryFor(connection).create(validReport, 'staff-1'),
        (error) => error instanceof ResourceReportError && error.code === code && error.status === status,
      );
      assert.equal(sqlCalls(connection).some((call) => call.sql.includes('INSERT')), false);
      assert.deepEqual(transactionSteps(connection), ['begin', 'rollback', 'release']);
    }
  });

  test('rolls back the report when no active administrator can be notified', async () => {
    const connection = createConnection({ notifiedAdministrators: 0 });
    await assert.rejects(
      repositoryFor(connection).create(validReport, 'staff-1'),
      (error) => error instanceof ResourceReportError
        && error.code === 'ADMINISTRATOR_UNAVAILABLE' && error.status === 503,
    );
    assert.equal(sqlCalls(connection).some((call) => call.sql.includes('INSERT INTO audit_logs')), false);
    assert.deepEqual(transactionSteps(connection), ['begin', 'rollback', 'release']);
  });

  test('rolls back and releases the connection when a write fails', async () => {
    for (const failOn of ['INSERT INTO resource_reports', 'INSERT INTO notifications', 'INSERT INTO audit_logs']) {
      const connection = createConnection({ failOn });
      await assert.rejects(repositoryFor(connection).create(validReport, 'staff-1'), /write failed/);
      assert.deepEqual(transactionSteps(connection), ['begin', 'rollback', 'release'], failOn);
    }
  });
});

describe('MySQL administrator problem notifications', () => {
  test('lists the recipient notifications unread first with normalised values', async () => {
    const executed = [];
    const repository = createMySqlResourceReportRepository({
      async execute(sql, values) {
        executed.push({ sql, values });
        return [[{
          id: 7,
          message: 'A resource problem was reported for BX53 Upright Microscope.',
          isRead: 0,
          createdAt: new Date('2026-11-08T03:00:00.000Z'),
          reportId: 'report-1',
          submittedAt: '2026-11-08 03:00:00',
          status: 'PENDING',
        }]];
      },
    });

    const [notification] = await repository.listNotifications('admin-1');

    assert.deepEqual(executed[0].values, ['admin-1']);
    assert.match(executed[0].sql, /n\.recipient_user_id = \?/);
    assert.match(executed[0].sql, /ORDER BY n\.is_read ASC, n\.created_at DESC/);
    assert.equal(notification.id, '7');
    assert.equal(notification.isRead, false);
    assert.equal(notification.createdAt, '2026-11-08T03:00:00.000Z');
    assert.match(notification.submittedAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  test('marks only the recipient own notification as read', async () => {
    const executed = [];
    const repository = createMySqlResourceReportRepository({
      async execute(sql, values) {
        executed.push({ sql, values });
        return [{ affectedRows: 1 }];
      },
    });
    assert.deepEqual(await repository.markNotificationRead('7', 'admin-1'), { id: '7', isRead: true });
    assert.deepEqual(executed[0].values, ['7', 'admin-1']);
    assert.match(executed[0].sql, /recipient_user_id = \?/);
  });

  test('reports another administrator notification as not found', async () => {
    const repository = createMySqlResourceReportRepository({
      async execute() { return [{ affectedRows: 0 }]; },
    });
    await assert.rejects(
      repository.markNotificationRead('7', 'admin-2'),
      (error) => error instanceof ResourceReportError && error.code === 'NOTIFICATION_NOT_FOUND',
    );
  });
});
