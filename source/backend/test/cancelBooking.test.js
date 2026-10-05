import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';

import { createApp } from '../src/app.js';
import {
  BookingRepositoryError,
  createMySqlBookingRepository,
} from '../src/repositories/mysqlBookingRepository.js';

const AUTH_SECRET = 'test-secret-with-enough-entropy-for-tests';
const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const users = [
  { id: 'user-admin', email: 'admin@local.test', displayName: 'Local Administrator', role: 'SYSTEM_ADMIN' },
  { id: 'user-staff', email: 'staff@local.test', displayName: 'Local Lab Staff', role: 'LAB_STAFF' },
  { id: 'user-member', email: 'member@local.test', displayName: 'Local Lab Member', role: 'LAB_MEMBER' },
];

function createCancelContext({ cancelError } = {}) {
  const cancellations = [];
  const app = createApp({
    bookingRepository: {
      async cancel(id, requesterId) {
        if (cancelError) throw cancelError;
        cancellations.push({ id, requesterId });
        return { id, status: 'CANCELLED', updatedAt: '2026-10-05T10:00:00.000Z' };
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
  return { app, cancellations };
}

async function memberAgent(app) {
  const agent = request.agent(app);
  await agent.post('/api/auth/dev-login').send({ email: 'member@local.test' }).expect(200);
  return agent;
}

describe('US-6 cancel booking API', () => {
  test('requires authentication and a Lab Member role', async () => {
    const { app, cancellations } = createCancelContext();

    await request(app).delete(`/api/bookings/${BOOKING_ID}`).expect(401);
    for (const email of ['admin@local.test', 'staff@local.test']) {
      const agent = request.agent(app);
      await agent.post('/api/auth/dev-login').send({ email }).expect(200);
      const response = await agent.delete(`/api/bookings/${BOOKING_ID}`).expect(403);
      assert.equal(response.body.error.code, 'FORBIDDEN');
    }

    assert.equal(cancellations.length, 0);
  });

  test('cancels a booking for the signed-in member', async () => {
    const { app, cancellations } = createCancelContext();
    const agent = await memberAgent(app);

    const response = await agent.delete(`/api/bookings/${BOOKING_ID}`).expect(200);

    assert.deepEqual(cancellations, [{ id: BOOKING_ID, requesterId: 'user-member' }]);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.status, 'CANCELLED');
  });

  test('rejects an invalid booking identifier', async () => {
    const { app, cancellations } = createCancelContext();
    const agent = await memberAgent(app);

    const response = await agent.delete('/api/bookings/not-a-uuid').expect(422);

    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    assert.equal(cancellations.length, 0);
  });

  for (const [code, status] of [
    ['BOOKING_NOT_FOUND', 404],
    ['BOOKING_FORBIDDEN', 403],
    ['BOOKING_CANNOT_CANCEL', 409],
  ]) {
    test(`returns ${status} ${code}`, async () => {
      const { app } = createCancelContext({
        cancelError: new BookingRepositoryError(code, `Message for ${code}.`),
      });
      const agent = await memberAgent(app);

      const response = await agent.delete(`/api/bookings/${BOOKING_ID}`).expect(status);

      assert.equal(response.body.error.code, code);
      assert.equal(response.body.error.message, `Message for ${code}.`);
    });
  }

  test('hides internal details when cancellation fails unexpectedly', async () => {
    const { app } = createCancelContext({
      cancelError: new Error('database password leaked in stack'),
    });
    const agent = await memberAgent(app);

    const response = await agent.delete(`/api/bookings/${BOOKING_ID}`).expect(500);

    assert.equal(response.body.error.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(JSON.stringify(response.body), /database password/i);
  });
});

function createCancelConnection({ booking, updateError } = {}) {
  const calls = [];
  return {
    calls,
    async beginTransaction() { calls.push('begin'); },
    async execute(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FROM bookings') && sql.includes('FOR UPDATE')) {
        return [booking ? [booking] : []];
      }
      if (updateError && sql.includes('UPDATE bookings')) throw updateError;
      return [{ affectedRows: 1 }];
    },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); },
  };
}

function repositoryFor(connection) {
  return createMySqlBookingRepository({
    async getConnection() { return connection; },
  });
}

describe('MySQL booking repository - cancel', () => {
  test('cancels a pending booking and writes an audit entry atomically', async () => {
    const connection = createCancelConnection({
      booking: { id: BOOKING_ID, requesterId: 'user-member', status: 'PENDING' },
    });

    const result = await repositoryFor(connection).cancel(BOOKING_ID, 'user-member');

    const statements = connection.calls.filter((call) => typeof call === 'object');
    const update = statements.find((call) => call.sql.includes('UPDATE bookings'));
    const audit = statements.find((call) => call.sql.includes('INSERT INTO audit_logs'));
    assert.match(update.sql, /SET status = 'CANCELLED'/);
    assert.match(update.sql, /AND status = 'PENDING'/);
    assert.equal(update.values[1], BOOKING_ID);
    assert.match(audit.sql, /'BOOKING_CANCELLED'/);
    assert.deepEqual([audit.values[0], audit.values[1]], ['user-member', BOOKING_ID]);
    assert.equal(connection.calls.at(-2), 'commit');
    assert.equal(connection.calls.at(-1), 'release');
    assert.equal(result.id, BOOKING_ID);
    assert.equal(result.status, 'CANCELLED');
    assert.match(result.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  });

  for (const [name, booking, code] of [
    ['a missing booking', null, 'BOOKING_NOT_FOUND'],
    ['another member\'s booking', { id: BOOKING_ID, requesterId: 'user-other', status: 'PENDING' }, 'BOOKING_FORBIDDEN'],
    ['an approved booking', { id: BOOKING_ID, requesterId: 'user-member', status: 'APPROVED' }, 'BOOKING_CANNOT_CANCEL'],
    ['a rejected booking', { id: BOOKING_ID, requesterId: 'user-member', status: 'REJECTED' }, 'BOOKING_CANNOT_CANCEL'],
    ['an already cancelled booking', { id: BOOKING_ID, requesterId: 'user-member', status: 'CANCELLED' }, 'BOOKING_CANNOT_CANCEL'],
  ]) {
    test(`rolls back for ${name}`, async () => {
      const connection = createCancelConnection({ booking });

      await assert.rejects(
        repositoryFor(connection).cancel(BOOKING_ID, 'user-member'),
        (error) => error instanceof BookingRepositoryError && error.code === code,
      );

      assert.ok(!connection.calls.some((call) => call.sql?.includes('UPDATE bookings')));
      assert.ok(connection.calls.includes('rollback'));
      assert.ok(!connection.calls.includes('commit'));
      assert.equal(connection.calls.at(-1), 'release');
    });
  }

  test('rolls back when the status update fails', async () => {
    const failure = new Error('write failed');
    const connection = createCancelConnection({
      booking: { id: BOOKING_ID, requesterId: 'user-member', status: 'PENDING' },
      updateError: failure,
    });

    await assert.rejects(repositoryFor(connection).cancel(BOOKING_ID, 'user-member'), failure);

    assert.ok(connection.calls.includes('rollback'));
    assert.ok(!connection.calls.includes('commit'));
    assert.equal(connection.calls.at(-1), 'release');
  });
});
