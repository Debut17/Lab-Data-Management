import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  UserRoleError,
  createMySqlUserRepository,
} from '../src/repositories/mysqlUserRepository.js';

const userRow = {
  id: 'user-1',
  email: 'member@example.test',
  displayName: 'Lab Member',
  role: 'LAB_MEMBER',
  isActive: 1,
  createdAt: new Date('2026-10-01T08:00:00.000Z'),
};

function createRoleConnection({ target = userRow, auditError = null } = {}) {
  const calls = [];
  return {
    calls,
    async beginTransaction() { calls.push('begin'); },
    async execute(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FROM users') && sql.includes('FOR UPDATE')) {
        return [target ? [target] : []];
      }
      if (auditError && sql.includes('INSERT INTO audit_logs')) {
        throw auditError;
      }
      return [{ affectedRows: 1 }];
    },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); },
  };
}

function repositoryFor(connection) {
  return createMySqlUserRepository({
    async getConnection() { return connection; },
  });
}

function sqlCalls(connection) {
  return connection.calls.filter((call) => typeof call === 'object');
}

describe('MySQL user repository', () => {
  test('looks up active users by email and identifier', async () => {
    const queries = [];
    const repository = createMySqlUserRepository({
      async execute(sql, values) {
        queries.push({ sql, values });
        return [values[0] === 'missing' ? [] : [userRow]];
      },
    });

    assert.equal((await repository.findByEmail('member@example.test')).id, 'user-1');
    assert.equal((await repository.findActiveById('user-1')).role, 'LAB_MEMBER');
    assert.equal(await repository.findActiveById('missing'), null);
    assert.ok(queries.every((query) => query.sql.includes('is_active = TRUE')));
  });

  test('lists users with normalised fields', async () => {
    const repository = createMySqlUserRepository({
      async execute() { return [[userRow]]; },
    });

    const users = await repository.list();

    assert.deepEqual(users, [{
      id: 'user-1',
      email: 'member@example.test',
      displayName: 'Lab Member',
      role: 'LAB_MEMBER',
      isActive: true,
      createdAt: '2026-10-01T08:00:00.000Z',
    }]);
  });

  test('assigns a role and writes a ROLE_ASSIGNED audit entry in one transaction', async () => {
    const connection = createRoleConnection();

    const user = await repositoryFor(connection).updateRole('user-1', 'LAB_STAFF', 'admin-1');

    assert.equal(user.role, 'LAB_STAFF');
    const [, update, audit] = sqlCalls(connection);
    assert.match(update.sql, /UPDATE users SET role = \?/);
    assert.deepEqual(update.values, ['LAB_STAFF', 'user-1']);
    assert.match(audit.sql, /INSERT INTO audit_logs/);
    assert.deepEqual(audit.values.slice(0, 3), ['admin-1', 'ROLE_ASSIGNED', 'user-1']);
    assert.equal(connection.calls[0], 'begin');
    assert.deepEqual(connection.calls.slice(-2), ['commit', 'release']);
  });

  test('records returning a user to the base role as ROLE_REVOKED', async () => {
    const connection = createRoleConnection({ target: { ...userRow, role: 'SYSTEM_ADMIN' } });

    await repositoryFor(connection).updateRole('user-1', 'LAB_MEMBER', 'admin-1');

    const audit = sqlCalls(connection).find((call) => call.sql.includes('audit_logs'));
    assert.equal(audit.values[1], 'ROLE_REVOKED');
  });

  test('rolls back for unknown users and unchanged roles', async () => {
    const missing = createRoleConnection({ target: null });
    const unchanged = createRoleConnection();

    await assert.rejects(
      repositoryFor(missing).updateRole('user-x', 'LAB_STAFF', 'admin-1'),
      (error) => error instanceof UserRoleError && error.code === 'USER_NOT_FOUND' && error.status === 404,
    );
    await assert.rejects(
      repositoryFor(unchanged).updateRole('user-1', 'LAB_MEMBER', 'admin-1'),
      (error) => error instanceof UserRoleError && error.code === 'ROLE_UNCHANGED' && error.status === 409,
    );

    for (const connection of [missing, unchanged]) {
      assert.ok(!sqlCalls(connection).some((call) => call.sql.includes('UPDATE users')));
      assert.deepEqual(connection.calls.slice(-2), ['rollback', 'release']);
    }
  });

  test('rolls back the role change when the audit entry cannot be written', async () => {
    const connection = createRoleConnection({ auditError: new Error('audit failed') });

    await assert.rejects(
      repositoryFor(connection).updateRole('user-1', 'LAB_STAFF', 'admin-1'),
      /audit failed/,
    );

    assert.ok(!connection.calls.includes('commit'));
    assert.deepEqual(connection.calls.slice(-2), ['rollback', 'release']);
  });

  test('rejects unknown error codes', () => {
    assert.throws(() => new UserRoleError('NOPE'), TypeError);
  });
});
