import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  ResourceArchiveError,
  createMySqlResourceRepository,
} from '../src/repositories/mysqlResourceRepository.js';

const resourceRow = {
  id: 'resource-1',
  name: 'BX53 Upright Microscope',
  category: 'Microscope',
  location: 'Biology Lab A',
  availabilityStatus: 'AVAILABLE',
  currentStatus: 'OPERATIONAL',
  archived: 0,
};

function createConnection({ target = resourceRow, activeBookings = 0, updateError = null } = {}) {
  const calls = [];
  return {
    calls,
    async beginTransaction() { calls.push('begin'); },
    async execute(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FROM resources') && sql.includes('FOR UPDATE')) return [target ? [target] : []];
      if (sql.includes('FROM bookings')) return [[{ total: activeBookings }]];
      if (updateError && sql.includes('UPDATE resources')) throw updateError;
      return [{ affectedRows: 1 }];
    },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); },
  };
}

function repositoryFor(connection) {
  return createMySqlResourceRepository({ async getConnection() { return connection; } });
}

function sqlCalls(connection) {
  return connection.calls.filter((call) => typeof call === 'object');
}

describe('MySQL resource archive', () => {
  test('archives the resource and writes a field-level audit entry in one transaction', async () => {
    const connection = createConnection();

    const saved = await repositoryFor(connection).archive('resource-1', 'admin-1');

    assert.equal(saved.archived, true);
    const calls = sqlCalls(connection);
    assert.match(calls[0].sql, /FOR UPDATE/);
    const bookingCheck = calls.find((call) => call.sql.includes('FROM bookings'));
    assert.match(bookingCheck.sql, /status IN \('PENDING', 'APPROVED'\)/);
    assert.match(bookingCheck.sql, /end_time > \?/);
    const update = calls.find((call) => call.sql.includes('UPDATE resources'));
    assert.match(update.sql, /SET archived = TRUE/);
    assert.equal(update.values[1], 'resource-1');
    const audit = calls.find((call) => call.sql.includes('INSERT INTO audit_logs'));
    assert.match(audit.sql, /'RESOURCE_ARCHIVED', 'RESOURCE'/);
    assert.equal(audit.values[0], 'admin-1');
    assert.deepEqual(JSON.parse(audit.values[2]), { archived: { before: false, after: true } });
    assert.equal(connection.calls[0], 'begin');
    assert.deepEqual(connection.calls.slice(-2), ['commit', 'release']);
  });

  test('blocks archiving while pending or upcoming bookings exist', async () => {
    const one = createConnection({ activeBookings: 1 });
    const many = createConnection({ activeBookings: 3 });

    await assert.rejects(repositoryFor(one).archive('resource-1', 'admin-1'), (error) => (
      error instanceof ResourceArchiveError
      && error.code === 'RESOURCE_HAS_ACTIVE_BOOKINGS'
      && error.status === 409
      && /has 1 pending or upcoming booking\./.test(error.message)
    ));
    await assert.rejects(repositoryFor(many).archive('resource-1', 'admin-1'), /3 pending or upcoming bookings/);

    for (const connection of [one, many]) {
      assert.ok(!sqlCalls(connection).some((call) => call.sql.includes('UPDATE resources')));
      assert.deepEqual(connection.calls.slice(-2), ['rollback', 'release']);
    }
  });

  test('rejects unknown and already archived resources', async () => {
    const missing = createConnection({ target: null });
    const archived = createConnection({ target: { ...resourceRow, archived: 1 } });

    await assert.rejects(repositoryFor(missing).archive('resource-x', 'admin-1'), {
      code: 'RESOURCE_NOT_FOUND', status: 404,
    });
    await assert.rejects(repositoryFor(archived).archive('resource-1', 'admin-1'), {
      code: 'RESOURCE_ALREADY_ARCHIVED', status: 409,
    });
    for (const connection of [missing, archived]) {
      assert.deepEqual(connection.calls.slice(-2), ['rollback', 'release']);
    }
  });

  test('rolls back when the update fails', async () => {
    const connection = createConnection({ updateError: new Error('write failed') });

    await assert.rejects(repositoryFor(connection).archive('resource-1', 'admin-1'), /write failed/);

    assert.ok(!connection.calls.includes('commit'));
    assert.ok(!sqlCalls(connection).some((call) => call.sql.includes('INSERT INTO audit_logs')));
    assert.deepEqual(connection.calls.slice(-2), ['rollback', 'release']);
  });
});
