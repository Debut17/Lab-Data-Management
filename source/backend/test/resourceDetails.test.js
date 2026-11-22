import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';

import { createApp } from '../src/app.js';

const AUTH_SECRET = 'test-secret-with-enough-entropy-for-tests';
const users = [
  { id: 'user-member', email: 'member@local.test', displayName: 'Local Lab Member', role: 'LAB_MEMBER' },
];

const microscope = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'BX53 Upright Microscope',
  category: 'Microscope',
  location: 'Biology Lab A, Room 201',
  description: 'Upright microscope for laboratory observation.',
  responsiblePerson: 'Dr. Example',
  availabilityStatus: 'AVAILABLE',
  currentStatus: 'OPERATIONAL',
};
const centrifuge = {
  id: '10000000-0000-4000-8000-000000000002',
  name: 'High-Speed Centrifuge',
  category: 'Centrifuge',
  location: 'Chemistry Lab, Room 105',
  description: null,
  responsiblePerson: null,
  availabilityStatus: 'UNAVAILABLE',
  currentStatus: 'MAINTENANCE',
};

function createDetailsApp() {
  return createApp({
    resourceRepository: {
      async create() {},
      async listForMembers() {
        return [microscope, centrifuge];
      },
    },
    userRepository: {
      async findByEmail(email) {
        return users.find((user) => user.email === email) ?? null;
      },
      async findActiveById(id) {
        return users.find((user) => user.id === id) ?? null;
      },
    },
    authSecret: AUTH_SECRET,
    allowDevLogin: true,
    logger: { error() {} },
  });
}

describe('US-3 view resource details API', () => {
  test('requires an authenticated user', async () => {
    await request(createDetailsApp()).get('/api/resources').expect(401);
  });

  test('returns every detail field a lab member needs for each resource', async () => {
    const agent = request.agent(createDetailsApp());
    await agent.post('/api/auth/dev-login').send({ email: 'member@local.test' }).expect(200);

    const response = await agent.get('/api/resources').expect(200);

    const [first, second] = response.body.data;
    for (const field of ['description', 'location', 'responsiblePerson', 'availabilityStatus', 'currentStatus']) {
      assert.ok(field in first, `missing ${field}`);
    }
    assert.equal(first.description, microscope.description);
    assert.equal(first.responsiblePerson, microscope.responsiblePerson);
    assert.equal(second.description, null);
    assert.equal(second.responsiblePerson, null);
  });
});
