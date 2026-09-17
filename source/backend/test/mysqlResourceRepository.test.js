import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createMySqlResourceRepository } from '../src/repositories/mysqlResourceRepository.js';

const resource = {
  name: 'Microscope',
  category: 'Instrument',
  location: 'Room 201',
  description: null,
  responsiblePerson: null,
  availabilityStatus: 'AVAILABLE',
  currentStatus: 'OPERATIONAL',
  specifications: null,
};

function createConnection({ insertError } = {}) {
  const calls = [];
  return {
    calls,
    async beginTransaction() { calls.push('begin'); },
    async execute(sql, values) {
      calls.push({ sql, values });
      if (insertError && sql.includes('INSERT INTO resources')) {
        throw insertError;
      }
    },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); },
  };
}

describe('MySQL resource repository', () => {
  test('commits the resource and audit writes in one transaction', async () => {
    const connection = createConnection();
    const repository = createMySqlResourceRepository({
      async getConnection() { return connection; },
    });

    const saved = await repository.create(resource, 'admin-1');

    assert.equal(saved.name, 'Microscope');
    assert.equal(saved.archived, false);
    assert.equal(connection.calls[0], 'begin');
    assert.match(connection.calls[1].sql, /INSERT INTO resources/);
    assert.match(connection.calls[2].sql, /INSERT INTO audit_logs/);
    assert.deepEqual(connection.calls.slice(-2), ['commit', 'release']);
  });

  test('rolls back and releases the connection when an insert fails', async () => {
    const insertError = new Error('insert failed');
    const connection = createConnection({ insertError });
    const repository = createMySqlResourceRepository({
      async getConnection() { return connection; },
    });

    await assert.rejects(repository.create(resource, 'admin-1'), insertError);

    assert.deepEqual(connection.calls.slice(-2), ['rollback', 'release']);
    assert.ok(!connection.calls.includes('commit'));
  });
});
