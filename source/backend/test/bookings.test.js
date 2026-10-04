import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { BookingRepositoryError } from '../src/repositories/mysqlBookingRepository.js';

const AUTH_SECRET = 'test-secret-with-enough-entropy-for-tests';
const resourceId = '10000000-0000-4000-8000-000000000001';
const validBooking = {
  resourceId,
  startTime: '2026-10-10T02:00:00.000Z',
  endTime: '2026-10-10T04:00:00.000Z',
};

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
  const createdBookings = [];
  const resources = [{
    id: resourceId,
    name: 'BX53 Upright Microscope',
    category: 'Microscope',
    location: 'Biology Lab A',
    availabilityStatus: 'AVAILABLE',
    currentStatus: 'OPERATIONAL',
  }];
  const app = createApp({
    authSecret: AUTH_SECRET,
    allowDevLogin: true,
    logger: { error() {} },
    userRepository: {
      async findByEmail(email) {
        return users.find((user) => user.email === email) ?? null;
      },
    },
    resourceRepository: {
      async listBookable() { return resources; },
      async create() {},
    },
    bookingRepository: {
      async create(booking, requesterId) {
        if (createError) throw createError;
        createdBookings.push({ booking, requesterId });
        return {
          id: 'booking-1',
          ...booking,
          requesterId,
          resourceName: 'BX53 Upright Microscope',
          status: 'PENDING',
        };
      },
    },
  });
  return { app, createdBookings, resources };
}

async function login(agent, email) {
  await agent.post('/api/auth/dev-login').send({ email }).expect(200);
}

describe('US-4 booking API', () => {
  test('lists bookable resources for an authenticated user', async () => {
    const { app, resources } = createTestContext();
    const agent = request.agent(app);
    await login(agent, 'member@local.test');

    const response = await agent.get('/api/resources').expect(200);

    assert.deepEqual(response.body.data, resources);
  });

  test('requires authentication and a Lab Member role', async () => {
    const { app, createdBookings } = createTestContext();

    await request(app).post('/api/bookings').send(validBooking).expect(401);

    const administrator = request.agent(app);
    await login(administrator, 'admin@local.test');
    const response = await administrator.post('/api/bookings').send(validBooking).expect(403);

    assert.equal(response.body.error.message, 'Lab Member access is required.');
    assert.equal(createdBookings.length, 0);
  });

  test('creates a pending request for the signed-in member', async () => {
    const { app, createdBookings } = createTestContext();
    const agent = request.agent(app);
    await login(agent, 'member@local.test');

    const response = await agent.post('/api/bookings').send(validBooking).expect(201);

    assert.equal(response.body.data.status, 'PENDING');
    assert.equal(response.body.data.requesterId, 'user-member');
    assert.equal(createdBookings[0].requesterId, 'user-member');
    assert.deepEqual(createdBookings[0].booking, validBooking);
  });

  test('rejects missing fields, extra fields, and an invalid time period', async () => {
    const { app, createdBookings } = createTestContext();
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
      const { app } = createTestContext({
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
