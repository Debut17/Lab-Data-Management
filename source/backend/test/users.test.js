import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { UserRoleError } from '../src/repositories/mysqlUserRepository.js';

const AUTH_SECRET = 'test-secret-with-enough-entropy-for-tests';
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const MEMBER_ID = '00000000-0000-4000-8000-000000000002';
const STAFF_ID = '00000000-0000-4000-8000-000000000003';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000099';

function createUserContext({ updateError } = {}) {
  const users = [
    { id: ADMIN_ID, email: 'admin@local.test', displayName: 'Local Administrator', role: 'SYSTEM_ADMIN', isActive: true },
    { id: MEMBER_ID, email: 'member@local.test', displayName: 'Local Lab Member', role: 'LAB_MEMBER', isActive: true },
    { id: STAFF_ID, email: 'staff@local.test', displayName: 'Local Lab Staff', role: 'LAB_STAFF', isActive: true },
  ];
  const roleChanges = [];
  const userRepository = {
    async findByEmail(email) {
      return users.find((user) => user.email === email && user.isActive) ?? null;
    },
    async findActiveById(id) {
      return users.find((user) => user.id === id && user.isActive) ?? null;
    },
    async list() {
      return users;
    },
    async updateRole(id, role, actorId) {
      if (updateError) throw updateError;
      const user = users.find((candidate) => candidate.id === id);
      if (!user) throw new UserRoleError('USER_NOT_FOUND');
      if (user.role === role) throw new UserRoleError('ROLE_UNCHANGED');
      user.role = role;
      roleChanges.push({ id, role, actorId });
      return user;
    },
  };
  const app = createApp({
    bookingRepository: { async listPending() { return []; } },
    resourceRepository: { async create() {}, async listBookable() { return []; } },
    userRepository,
    authSecret: AUTH_SECRET,
    allowDevLogin: true,
    logger: { error() {} },
  });

  return { app, users, roleChanges };
}

async function login(agent, email) {
  await agent.post('/api/auth/dev-login').send({ email }).expect(200);
}

describe('US-14 user role management API', () => {
  test('requires authentication and a System Administrator role', async () => {
    const { app, roleChanges } = createUserContext();

    await request(app).get('/api/admin/users').expect(401);
    await request(app)
      .patch(`/api/admin/users/${MEMBER_ID}/role`)
      .send({ role: 'LAB_STAFF' })
      .expect(401);

    const member = request.agent(app);
    await login(member, 'member@local.test');
    await member.get('/api/admin/users').expect(403);
    const response = await member
      .patch(`/api/admin/users/${STAFF_ID}/role`)
      .send({ role: 'SYSTEM_ADMIN' })
      .expect(403);

    assert.equal(response.body.error.message, 'System Administrator access is required.');
    assert.equal(roleChanges.length, 0);
  });

  test('lists users with their current roles for an administrator', async () => {
    const { app } = createUserContext();
    const admin = request.agent(app);
    await login(admin, 'admin@local.test');

    const response = await admin.get('/api/admin/users').expect(200);

    assert.deepEqual(
      response.body.data.users.map((user) => [user.email, user.role]),
      [
        ['admin@local.test', 'SYSTEM_ADMIN'],
        ['member@local.test', 'LAB_MEMBER'],
        ['staff@local.test', 'LAB_STAFF'],
      ],
    );
  });

  test('assigns a role and records the acting administrator from the session', async () => {
    const { app, roleChanges } = createUserContext();
    const admin = request.agent(app);
    await login(admin, 'admin@local.test');

    const response = await admin
      .patch(`/api/admin/users/${MEMBER_ID}/role`)
      .send({ role: 'LAB_STAFF' })
      .expect(200);

    assert.equal(response.body.data.role, 'LAB_STAFF');
    assert.deepEqual(roleChanges, [{ id: MEMBER_ID, role: 'LAB_STAFF', actorId: ADMIN_ID }]);
  });

  test('applies a granted role immediately without signing in again', async () => {
    const { app } = createUserContext();
    const admin = request.agent(app);
    const member = request.agent(app);
    await login(admin, 'admin@local.test');
    await login(member, 'member@local.test');

    await member.get('/api/admin/users').expect(403);
    await admin
      .patch(`/api/admin/users/${MEMBER_ID}/role`)
      .send({ role: 'SYSTEM_ADMIN' })
      .expect(200);

    await member.get('/api/admin/users').expect(200);
    const session = await member.get('/api/auth/session').expect(200);
    assert.equal(session.body.data.user.role, 'SYSTEM_ADMIN');
  });

  test('applies a revoked role immediately to an existing session', async () => {
    const { app } = createUserContext();
    const admin = request.agent(app);
    const member = request.agent(app);
    await login(admin, 'admin@local.test');
    await login(member, 'member@local.test');
    await admin
      .patch(`/api/admin/users/${MEMBER_ID}/role`)
      .send({ role: 'SYSTEM_ADMIN' })
      .expect(200);
    await member.get('/api/admin/users').expect(200);

    await admin
      .patch(`/api/admin/users/${MEMBER_ID}/role`)
      .send({ role: 'LAB_MEMBER' })
      .expect(200);

    await member.get('/api/admin/users').expect(403);
  });

  test('rejects an existing session once the user is deactivated', async () => {
    const { app, users } = createUserContext();
    const member = request.agent(app);
    await login(member, 'member@local.test');

    users.find((user) => user.id === MEMBER_ID).isActive = false;

    const response = await member.get('/api/auth/session').expect(401);
    assert.equal(response.body.error.code, 'UNAUTHENTICATED');
  });

  test('prevents an administrator from changing their own role', async () => {
    const { app, roleChanges } = createUserContext();
    const admin = request.agent(app);
    await login(admin, 'admin@local.test');

    const response = await admin
      .patch(`/api/admin/users/${ADMIN_ID}/role`)
      .send({ role: 'LAB_MEMBER' })
      .expect(409);

    assert.equal(response.body.error.code, 'SELF_ROLE_CHANGE');
    assert.equal(roleChanges.length, 0);
  });

  test('rejects an invalid identifier, unknown role, or extra fields', async () => {
    const { app, roleChanges } = createUserContext();
    const admin = request.agent(app);
    await login(admin, 'admin@local.test');

    const invalidId = await admin
      .patch('/api/admin/users/not-a-uuid/role')
      .send({ role: 'LAB_STAFF' })
      .expect(422);
    const invalidRole = await admin
      .patch(`/api/admin/users/${MEMBER_ID}/role`)
      .send({ role: 'SUPER_USER' })
      .expect(422);
    await admin
      .patch(`/api/admin/users/${MEMBER_ID}/role`)
      .send({ role: 'LAB_STAFF', actorId: STAFF_ID })
      .expect(422);
    await admin.patch(`/api/admin/users/${MEMBER_ID}/role`).send({}).expect(422);

    assert.equal(invalidId.body.error.code, 'VALIDATION_ERROR');
    assert.ok(invalidId.body.error.details.some((detail) => detail.field === 'id'));
    assert.ok(invalidRole.body.error.details.some((detail) => detail.field === 'role'));
    assert.equal(roleChanges.length, 0);
  });

  test('reports unknown users and unchanged roles', async () => {
    const { app } = createUserContext();
    const admin = request.agent(app);
    await login(admin, 'admin@local.test');

    const missing = await admin
      .patch(`/api/admin/users/${UNKNOWN_ID}/role`)
      .send({ role: 'LAB_STAFF' })
      .expect(404);
    const unchanged = await admin
      .patch(`/api/admin/users/${STAFF_ID}/role`)
      .send({ role: 'LAB_STAFF' })
      .expect(409);

    assert.equal(missing.body.error.code, 'USER_NOT_FOUND');
    assert.equal(unchanged.body.error.code, 'ROLE_UNCHANGED');
  });

  test('hides internal details when the role change fails', async () => {
    const { app } = createUserContext({
      updateError: new Error('database password leaked in stack'),
    });
    const admin = request.agent(app);
    await login(admin, 'admin@local.test');

    const response = await admin
      .patch(`/api/admin/users/${MEMBER_ID}/role`)
      .send({ role: 'LAB_STAFF' })
      .expect(500);

    assert.equal(response.body.error.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(JSON.stringify(response.body), /database password/i);
  });
});
