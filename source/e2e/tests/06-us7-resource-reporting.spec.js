import { expect, test } from '@playwright/test';

import {
  MICROSCOPE,
  openAdminView,
  signIn,
  signInAs,
} from './helpers.js';

const DESCRIPTION = 'The microscope stage is sticking during sample positioning (Iteration 5 E2E).';

test.describe('US-7 resource problem reporting', () => {
  test('a staff report persists and reaches the administrator inbox', async ({ browser }) => {
    const staffPage = await signInAs(browser, 'staff');
    const form = staffPage.getByRole('region', { name: 'Report a Resource Problem' });

    await expect(form).toBeVisible();
    await form.getByLabel('Affected resource').selectOption(MICROSCOPE.id);
    await form.getByLabel('Problem type').selectOption('MALFUNCTION');
    await form.getByLabel('Description').fill(DESCRIPTION);
    await form.getByRole('button', { name: 'Submit problem report' }).click();

    const confirmation = form.getByRole('status');
    await expect(confirmation).toContainText('Problem report submitted. Administrators have been notified.');
    await expect(confirmation).toContainText(MICROSCOPE.name);
    await staffPage.context().close();

    const adminPage = await signInAs(browser, 'admin');
    await openAdminView(adminPage, 'Problem Notifications');

    const notification = adminPage.locator('article').filter({ hasText: DESCRIPTION });
    await expect(notification).toHaveCount(1);
    await expect(notification).toContainText(MICROSCOPE.name);
    await expect(notification).toContainText('Equipment malfunction');
    await expect(notification).toContainText('Local Lab Staff');
    await expect(notification).toContainText('staff@local.test');
    await expect(notification).toContainText('Pending');
    await expect(notification.getByText('New notification')).toBeVisible();

    await notification.getByRole('button', { name: 'Mark as read' }).click();
    await expect(notification.getByText('Read', { exact: true })).toBeVisible();
    await expect(notification.getByRole('button', { name: 'Mark as read' })).toHaveCount(0);

    await adminPage.reload();
    await openAdminView(adminPage, 'Problem Notifications');
    const persisted = adminPage.locator('article').filter({ hasText: DESCRIPTION });
    await expect(persisted.getByText('Read', { exact: true })).toBeVisible();
    await adminPage.context().close();
  });

  test('the report and notification APIs enforce role boundaries', async ({ page }) => {
    await signIn(page, 'member');
    const memberReport = await page.request.post('/api/resource-reports', {
      data: {
        resourceId: MICROSCOPE.id,
        problemType: 'DAMAGE',
        description: DESCRIPTION,
      },
    });
    expect(memberReport.status()).toBe(403);
    await page.getByRole('button', { name: 'Sign out' }).click();

    await signIn(page, 'staff');
    const staffInbox = await page.request.get('/api/admin/resource-report-notifications');
    expect(staffInbox.status()).toBe(403);
  });

  test('invalid report data is rejected without creating an administrator notification', async ({ page }) => {
    await signIn(page, 'admin');
    const beforeResponse = await page.request.get('/api/admin/resource-report-notifications');
    expect(beforeResponse.status()).toBe(200);
    const before = (await beforeResponse.json()).data.notifications;
    await page.getByRole('button', { name: 'Sign out' }).click();

    await signIn(page, 'staff');
    const invalid = await page.request.post('/api/resource-reports', {
      data: {
        resourceId: 'not-a-resource-id',
        problemType: 'UNSUPPORTED',
        description: '   ',
      },
    });
    expect(invalid.status()).toBe(422);
    await page.getByRole('button', { name: 'Sign out' }).click();

    await signIn(page, 'admin');
    const afterResponse = await page.request.get('/api/admin/resource-report-notifications');
    expect(afterResponse.status()).toBe(200);
    const after = (await afterResponse.json()).data.notifications;
    expect(after).toHaveLength(before.length);
  });
});
