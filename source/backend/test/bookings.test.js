import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { BookingDecisionError } from '../src/repositories/mysqlBookingRepository.js';

const AUTH_SECRET = 'test-secret-with-enough-entropy-for-tests';
const BOOKING_ID = '11111111-1111-4111-8111-111111111111';

const pendingBooking = {
  id: BOOKING_ID,
  resourceId: '22222222-2222-4222-8222-222222222222',
  resourceName: 'Confocal Microscope',
  requesterId: 'user-member',
  requesterName: 'Local Lab Member',
  requesterEmail: 'member@local.test',
  startTime: '2026-10-10T02:00:00.000Z',
  endTime: '2026-10-10T04:00:00.000Z',
  status: 'PENDING',
  createdAt: '2026-10-04T12:00:00.000Z',
};

function createTestContext({ listError, decideError } = {}) {
  const decisions = [];
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
  const bookingRepository = {
    async listPending() {
      if (listError) throw listError;
      return [pendingBooking];
    },
    async decide(id, decision, reviewerId) {
      if (decideError) throw decideError;
      decisions.push({ id, decision, reviewerId });
      return {
        ...pendingBooking,
        status: decision.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        rejectionReason: decision.reason ?? null,
        reviewedBy: reviewerId,
        reviewedAt: '2026-10-04T13:00:00.000Z',
      };
    },
  };
  const userRepository = {
    async findByEmail(email) {
      return users.find((user) => user.email === email) ?? null;
    },
  };
  const app = createApp({
    bookingRepository,
    resourceRepository: { async create() {} },
    userRepository,
    authSecret: AUTH_SECRET,
    allowDevLogin: true,
    logger: { error() {} },
  });

  return { app, decisions };
}

async function login(agent, email) {
  await agent.post('/api/auth/dev-login').send({ email }).expect(200);
}

describe('GET /api/admin/bookings', () => {
  test('requires an authenticated System Administrator', async () => {
    const { app } = createTestContext();

    const unauthenticated = await request(app)
      .get('/api/admin/bookings?status=PENDING')
      .expect(401);

    const member = request.agent(app);
    await login(member, 'member@local.test');
    const forbidden = await member
      .get('/api/admin/bookings?status=PENDING')
      .expect(403);

    assert.equal(unauthenticated.body.error.code, 'UNAUTHENTICATED');
    assert.equal(forbidden.body.error.code, 'FORBIDDEN');
  });

  test('returns pending requests to an administrator', async () => {
    const { app } = createTestContext();
    const admin = request.agent(app);
    await login(admin, 'admin@local.test');

    const response = await admin
      .get('/api/admin/bookings?status=PENDING')
      .expect(200);

    assert.equal(response.body.success, true);
    assert.deepEqual(response.body.data.bookings, [pendingBooking]);
  });

  test('rejects unsupported filters and hides persistence failures', async () => {
    const { app } = createTestContext({
      listError: new Error('database password appeared here'),
    });
    const admin = request.agent(app);
    await login(admin, 'admin@local.test');

    const invalid = await admin
      .get('/api/admin/bookings?status=APPROVED')
      .expect(422);
    const failed = await admin
      .get('/api/admin/bookings?status=PENDING')
      .expect(500);

    assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');
    assert.equal(failed.body.error.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(JSON.stringify(failed.body), /database password/i);
  });
});

describe('PATCH /api/admin/bookings/:id', () => {
  test('requires an authenticated System Administrator', async () => {
    const { app, decisions } = createTestContext();

    await request(app)
      .patch(`/api/admin/bookings/${BOOKING_ID}`)
      .send({ decision: 'APPROVE' })
      .expect(401);

    const member = request.agent(app);
    await login(member, 'member@local.test');
    await member
      .patch(`/api/admin/bookings/${BOOKING_ID}`)
      .send({ decision: 'APPROVE' })
      .expect(403);

    assert.equal(decisions.length, 0);
  });

  test('approves a pending request using the authenticated administrator', async () => {
    const { app, decisions } = createTestContext();
    const admin = request.agent(app);
    await login(admin, 'admin@local.test');

    const response = await admin
      .patch(`/api/admin/bookings/${BOOKING_ID}`)
      .send({ decision: 'APPROVE' })
      .expect(200);

    assert.equal(response.body.data.status, 'APPROVED');
    assert.deepEqual(decisions, [{
      id: BOOKING_ID,
      decision: { decision: 'APPROVE', reason: null },
      reviewerId: 'user-admin',
    }]);
  });

  test('rejects a request with a normalized non-blank reason', async () => {
    const { app, decisions } = createTestContext();
    const admin = request.agent(app);
    await login(admin, 'admin@local.test');

    const response = await admin
      .patch(`/api/admin/bookings/${BOOKING_ID}`)
      .send({ decision: 'REJECT', reason: '  Required training is incomplete.  ' })
      .expect(200);

    assert.equal(response.body.data.status, 'REJECTED');
    assert.equal(decisions[0].decision.reason, 'Required training is incomplete.');
  });

  test('rejects invalid identifiers, decisions, reasons, and extra fields', async () => {
    const { app, decisions } = createTestContext();
    const admin = request.agent(app);
    await login(admin, 'admin@local.test');

    const invalidId = await admin
      .patch('/api/admin/bookings/not-a-uuid')
      .send({ decision: 'APPROVE' })
      .expect(422);
    const invalidDecision = await admin
      .patch(`/api/admin/bookings/${BOOKING_ID}`)
      .send({ decision: 'CANCEL' })
      .expect(422);
    const blankReason = await admin
      .patch(`/api/admin/bookings/${BOOKING_ID}`)
      .send({ decision: 'REJECT', reason: '   ' })
      .expect(422);
    const longReason = await admin
      .patch(`/api/admin/bookings/${BOOKING_ID}`)
      .send({ decision: 'REJECT', reason: 'x'.repeat(1001) })
      .expect(422);
    const extraField = await admin
      .patch(`/api/admin/bookings/${BOOKING_ID}`)
      .send({ decision: 'APPROVE', reviewerId: 'attacker-selected-user' })
      .expect(422);

    assert.equal(invalidId.body.error.code, 'VALIDATION_ERROR');
    assert.equal(invalidDecision.body.error.code, 'VALIDATION_ERROR');
    assert.equal(blankReason.body.error.code, 'VALIDATION_ERROR');
    assert.equal(longReason.body.error.code, 'VALIDATION_ERROR');
    assert.equal(extraField.body.error.code, 'VALIDATION_ERROR');
    assert.equal(decisions.length, 0);
  });

  test('maps safe not-found, stale-decision, and conflict errors', async () => {
    const cases = [
      ['BOOKING_NOT_FOUND', 404],
      ['BOOKING_ALREADY_DECIDED', 409],
      ['BOOKING_CONFLICT', 409],
    ];

    for (const [code, status] of cases) {
      const { app } = createTestContext({
        decideError: new BookingDecisionError(code),
      });
      const admin = request.agent(app);
      await login(admin, 'admin@local.test');

      const response = await admin
        .patch(`/api/admin/bookings/${BOOKING_ID}`)
        .send({ decision: 'APPROVE' })
        .expect(status);

      assert.equal(response.body.error.code, code);
      assert.doesNotMatch(JSON.stringify(response.body), /sql|database/i);
    }
  });
});
