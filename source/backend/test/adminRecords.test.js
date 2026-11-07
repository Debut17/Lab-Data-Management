import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { createMySqlAdminRecordsRepository } from '../src/repositories/mysqlAdminRecordsRepository.js';

const AUTH_SECRET = 'test-secret-with-enough-entropy-for-tests';
const users = [
  { id: 'user-admin', email: 'admin@local.test', displayName: 'Local Administrator', role: 'SYSTEM_ADMIN' },
  { id: 'user-member', email: 'member@local.test', displayName: 'Local Lab Member', role: 'LAB_MEMBER' },
  { id: 'user-staff', email: 'staff@local.test', displayName: 'Local Lab Staff', role: 'LAB_STAFF' },
];
const summary = {
  resources: { total: 3, active: 2, archived: 1, unavailable: 1 },
  bookings: { total: 4, byStatus: { PENDING: 1, APPROVED: 1, REJECTED: 1, CANCELLED: 1 } },
  users: { total: 3, byRole: { SYSTEM_ADMIN: 1, LAB_STAFF: 1, LAB_MEMBER: 1 } },
  issueReports: null,
  auditLogs: { total: 12, lastSevenDays: 5 },
};

function createRecordsContext({ summaryError } = {}) {
  const bookingQueries = [];
  const app = createApp({
    adminRecordsRepository: {
      async summary() {
        if (summaryError) throw summaryError;
        return summary;
      },
      async listBookings(query) {
        bookingQueries.push(query);
        return [{ id: 'booking-1', status: 'APPROVED', resourceName: 'BX53 Upright Microscope' }];
      },
    },
    resourceRepository: { async create() {} },
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
  return { app, bookingQueries };
}

async function login(agent, email) {
  await agent.post('/api/auth/dev-login').send({ email }).expect(200);
}

describe('US-17 administrative records API', () => {
  test('requires authentication and a System Administrator role', async () => {
    const { app, bookingQueries } = createRecordsContext();

    await request(app).get('/api/admin/records/summary').expect(401);
    await request(app).get('/api/admin/records/bookings').expect(401);
    for (const email of ['member@local.test', 'staff@local.test']) {
      const agent = request.agent(app);
      await login(agent, email);
      await agent.get('/api/admin/records/summary').expect(403);
      await agent.get('/api/admin/records/bookings').expect(403);
    }

    assert.equal(bookingQueries.length, 0);
  });

  test('returns the record summary without caching it', async () => {
    const { app } = createRecordsContext();
    const admin = request.agent(app);
    await login(admin, 'admin@local.test');

    const response = await admin.get('/api/admin/records/summary').expect(200);

    assert.deepEqual(response.body.data, summary);
    assert.match(response.headers['cache-control'], /no-store/);
  });

  test('lists all bookings by default and filters by a supported status', async () => {
    const { app, bookingQueries } = createRecordsContext();
    const admin = request.agent(app);
    await login(admin, 'admin@local.test');

    const all = await admin.get('/api/admin/records/bookings').expect(200);
    const approved = await admin.get('/api/admin/records/bookings?status=APPROVED').expect(200);

    assert.deepEqual(bookingQueries, [{ status: 'ALL' }, { status: 'APPROVED' }]);
    assert.equal(all.body.data.status, 'ALL');
    assert.equal(approved.body.data.bookings[0].id, 'booking-1');
  });

  test('rejects unknown statuses and query fields', async () => {
    const { app, bookingQueries } = createRecordsContext();
    const admin = request.agent(app);
    await login(admin, 'admin@local.test');

    const badStatus = await admin.get('/api/admin/records/bookings?status=DONE').expect(422);
    await admin.get('/api/admin/records/bookings?requesterId=user-member').expect(422);

    assert.equal(badStatus.body.error.code, 'VALIDATION_ERROR');
    assert.equal(bookingQueries.length, 0);
  });

  test('hides internal details when the summary fails', async () => {
    const { app } = createRecordsContext({ summaryError: new Error('database password leaked') });
    const admin = request.agent(app);
    await login(admin, 'admin@local.test');

    const response = await admin.get('/api/admin/records/summary').expect(500);

    assert.equal(response.body.error.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(JSON.stringify(response.body), /database password/i);
  });
});

function createPool({ issueTableExists = false, issueQueryError = null, bookingRows = [] } = {}) {
  const queries = [];
  return {
    queries,
    async execute(sql, values) {
      queries.push({ sql, values });
      if (sql.includes('FROM resources') && sql.includes('COUNT')) {
        return [[{ total: 3, active: '2', archived: '1', unavailable: '1' }]];
      }
      if (sql.includes('FROM bookings GROUP BY status')) {
        return [[{ status: 'PENDING', total: 2 }, { status: 'APPROVED', total: 1 }]];
      }
      if (sql.includes('FROM users')) {
        return [[{ role: 'SYSTEM_ADMIN', total: 1 }, { role: 'LAB_MEMBER', total: 4 }]];
      }
      if (sql.includes('FROM audit_logs')) {
        return [[{ total: 9, lastSevenDays: '3' }]];
      }
      if (sql.includes('information_schema.tables')) {
        return [[{ total: issueTableExists ? 1 : 0 }]];
      }
      if (sql.includes('FROM issue_reports')) {
        if (issueQueryError) throw issueQueryError;
        return [[{ status: 'PENDING', total: 2 }, { status: 'RESOLVED', total: 1 }]];
      }
      if (sql.includes('FROM bookings b')) {
        return [bookingRows];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

describe('MySQL administrative records repository', () => {
  test('summarises resources, bookings, active users, and audit activity', async () => {
    const pool = createPool();
    const now = new Date('2026-11-07T12:00:00.000Z');

    const result = await createMySqlAdminRecordsRepository(pool).summary(now);

    assert.deepEqual(result.resources, { total: 3, active: 2, archived: 1, unavailable: 1 });
    assert.deepEqual(result.bookings, {
      total: 3,
      byStatus: { PENDING: 2, APPROVED: 1, REJECTED: 0, CANCELLED: 0 },
    });
    assert.deepEqual(result.users, {
      total: 5,
      byRole: { SYSTEM_ADMIN: 1, LAB_STAFF: 0, LAB_MEMBER: 4 },
    });
    assert.deepEqual(result.auditLogs, { total: 9, lastSevenDays: 3 });
    assert.equal(result.issueReports, null);
    const audit = pool.queries.find((query) => query.sql.includes('FROM audit_logs'));
    assert.equal(audit.values[0].toISOString(), '2026-10-31T12:00:00.000Z');
    const userQuery = pool.queries.find((query) => query.sql.includes('FROM users'));
    assert.match(userQuery.sql, /is_active = TRUE/);
  });

  test('includes issue report counts once the US-7 table exists', async () => {
    const result = await createMySqlAdminRecordsRepository(createPool({ issueTableExists: true })).summary();

    assert.deepEqual(result.issueReports, { total: 3, byStatus: { PENDING: 2, RESOLVED: 1 } });
  });

  test('treats an incompatible issue table as unavailable instead of failing', async () => {
    const pool = createPool({ issueTableExists: true, issueQueryError: new Error('Unknown column status') });

    const result = await createMySqlAdminRecordsRepository(pool).summary();

    assert.equal(result.issueReports, null);
    assert.equal(result.resources.total, 3);
  });

  test('lists bookings newest first with an optional status filter', async () => {
    const pool = createPool({
      bookingRows: [{
        id: 'booking-1',
        resourceName: 'BX53 Upright Microscope',
        resourceArchived: 1,
        requesterName: 'Local Lab Member',
        requesterEmail: 'member@local.test',
        startTime: new Date('2026-11-10T02:00:00.000Z'),
        endTime: new Date('2026-11-10T04:00:00.000Z'),
        status: 'REJECTED',
        rejectionReason: 'Training required.',
        reviewerName: 'Local Administrator',
        reviewedAt: new Date('2026-11-07T03:00:00.000Z'),
        createdAt: new Date('2026-11-06T03:00:00.000Z'),
      }],
    });
    const repository = createMySqlAdminRecordsRepository(pool);

    const all = await repository.listBookings({ status: 'ALL' });
    await repository.listBookings({ status: 'REJECTED' });

    const [allQuery, filteredQuery] = pool.queries;
    assert.doesNotMatch(allQuery.sql, /WHERE b\.status/);
    assert.deepEqual(allQuery.values, []);
    assert.match(filteredQuery.sql, /WHERE b\.status = \?/);
    assert.deepEqual(filteredQuery.values, ['REJECTED']);
    assert.match(allQuery.sql, /ORDER BY b\.created_at DESC/);
    assert.match(allQuery.sql, /LIMIT 200/);
    assert.equal(all[0].resourceArchived, true);
    assert.equal(all[0].reviewerName, 'Local Administrator');
    assert.equal(all[0].startTime, '2026-11-10T02:00:00.000Z');
  });
});
