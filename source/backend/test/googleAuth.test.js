import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { createMySqlUserRepository } from '../src/repositories/mysqlUserRepository.js';

const AUTH_SECRET = 'test-secret-with-enough-entropy-for-tests';
const CLIENT_ID = 'test-client.apps.googleusercontent.com';

const validPayload = {
  email: 'Student.One@ku.th',
  email_verified: true,
  hd: 'ku.th',
  name: 'Student One',
};

function createGoogleContext({
  payload = validPayload,
  verifyError = null,
  existingUser = null,
  configured = true,
} = {}) {
  const verified = [];
  const lookups = [];
  const users = new Map(existingUser ? [[existingUser.id, existingUser]] : []);
  const userRepository = {
    async findByEmail() { return null; },
    async findActiveById(id) {
      const user = users.get(id);
      return user && user.isActive !== false ? user : null;
    },
    async findOrCreateGoogleUser(details) {
      lookups.push(details);
      const found = [...users.values()].find((user) => user.email === details.email);
      if (found) return found.isActive === false ? null : found;
      const created = { id: 'user-new', email: details.email, displayName: details.displayName, role: 'LAB_MEMBER' };
      users.set(created.id, created);
      return created;
    },
  };
  const app = createApp({
    resourceRepository: { async create() {} },
    userRepository,
    authSecret: AUTH_SECRET,
    googleClientId: configured ? CLIENT_ID : null,
    verifyGoogleToken: configured
      ? async (credential) => {
        verified.push(credential);
        if (verifyError) throw verifyError;
        return payload;
      }
      : null,
    logger: { error() {} },
  });
  return { app, verified, lookups };
}

describe('US-16 Google sign-in API', () => {
  test('publishes the sign-in configuration without secrets', async () => {
    const { app } = createGoogleContext();

    const response = await request(app).get('/api/auth/config').expect(200);

    assert.deepEqual(response.body.data, {
      googleClientId: CLIENT_ID,
      allowedEmailDomain: 'ku.th',
      devLoginEnabled: false,
    });
  });

  test('signs in a verified @ku.th account and creates the session cookie', async () => {
    const { app, verified, lookups } = createGoogleContext();
    const agent = request.agent(app);

    const response = await agent.post('/api/auth/google').send({ credential: 'id-token' }).expect(200);

    assert.deepEqual(verified, ['id-token']);
    assert.deepEqual(lookups, [{ email: 'student.one@ku.th', displayName: 'Student One' }]);
    assert.equal(response.body.data.user.role, 'LAB_MEMBER');
    assert.match(response.headers['set-cookie'][0], /lab_session=.*HttpOnly.*SameSite=Strict/);

    const session = await agent.get('/api/auth/session').expect(200);
    assert.equal(session.body.data.user.email, 'student.one@ku.th');
  });

  test('keeps the role of an existing account', async () => {
    const { app } = createGoogleContext({
      existingUser: { id: 'user-admin', email: 'student.one@ku.th', displayName: 'Lab Admin', role: 'SYSTEM_ADMIN' },
    });

    const response = await request(app).post('/api/auth/google').send({ credential: 'id-token' }).expect(200);

    assert.equal(response.body.data.user.role, 'SYSTEM_ADMIN');
  });

  test('rejects accounts outside the university domain or with unverified email', async () => {
    const cases = [
      { ...validPayload, email: 'someone@gmail.com', hd: undefined },
      { ...validPayload, email: 'someone@ku.th.evil.com', hd: 'ku.th.evil.com' },
      { ...validPayload, hd: undefined },
      { ...validPayload, email_verified: false },
    ];
    for (const payload of cases) {
      const { app, lookups } = createGoogleContext({ payload });
      const response = await request(app).post('/api/auth/google').send({ credential: 'id-token' }).expect(403);
      assert.equal(response.body.error.code, 'EMAIL_DOMAIN_NOT_ALLOWED');
      assert.equal(response.body.error.message, 'Sign in with your @ku.th Google account.');
      assert.equal(lookups.length, 0);
      assert.equal(response.headers['set-cookie'], undefined);
    }
  });

  test('rejects an invalid or expired Google credential', async () => {
    const { app, lookups } = createGoogleContext({ verifyError: new Error('Token used too late') });

    const response = await request(app).post('/api/auth/google').send({ credential: 'bad-token' }).expect(401);

    assert.equal(response.body.error.code, 'INVALID_GOOGLE_CREDENTIAL');
    assert.doesNotMatch(JSON.stringify(response.body), /too late/);
    assert.equal(lookups.length, 0);
  });

  test('refuses a deactivated account', async () => {
    const { app } = createGoogleContext({
      existingUser: { id: 'user-old', email: 'student.one@ku.th', displayName: 'Old', role: 'LAB_MEMBER', isActive: false },
    });

    const response = await request(app).post('/api/auth/google').send({ credential: 'id-token' }).expect(403);

    assert.equal(response.body.error.code, 'ACCOUNT_DISABLED');
    assert.equal(response.headers['set-cookie'], undefined);
  });

  test('validates the request body and reports when Google sign-in is not configured', async () => {
    const { app, verified } = createGoogleContext();
    await request(app).post('/api/auth/google').send({}).expect(422);
    await request(app).post('/api/auth/google').send({ credential: 'x', role: 'SYSTEM_ADMIN' }).expect(422);
    assert.equal(verified.length, 0);

    const { app: unconfigured } = createGoogleContext({ configured: false });
    const response = await request(unconfigured).post('/api/auth/google').send({ credential: 'id-token' }).expect(503);
    assert.equal(response.body.error.code, 'GOOGLE_SIGN_IN_UNAVAILABLE');
    const config = await request(unconfigured).get('/api/auth/config').expect(200);
    assert.equal(config.body.data.googleClientId, null);
  });
});

function createConnection({ existing = null } = {}) {
  const calls = [];
  return {
    calls,
    async beginTransaction() { calls.push('begin'); },
    async execute(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FROM users') && sql.includes('FOR UPDATE')) return [existing ? [existing] : []];
      return [{ affectedRows: 1 }];
    },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); },
  };
}

function repositoryFor(connection) {
  return createMySqlUserRepository({ async getConnection() { return connection; } });
}

describe('MySQL user repository - Google accounts', () => {
  test('creates a Lab Member with an audit entry on first sign-in', async () => {
    const connection = createConnection();

    const user = await repositoryFor(connection).findOrCreateGoogleUser({
      email: 'student.one@ku.th',
      displayName: 'Student One',
    });

    assert.equal(user.role, 'LAB_MEMBER');
    assert.equal(user.displayName, 'Student One');
    const sql = connection.calls.filter((call) => typeof call === 'object');
    const insertUser = sql.find((call) => call.sql.includes('INSERT INTO users'));
    assert.deepEqual(insertUser.values.slice(1, 4), ['student.one@ku.th', 'Student One', 'LAB_MEMBER']);
    const audit = sql.find((call) => call.sql.includes('INSERT INTO audit_logs'));
    assert.match(audit.sql, /'USER_CREATED', 'USER'/);
    assert.equal(audit.values[0], user.id);
    assert.deepEqual(connection.calls.slice(-2), ['commit', 'release']);
  });

  test('returns an existing active account and null for a deactivated one', async () => {
    const active = createConnection({
      existing: { id: 'u1', email: 'a@ku.th', displayName: 'A', role: 'LAB_STAFF', isActive: 1 },
    });
    const inactive = createConnection({
      existing: { id: 'u2', email: 'b@ku.th', displayName: 'B', role: 'LAB_MEMBER', isActive: 0 },
    });

    assert.deepEqual(
      await repositoryFor(active).findOrCreateGoogleUser({ email: 'a@ku.th', displayName: 'A' }),
      { id: 'u1', email: 'a@ku.th', displayName: 'A', role: 'LAB_STAFF' },
    );
    assert.equal(await repositoryFor(inactive).findOrCreateGoogleUser({ email: 'b@ku.th', displayName: 'B' }), null);
    for (const connection of [active, inactive]) {
      assert.ok(!connection.calls.some((call) => typeof call === 'object' && call.sql.includes('INSERT')));
    }
  });

  test('falls back to the email as the display name and rolls back on failure', async () => {
    const connection = createConnection();
    const user = await repositoryFor(connection).findOrCreateGoogleUser({ email: 'c@ku.th', displayName: '' });
    assert.equal(user.displayName, 'c@ku.th');

    const failing = createConnection();
    failing.execute = async (sql) => {
      if (sql.includes('INSERT INTO users')) throw new Error('duplicate');
      return [[]];
    };
    await assert.rejects(repositoryFor(failing).findOrCreateGoogleUser({ email: 'd@ku.th', displayName: 'D' }), /duplicate/);
    assert.deepEqual(failing.calls.slice(-2), ['rollback', 'release']);
  });
});

describe('Google token verifier', () => {
  test('requires a client ID and returns a verifier function', async () => {
    const { createGoogleTokenVerifier } = await import('../src/auth/googleVerifier.js');

    assert.throws(() => createGoogleTokenVerifier({ clientId: '' }), /client ID is required/);
    assert.equal(typeof createGoogleTokenVerifier({ clientId: 'client-1' }), 'function');
  });

  test('rejects a malformed token without contacting the application', async () => {
    const { createGoogleTokenVerifier } = await import('../src/auth/googleVerifier.js');

    await assert.rejects(createGoogleTokenVerifier({ clientId: 'client-1' })('not-a-jwt'));
  });
});
