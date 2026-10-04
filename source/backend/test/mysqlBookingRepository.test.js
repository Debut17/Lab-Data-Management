import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  BookingRepositoryError,
  createMySqlBookingRepository,
} from '../src/repositories/mysqlBookingRepository.js';

const booking = {
  resourceId: 'resource-1',
  startTime: '2026-10-10T02:00:00.000Z',
  endTime: '2026-10-10T04:00:00.000Z',
};

function createConnection({ resource, conflicts = [], insertError } = {}) {
  const calls = [];
  return {
    calls,
    async beginTransaction() { calls.push('begin'); },
    async execute(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FROM resources')) return [[resource].filter(Boolean)];
      if (sql.includes('FROM bookings')) return [conflicts];
      if (insertError && sql.includes('INSERT INTO bookings')) throw insertError;
      return [[]];
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

describe('MySQL booking repository', () => {
  test('checks availability and approved overlaps before committing a pending request', async () => {
    const connection = createConnection({
      resource: {
        id: 'resource-1',
        name: 'Microscope',
        availabilityStatus: 'AVAILABLE',
        archived: 0,
      },
    });

    const saved = await repositoryFor(connection).create(booking, 'member-1');

    assert.equal(saved.status, 'PENDING');
    assert.equal(saved.requesterId, 'member-1');
    assert.equal(saved.resourceName, 'Microscope');
    assert.match(connection.calls[1].sql, /FOR UPDATE/);
    assert.match(connection.calls[2].sql, /status = 'APPROVED'/);
    assert.match(connection.calls[3].sql, /INSERT INTO bookings/);
    assert.match(connection.calls[4].sql, /BOOKING_REQUESTED/);
    assert.deepEqual(connection.calls.slice(-2), ['commit', 'release']);
  });

  for (const [name, options, code] of [
    ['missing resource', {}, 'RESOURCE_NOT_FOUND'],
    ['unavailable resource', {
      resource: { id: 'resource-1', name: 'Microscope', availabilityStatus: 'UNAVAILABLE', archived: 0 },
    }, 'RESOURCE_UNAVAILABLE'],
    ['archived resource', {
      resource: { id: 'resource-1', name: 'Microscope', availabilityStatus: 'AVAILABLE', archived: 1 },
    }, 'RESOURCE_UNAVAILABLE'],
    ['approved overlap', {
      resource: { id: 'resource-1', name: 'Microscope', availabilityStatus: 'AVAILABLE', archived: 0 },
      conflicts: [{ id: 'booking-existing' }],
    }, 'BOOKING_CONFLICT'],
  ]) {
    test(`rolls back for ${name}`, async () => {
      const connection = createConnection(options);

      await assert.rejects(
        repositoryFor(connection).create(booking, 'member-1'),
        (error) => error instanceof BookingRepositoryError && error.code === code,
      );

      assert.deepEqual(connection.calls.slice(-2), ['rollback', 'release']);
      assert.ok(!connection.calls.includes('commit'));
    });
  }

  test('rolls back when the booking insert fails', async () => {
    const insertError = new Error('insert failed');
    const connection = createConnection({
      resource: {
        id: 'resource-1',
        name: 'Microscope',
        availabilityStatus: 'AVAILABLE',
        archived: 0,
      },
      insertError,
    });

    await assert.rejects(repositoryFor(connection).create(booking, 'member-1'), insertError);
    assert.deepEqual(connection.calls.slice(-2), ['rollback', 'release']);
  });
});
