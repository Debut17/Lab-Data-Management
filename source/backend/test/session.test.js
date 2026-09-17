import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createSessionService, readCookie } from '../src/auth/session.js';

const user = {
  id: 'user-1',
  email: 'admin@local.test',
  displayName: 'Admin',
  role: 'SYSTEM_ADMIN',
};

describe('session service', () => {
  test('issues and verifies a signed session', () => {
    const sessions = createSessionService({ secret: 'secret', now: () => 1_000 });

    const session = sessions.verify(sessions.issue(user));

    assert.equal(session.sub, user.id);
    assert.equal(session.role, user.role);
  });

  test('rejects missing, tampered, expired, and malformed sessions', () => {
    const sessions = createSessionService({ secret: 'secret', ttlSeconds: 1, now: () => 1_000 });
    const token = sessions.issue(user);
    const verifier = createSessionService({ secret: 'secret', now: () => 3_000 });

    assert.equal(sessions.verify(), null);
    assert.equal(sessions.verify(`${token}extra`), null);
    assert.equal(sessions.verify('bad.signature'), null);
    assert.equal(verifier.verify(token), null);
  });

  test('requires a signing secret and safely reads cookies', () => {
    assert.throws(() => createSessionService({}), /secret is required/i);
    assert.equal(readCookie({ headers: {} }, 'session'), null);
    assert.equal(
      readCookie({ headers: { cookie: 'other=value; session=hello%20world' } }, 'session'),
      'hello world',
    );
    assert.equal(readCookie({ headers: { cookie: 'invalid; other=value' } }, 'session'), null);
  });
});
