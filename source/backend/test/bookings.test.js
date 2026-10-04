import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';

import { createApp } from '../src/app.js';
import {
  BookingDecisionError,
  BookingRepositoryError,
} from '../src/repositories/mysqlBookingRepository.js';

const AUTH_SECRET = 'test-secret-with-enough-entropy-for-tests';
const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const RESOURCE_ID = '10000000-0000-4000-8000-000000000001';
const validBooking = {
  resourceId: RESOURCE_ID,
  startTime: '2026-10-10T02:00:00.000Z',
  endTime: '2026-10-10T04:00:00.000Z',
};
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
const resources = [{
  id: RESOURCE_ID,
  name: 'BX53 Upright Microscope',
  category: 'Microscope',
  location: 'Biology Lab A',
  availabilityStatus: 'AVAILABLE',
  currentStatus: 'OPERATIONAL',
}];
const pendingBooking = {
  id: BOOKING_ID,
  resourceId: RESOURCE_ID,
  resourceName: 'BX53 Upright Microscope',
  requesterId: 'user-member',
  requesterName: 'Local Lab Member',
  requesterEmail: 'member@local.test',
  startTime: validBooking.startTime,
  endTime: validBooking.endTime,
  status: 'PENDING',
  createdAt: '2026-10-04T12:00:00.000Z',
};

const userRepository = {
  async findByEmail(email) {
    return users.find((user) => user.email === email) ?? null;
  },
};

async function login(agent, email) {
  await agent.post('/api/auth/dev-login').send({ email }).expect(200);
}

function createAdminReviewContext({ listError, decideError } = {}) {
  const decisions = [];
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
  const app = createApp({
    bookingRepository,
    resourceRepository: { async create() {}, async listBookable() { return resources; } },
    userRepository,
    authSecret: AUTH_SECRET,
    allowDevLogin: true,
    logger: { error() {} },
  });

  return { app, decisions };
}

function createBookingRequestContext({ createError } = {}) {
  const createdBookings = [];
  const app = createApp({
    authSecret: AUTH_SECRET,
    allowDevLogin: true,
    logger: { error() {} },
    userRepository,
    resourceRepository: {
      async listBookable() { return resources; },
      async create() {},
    },
    bookingRepository: {
      async create(booking, requesterId) {
        if (createError) throw createError;
        createdBookings.push({ booking, requesterId });
        return {
          id: BOOKING_ID,
          ...booking,
          requesterId,
          resourceName: resources[0].name,
          status: 'PENDING',
        };
      },
    },
  });
  return { app, createdBookings };
}

function createWorkflowContext() {
  const pending = [];
  const bookingRepository = {
    async create(booking, requesterId) {
      const created = {
        ...pendingBooking,
        ...booking,
        requesterId,
      };
      pending.push(created);
      return created;
    },
    async listPending() {
      return pending.filter((booking) => booking.status === 'PENDING');
    },
    async decide(id, decision, reviewerId) {
      const booking = pending.find((candidate) => candidate.id === id);
      booking.status = decision.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      booking.rejectionReason = decision.reason;
      booking.reviewedBy = reviewerId;
      return booking;
    },
  };

  return createApp({
    bookingRepository,
    resourceRepository: { async create() {}, async listBookable() { return resources; } },
    userRepository,
    authSecret: AUTH_SECRET,
    allowDevLogin: true,
    logger: { error() {} },
  });
}

describe('US-4 booking API', () => {
  test('lists bookable resources for an authenticated user', async () => {
    const { app } = createBookingRequestContext();
    const agent = request.agent(app);
    await login(agent, 'member@local.test');

    const response = await agent.get('/api/resources').expect(200);

    assert.deepEqual(response.body.data, resources);
  });

  test('requires authentication and a Lab Member role', async () => {
    const { app, createdBookings } = createBookingRequestContext();

    await request(app).post('/api/bookings').send(validBooking).expect(401);

    const administrator = request.agent(app);
    await login(administrator, 'admin@local.test');
    const response = await administrator.post('/api/bookings').send(validBooking).expect(403);

    assert.equal(response.body.error.message, 'Lab Member access is required.');
    assert.equal(createdBookings.length, 0);
  });

  test('creates a pending request for the signed-in member', async () => {
    const { app, createdBookings } = createBookingRequestContext();
    const agent = request.agent(app);
    await login(agent, 'member@local.test');

    const response = await agent.post('/api/bookings').send(validBooking).expect(201);

    assert.equal(response.body.data.status, 'PENDING');
    assert.equal(response.body.data.requesterId, 'user-member');
    assert.equal(createdBookings[0].requesterId, 'user-member');
    assert.deepEqual(createdBookings[0].booking, validBooking);
  });

  test('rejects missing fields, extra fields, and an invalid time period', async () => {
    const { app, createdBookings } = createBookingRequestContext();
    const agent = request.agent(app);
    await login(agent, 'member@local.test');

    const missing = await agent.post('/api/bookings').send({}).expect(422);
    const invalidPeriod = await agent
      .post('/api/bookings')
      .send({ ...validBooking, endTime: validBooking.startTime })
      .expect(422);
    const injectedRequester = await agent
      .post('/api/bookings')
      .send({ ...validBooking, requesterId: 'another-user' })
      .expect(422);

    assert.equal(missing.body.error.code, 'VALIDATION_ERROR');
    assert.ok(missing.body.error.details.some(({ field }) => field === 'resourceId'));
    assert.deepEqual(invalidPeriod.body.error.details, [{
      field: 'endTime',
      message: 'End time must be after start time.',
    }]);
    assert.equal(injectedRequester.body.error.code, 'VALIDATION_ERROR');
    assert.equal(createdBookings.length, 0);
  });

  for (const [code, status] of [
    ['RESOURCE_NOT_FOUND', 404],
    ['RESOURCE_UNAVAILABLE', 409],
    ['BOOKING_CONFLICT', 409],
  ]) {
    test(`returns a clear ${code} reason`, async () => {
      const { app } = createBookingRequestContext({
        createError: new BookingRepositoryError(code, `Reason for ${code}`),
      });
      const agent = request.agent(app);
      await login(agent, 'member@local.test');

      const response = await agent.post('/api/bookings').send(validBooking).expect(status);

      assert.equal(response.body.error.code, code);
      assert.equal(response.body.error.message, `Reason for ${code}`);
    });
  }
});

describe('GET /api/admin/bookings', () => {
  test('requires an authenticated System Administrator', async () => {
    const { app } = createAdminReviewContext();

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
    const { app } = createAdminReviewContext();
    const admin = request.agent(app);
    await login(admin, 'admin@local.test');

    const response = await admin
      .get('/api/admin/bookings?status=PENDING')
      .expect(200);

    assert.equal(response.body.success, true);
    assert.deepEqual(response.body.data.bookings, [pendingBooking]);
  });

  test('rejects unsupported filters and hides persistence failures', async () => {
    const { app } = createAdminReviewContext({
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
    const { app, decisions } = createAdminReviewContext();

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
    const { app, decisions } = createAdminReviewContext();
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
    const { app, decisions } = createAdminReviewContext();
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
    const { app, decisions } = createAdminReviewContext();
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
      const { app } = createAdminReviewContext({
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

describe('US-4 to US-12 workflow', () => {
  test('moves a member request through the pending queue into an approved decision', async () => {
    const app = createWorkflowContext();
    const member = request.agent(app);
    const admin = request.agent(app);
    await login(member, 'member@local.test');
    await login(admin, 'admin@local.test');

    const created = await member.post('/api/bookings').send(validBooking).expect(201);
    const pending = await admin.get('/api/admin/bookings?status=PENDING').expect(200);
    const approved = await admin
      .patch(`/api/admin/bookings/${created.body.data.id}`)
      .send({ decision: 'APPROVE' })
      .expect(200);
    const remaining = await admin.get('/api/admin/bookings?status=PENDING').expect(200);

    assert.equal(created.body.data.status, 'PENDING');
    assert.equal(pending.body.data.bookings[0].id, created.body.data.id);
    assert.equal(approved.body.data.status, 'APPROVED');
    assert.deepEqual(remaining.body.data.bookings, []);
  });
});
