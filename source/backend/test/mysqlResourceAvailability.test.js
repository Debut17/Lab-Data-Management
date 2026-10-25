import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createMySqlResourceRepository } from '../src/repositories/mysqlResourceRepository.js';

const resource = { id: 'resource-1', name: 'Microscope', availabilityStatus: 'AVAILABLE', archived: 0 };

function context({ target = resource, failAt } = {}) {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push('begin'); },
    async execute(sql, values) {
      calls.push({ sql, values });
      if (failAt && sql.includes(failAt)) throw new Error('write failed');
      if (sql.includes('SELECT')) return [target ? [target] : []];
      return [{ affectedRows: 1 }];
    },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); },
  };
  return {
    calls,
    repository: createMySqlResourceRepository({ async getConnection() { return connection; } }),
  };
}

describe('US-11 MySQL resource availability', () => {
  test('administrator list includes unavailable and archived resources with boolean archive flags', async () => {
    const repository = createMySqlResourceRepository({
      async execute(sql) {
        assert.doesNotMatch(sql, /WHERE/);
        assert.match(sql, /ORDER BY name ASC, id ASC/);
        return [[resource, { ...resource, id: 'resource-2', availabilityStatus: 'UNAVAILABLE', archived: 1 }]];
      },
    });
    const rows = await repository.listForAdministrator();
    assert.equal(rows[0].archived, false);
    assert.equal(rows[1].archived, true);
    assert.equal(rows[1].availabilityStatus, 'UNAVAILABLE');
  });

  for (const [before, after] of [['AVAILABLE', 'UNAVAILABLE'], ['UNAVAILABLE', 'AVAILABLE']]) {
    test(`locks, updates ${before} to ${after}, and audits before commit`, async () => {
      const { repository, calls } = context({ target: { ...resource, availabilityStatus: before } });
      const saved = await repository.updateAvailability(resource.id, after, 'admin-1');
      assert.equal(saved.availabilityStatus, after);
      assert.equal(saved.archived, false);
      assert.equal(calls[0], 'begin');
      assert.match(calls[1].sql, /WHERE id = \? FOR UPDATE/);
      assert.deepEqual(calls[1].values, [resource.id]);
      assert.match(calls[2].sql, /^UPDATE resources SET availability_status/);
      assert.doesNotMatch(calls[2].sql, /current_status|archived/);
      assert.equal(calls[2].values[0], after);
      assert.equal(calls[2].values[2], resource.id);
      assert.match(calls[3].sql, /RESOURCE_AVAILABILITY_CHANGED/);
      assert.deepEqual(calls[3].values.slice(0, 2), ['admin-1', resource.id]);
      assert.deepEqual(JSON.parse(calls[3].values[2]), { availabilityStatus: { before, after } });
      assert.equal(calls[3].values[3], calls[2].values[1]);
      assert.deepEqual(calls.slice(-2), ['commit', 'release']);
    });
  }

  test('repeating the stored state succeeds without a duplicate update or audit', async () => {
    const { repository, calls } = context();
    await repository.updateAvailability(resource.id, 'AVAILABLE', 'admin-1');
    assert.equal(calls.length, 4);
    assert.deepEqual(calls.slice(-2), ['commit', 'release']);
  });

  for (const [target, code] of [[null, 'RESOURCE_NOT_FOUND'], [{ ...resource, archived: 1 }, 'RESOURCE_ARCHIVED']]) {
    test(`rolls back ${code} without writing`, async () => {
      const { repository, calls } = context({ target });
      await assert.rejects(repository.updateAvailability(resource.id, 'UNAVAILABLE', 'admin-1'), { code });
      assert.equal(calls.length, 4);
      assert.deepEqual(calls.slice(-2), ['rollback', 'release']);
    });
  }

  for (const failAt of ['UPDATE resources', 'INSERT INTO audit_logs']) {
    test(`rolls back the whole change when ${failAt} fails`, async () => {
      const { repository, calls } = context({ failAt });
      await assert.rejects(repository.updateAvailability(resource.id, 'UNAVAILABLE', 'admin-1'), /write failed/);
      assert.ok(!calls.includes('commit'));
      assert.deepEqual(calls.slice(-2), ['rollback', 'release']);
    });
  }
});
