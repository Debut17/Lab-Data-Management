import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  ResourceUpdateError,
  createMySqlResourceRepository,
} from '../src/repositories/mysqlResourceRepository.js';

const resourceRow = {
  id: 'resource-1',
  name: 'BX53 Upright Microscope',
  category: 'Microscope',
  location: 'Biology Lab A, Room 201',
  description: 'Upright microscope for laboratory observation.',
  responsiblePerson: 'Dr. Example',
  availabilityStatus: 'AVAILABLE',
  currentStatus: 'OPERATIONAL',
  specifications: null,
  archived: 0,
};

function unchangedInput() {
  const { id: _id, archived: _archived, ...fields } = resourceRow;
  return fields;
}

function createConnection({ target = resourceRow, failOn = null } = {}) {
  const calls = [];
  return {
    calls,
    async beginTransaction() { calls.push('begin'); },
    async execute(sql, values) {
      calls.push({ sql, values });
      if (failOn && sql.includes(failOn)) throw new Error(`${failOn} failed`);
      if (sql.includes('FROM resources') && sql.includes('FOR UPDATE')) return [target ? [target] : []];
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

describe('MySQL resource update (US-9)', () => {
  test('locks the row, updates it, and audits only the changed fields before commit', async () => {
    const connection = createConnection();
    const input = { ...unchangedInput(), location: 'Biology Lab B, Room 305', currentStatus: 'MAINTENANCE' };

    const saved = await repositoryFor(connection).update('resource-1', input, 'admin-1');

    const calls = sqlCalls(connection);
    assert.match(calls[0].sql, /WHERE id = \? FOR UPDATE/);
    assert.deepEqual(calls[0].values, ['resource-1']);

    const update = calls.find((call) => call.sql.includes('UPDATE resources'));
    assert.equal(update.values[2], 'Biology Lab B, Room 305');
    assert.equal(update.values[6], 'MAINTENANCE');
    assert.equal(update.values.at(-1), 'resource-1');

    const audit = calls.find((call) => call.sql.includes('INSERT INTO audit_logs'));
    assert.match(audit.sql, /'RESOURCE_UPDATED', 'RESOURCE'/);
    assert.equal(audit.values[0], 'admin-1');
    assert.equal(audit.values[1], 'resource-1');
    assert.deepEqual(JSON.parse(audit.values[2]), {
      location: { before: 'Biology Lab A, Room 201', after: 'Biology Lab B, Room 305' },
      currentStatus: { before: 'OPERATIONAL', after: 'MAINTENANCE' },
    });
    assert.equal(update.values[8], audit.values[3], 'updated_at and the audit timestamp should match');

    assert.equal(saved.location, 'Biology Lab B, Room 305');
    assert.equal(saved.archived, false);
    assert.equal(connection.calls[0], 'begin');
    assert.deepEqual(connection.calls.slice(-2), ['commit', 'release']);
  });

  test('records clearing an optional field as a change to null', async () => {
    const connection = createConnection();

    await repositoryFor(connection).update(
      'resource-1',
      { ...unchangedInput(), responsiblePerson: null },
      'admin-1',
    );

    const audit = sqlCalls(connection).find((call) => call.sql.includes('INSERT INTO audit_logs'));
    assert.deepEqual(JSON.parse(audit.values[2]), {
      responsiblePerson: { before: 'Dr. Example', after: null },
    });
  });

  test('saving without changes commits without an update or audit entry', async () => {
    const connection = createConnection();

    const saved = await repositoryFor(connection).update('resource-1', unchangedInput(), 'admin-1');

    const calls = sqlCalls(connection);
    assert.equal(calls.length, 1, 'only the locking SELECT should run');
    assert.equal(saved.name, resourceRow.name);
    assert.deepEqual(connection.calls.slice(-2), ['commit', 'release']);
  });

  const rejected = [
    ['an unknown resource', { target: null }, 'RESOURCE_NOT_FOUND', 404],
    ['an archived resource', { target: { ...resourceRow, archived: 1 } }, 'RESOURCE_ARCHIVED', 409],
  ];

  for (const [name, setup, code, status] of rejected) {
    test(`rolls back ${name} without writing`, async () => {
      const connection = createConnection(setup);

      await assert.rejects(
        repositoryFor(connection).update('resource-1', { ...unchangedInput(), name: 'Renamed' }, 'admin-1'),
        (error) => error instanceof ResourceUpdateError && error.code === code && error.status === status,
      );

      assert.equal(sqlCalls(connection).length, 1);
      assert.ok(!connection.calls.includes('commit'));
      assert.deepEqual(connection.calls.slice(-2), ['rollback', 'release']);
    });
  }

  for (const failOn of ['UPDATE resources', 'INSERT INTO audit_logs']) {
    test(`rolls back the whole change when ${failOn} fails`, async () => {
      const connection = createConnection({ failOn });

      await assert.rejects(
        repositoryFor(connection).update('resource-1', { ...unchangedInput(), name: 'Renamed' }, 'admin-1'),
        new RegExp(`${failOn} failed`),
      );

      assert.ok(!connection.calls.includes('commit'));
      assert.deepEqual(connection.calls.slice(-2), ['rollback', 'release']);
    });
  }
});
