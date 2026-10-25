import { expect, test } from '@playwright/test';

import { signIn } from './helpers.js';

const ADMIN_VIEWS = [
  'Create Resource',
  'Edit Resources',
  'Resource Availability',
  'Archive Resources',
  'Booking Requests',
  'User Roles',
  'Change History',
];

test.describe('Role-based access', () => {
  test('an administrator sees every administration view', async ({ page }) => {
    await signIn(page, 'admin');
    await page.getByRole('button', { name: 'Open navigation' }).click();

    const navigation = page.getByRole('navigation', { name: 'Administrator navigation' });
    await expect(navigation.getByRole('button')).toHaveText(ADMIN_VIEWS);
  });

  test('a lab member only sees booking views and is refused by admin APIs', async ({ page }) => {
    await signIn(page, 'member');
    await expect(page.getByRole('heading', { name: 'Resource Booking', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Open navigation' }).click();

    const navigation = page.getByRole('navigation', { name: 'Member navigation' });
    await expect(navigation.getByRole('button')).toHaveText(['Request Booking', 'My Bookings']);
    for (const view of ['Edit Resources', 'Archive Resources', 'Resource Availability', 'Change History']) {
      await expect(page.getByRole('button', { name: view, exact: true })).toHaveCount(0);
    }

    for (const path of ['/api/admin/resources', '/api/admin/audit-logs']) {
      const response = await page.request.get(path);
      expect(response.status(), path).toBe(403);
    }
  });

  test('lab staff have no navigation and no admin access', async ({ page }) => {
    await signIn(page, 'staff');

    await expect(page.getByRole('heading', { name: 'Lab Operations', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open navigation' })).toHaveCount(0);
    expect((await page.request.get('/api/admin/audit-logs')).status()).toBe(403);
  });

  for (const role of ['admin', 'member', 'staff']) {
    test(`${role} can sign out and loses access`, async ({ page }) => {
      await signIn(page, role);

      await page.getByRole('button', { name: 'Sign out' }).click();

      await expect(page.getByRole('heading', { name: 'Local review sign in' })).toBeVisible();
      expect((await page.request.get('/api/auth/session')).status()).toBe(401);
    });
  }
});
