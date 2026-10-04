import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  BookingDecisionError,
  createMySqlBookingRepository,
} from '../src/repositories/mysqlBookingRepository.js';

const bookingRow = {
  id: 'booking-1',
  resourceId: 'resource-1',
  resourceName: 'Confocal Microscope',
  requesterId: 'member-1',
  requesterName: 'Lab Member',
  requesterEmail: 'member@example.test',
  startTime: new Date('2026-10-10T02:00:00.000Z'),
  endTime: new Date('2026-10-10T04:00:00.000Z'),
  status: 'PENDING',
  rejectionReason: null,
  reviewedBy: null,
  reviewedAt: null,
  createdAt: new Date('2026-10-04T12:00:00.000Z'),
  updatedAt: new Date('2026-10-04T12:00:00.000Z'),
};

function createConnection({
  target = bookingRow,
  resource = { availabilityStatus: 'AVAILABLE', currentStatus: 'OPERATIONAL', archived: false },
  overlap = null,
  updateError = null,
} = {}) {
  const calls = [];
  return {
    calls,
    async beginTransaction() { calls.push('begin'); },
    async execute(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FROM bookings b') && sql.includes('FOR UPDATE')) {
        return [target ? [target] : []];
      }
      if (sql.includes('FROM resources') && sql.includes('FOR UPDATE')) {
        return [resource ? [resource] : []];
      }
      if (sql.includes("status = 'APPROVED'") && sql.includes('FOR UPDATE')) {
        return [overlap ? [overlap] : []];
      }
      if (sql.includes('UPDATE bookings')) {
        if (updateError) throw updateError;
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 1 }];
    },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); },
  };
}

describe('MySQL booking repository', () => {
  test('lists pending requests oldest first with API-safe timestamps', async () => {
    const calls = [];
    const repository = createMySqlBookingRepository({
      async execute(sql, values) {
        calls.push({ sql, values });
        return [[bookingRow]];
      },
    });

    const bookings = await repository.listPending();

    assert.equal(bookings[0].startTime, '2026-10-10T02:00:00.000Z');
    assert.equal(bookings[0].createdAt, '2026-10-04T12:00:00.000Z');
    assert.match(calls[0].sql, /WHERE b\.status = 'PENDING'/);
    assert.match(calls[0].sql, /ORDER BY b\.created_at ASC/);
  });

  test('approves safely and writes the decision, audit, and notification atomically', async () => {
    const connection = createConnection();
    const repository = createMySqlBookingRepository({
      async getConnection() { return connection; },
    });

    const saved = await repository.decide(
      'booking-1',
      { decision: 'APPROVE', reason: null },
      'admin-1',
    );

    const sqlCalls = connection.calls.filter((call) => typeof call === 'object');
    assert.equal(connection.calls[0], 'begin');
    assert.match(sqlCalls[0].sql, /FROM bookings b/);
    assert.match(sqlCalls[0].sql, /FOR UPDATE/);
    assert.match(sqlCalls[1].sql, /FROM resources/);
    assert.match(sqlCalls[2].sql, /status = 'APPROVED'/);
    assert.match(sqlCalls[3].sql, /UPDATE bookings/);
    assert.match(sqlCalls[4].sql, /INSERT INTO audit_logs/);
    assert.match(sqlCalls[5].sql, /INSERT INTO notifications/);
    assert.deepEqual(connection.calls.slice(-2), ['commit', 'release']);
    assert.equal(saved.status, 'APPROVED');
    assert.equal(saved.reviewedBy, 'admin-1');
  });

  test('rejects with a reason without running an overlap query', async () => {
    const connection = createConnection();
    const repository = createMySqlBookingRepository({
      async getConnection() { return connection; },
    });

    const saved = await repository.decide(
      'booking-1',
      { decision: 'REJECT', reason: 'Training is incomplete.' },
      'admin-1',
    );

    const sqlCalls = connection.calls.filter((call) => typeof call === 'object');
    assert.equal(sqlCalls.some((call) => call.sql.includes("status = 'APPROVED'")), false);
    assert.equal(sqlCalls.find((call) => call.sql.includes('UPDATE bookings')).values[1], 'Training is incomplete.');
    assert.equal(saved.status, 'REJECTED');
    assert.equal(saved.rejectionReason, 'Training is incomplete.');
    assert.deepEqual(connection.calls.slice(-2), ['commit', 'release']);
  });

  test('rolls back when the booking is missing or already decided', async () => {
    const cases = [
      [null, 'BOOKING_NOT_FOUND'],
      [{ ...bookingRow, status: 'APPROVED' }, 'BOOKING_ALREADY_DECIDED'],
    ];

    for (const [target, code] of cases) {
      const connection = createConnection({ target });
      const repository = createMySqlBookingRepository({
        async getConnection() { return connection; },
      });

      await assert.rejects(
        repository.decide('booking-1', { decision: 'APPROVE', reason: null }, 'admin-1'),
        (error) => error instanceof BookingDecisionError && error.code === code,
      );
      assert.deepEqual(connection.calls.slice(-2), ['rollback', 'release']);
    }
  });

  test('blocks approval when the resource is unavailable or a booking overlaps', async () => {
    const cases = [
      { resource: { availabilityStatus: 'UNAVAILABLE', currentStatus: 'OPERATIONAL' } },
      { resource: { availabilityStatus: 'AVAILABLE', currentStatus: 'OPERATIONAL', archived: true } },
      { overlap: { id: 'existing-approved-booking' } },
    ];

    for (const setup of cases) {
      const connection = createConnection(setup);
      const repository = createMySqlBookingRepository({
        async getConnection() { return connection; },
      });

      await assert.rejects(
        repository.decide('booking-1', { decision: 'APPROVE', reason: null }, 'admin-1'),
        (error) => error instanceof BookingDecisionError && error.code === 'BOOKING_CONFLICT',
      );
      assert.deepEqual(connection.calls.slice(-2), ['rollback', 'release']);
    }
  });

  test('rolls back unexpected persistence failures', async () => {
    const updateError = new Error('update failed');
    const connection = createConnection({ updateError });
    const repository = createMySqlBookingRepository({
      async getConnection() { return connection; },
    });

    await assert.rejects(
      repository.decide('booking-1', { decision: 'REJECT', reason: 'No access.' }, 'admin-1'),
      updateError,
    );
    assert.deepEqual(connection.calls.slice(-2), ['rollback', 'release']);
  });
});
