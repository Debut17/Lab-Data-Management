import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { createMySqlBookingRepository } from '../src/repositories/mysqlBookingRepository.js';

const AUTH_SECRET = 'test-secret-with-enough-entropy-for-tests';
const users = [
  { id: 'user-admin', email: 'admin@local.test', displayName: 'Local Administrator', role: 'SYSTEM_ADMIN' },
  { id: 'user-staff', email: 'staff@local.test', displayName: 'Local Lab Staff', role: 'LAB_STAFF' },
  { id: 'user-member', email: 'member@local.test', displayName: 'Local Lab Member', role: 'LAB_MEMBER' },
  { id: 'user-other', email: 'other@local.test', displayName: 'Other Member', role: 'LAB_MEMBER' },
  { id: 'user-new', email: 'new@local.test', displayName: 'New Member', role: 'LAB_MEMBER' },
];
const bookings = [
  { id: 'booking-1', requesterId: 'user-member', resourceName: 'BX53 Upright Microscope', status: 'PENDING' },
  { id: 'booking-2', requesterId: 'user-member', resourceName: 'High-Speed Centrifuge', status: 'REJECTED', rejectionReason: 'Training required.' },
  { id: 'booking-3', requesterId: 'user-other', resourceName: 'BX53 Upright Microscope', status: 'APPROVED' },
];

function createMyBookingsContext({ listError } = {}) {
  const requests = [];
  const app = createApp({
    bookingRepository: {
      async listByRequester(requesterId) {
        if (listError) throw listError;
        requests.push(requesterId);
        return bookings.filter((booking) => booking.requesterId === requesterId);
      },
    },
    resourceRepository: { async create() {}, async listBookable() { return []; } },
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
  return { app, requests };
}

async function login(agent, email) {
  await agent.post('/api/auth/dev-login').send({ email }).expect(200);
}

describe('US-5 my bookings API', () => {
  test('requires authentication and a Lab Member role', async () => {
    const { app, requests } = createMyBookingsContext();

    await request(app).get('/api/bookings').expect(401);
    for (const email of ['admin@local.test', 'staff@local.test']) {
      const agent = request.agent(app);
      await login(agent, email);
      const response = await agent.get('/api/bookings').expect(403);
      assert.equal(response.body.error.message, 'Lab Member access is required.');
    }

    assert.equal(requests.length, 0);
  });

  test('returns only the signed-in member\'s bookings with their current status', async () => {
    const { app, requests } = createMyBookingsContext();
    const agent = request.agent(app);
    await login(agent, 'member@local.test');

    const response = await agent.get('/api/bookings').expect(200);

    assert.deepEqual(requests, ['user-member']);
    assert.deepEqual(
      response.body.data.bookings.map((booking) => [booking.id, booking.status]),
      [['booking-1', 'PENDING'], ['booking-2', 'REJECTED']],
    );
    assert.equal(response.body.data.bookings[1].rejectionReason, 'Training required.');
  });

  test('ignores attempts to choose another requester through the query string', async () => {
    const { app, requests } = createMyBookingsContext();
    const agent = request.agent(app);
    await login(agent, 'member@local.test');

    const response = await agent.get('/api/bookings?requesterId=user-other').expect(200);

    assert.deepEqual(requests, ['user-member']);
    assert.ok(response.body.data.bookings.every((booking) => booking.requesterId === 'user-member'));
  });

  test('returns an empty list when the member has no bookings', async () => {
    const { app } = createMyBookingsContext();
    const agent = request.agent(app);
    await login(agent, 'new@local.test');

    const response = await agent.get('/api/bookings').expect(200);

    assert.deepEqual(response.body.data.bookings, []);
  });

  test('hides internal details when bookings cannot be loaded', async () => {
    const { app } = createMyBookingsContext({
      listError: new Error('database password leaked in stack'),
    });
    const agent = request.agent(app);
    await login(agent, 'member@local.test');

    const response = await agent.get('/api/bookings').expect(500);

    assert.equal(response.body.error.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(JSON.stringify(response.body), /database password/i);
  });
});

describe('MySQL booking repository - requester history', () => {
  test('filters by requester and orders by newest request first', async () => {
    const queries = [];
    const repository = createMySqlBookingRepository({
      async execute(sql, values) {
        queries.push({ sql, values });
        return [[{
          id: 'booking-2',
          resourceId: 'resource-2',
          resourceName: 'High-Speed Centrifuge',
          requesterId: 'user-member',
          requesterName: 'Local Lab Member',
          requesterEmail: 'member@local.test',
          startTime: new Date('2026-10-12T02:00:00.000Z'),
          endTime: new Date('2026-10-12T04:00:00.000Z'),
          status: 'REJECTED',
          rejectionReason: 'Training required.',
          reviewedBy: 'user-admin',
          reviewedAt: new Date('2026-10-05T09:00:00.000Z'),
          createdAt: new Date('2026-10-04T12:00:00.000Z'),
          updatedAt: new Date('2026-10-05T09:00:00.000Z'),
        }]];
      },
    });

    const result = await repository.listByRequester('user-member');

    assert.match(queries[0].sql, /WHERE b\.requester_id = \?/);
    assert.match(queries[0].sql, /ORDER BY b\.created_at DESC/);
    assert.deepEqual(queries[0].values, ['user-member']);
    assert.equal(result.length, 1);
    assert.equal(result[0].status, 'REJECTED');
    assert.equal(result[0].rejectionReason, 'Training required.');
    assert.equal(result[0].startTime, '2026-10-12T02:00:00.000Z');
    assert.equal(result[0].reviewedAt, '2026-10-05T09:00:00.000Z');
    assert.equal(result[0].reviewedBy, 'user-admin');
  });
});
