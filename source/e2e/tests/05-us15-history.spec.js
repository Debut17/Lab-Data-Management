import { expect, test } from '@playwright/test';

import {
  ADMIN_NAME,
  CENTRIFUGE,
  expectFieldChange,
  openAdminView,
  signIn,
} from './helpers.js';

const NEW_SPECIFICATIONS = 'Maximum speed: 18,000 rpm (E2E)';

test.describe('US-15 change history', () => {
  test('the newest change is listed first with who made it and what changed', async ({ page }) => {
    await signIn(page, 'admin');
    const { data } = await (await page.request.get('/api/admin/resources')).json();
    const { id: _id, archived: _archived, ...current } = data.resources.find(
      (resource) => resource.id === CENTRIFUGE.id,
    );
    const saved = await page.request.put(`/api/admin/resources/${CENTRIFUGE.id}`, {
      data: { ...current, specifications: NEW_SPECIFICATIONS },
    });
    expect(saved.status()).toBe(200);

    await openAdminView(page, 'Change History');

    const newest = page.locator('li.audit-entry').first();
    await expect(newest).toContainText('Resource updated');
    await expect(newest).toContainText(`RESOURCE · ${CENTRIFUGE.id}`);
    await expect(newest.locator('h3')).toHaveText(ADMIN_NAME);
    await expect(newest.locator('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/);
    await expectFieldChange(newest, 'Specifications', current.specifications, NEW_SPECIFICATIONS);
  });

  test('saving without changes adds no history entry', async ({ page }) => {
    await signIn(page, 'admin');
    const before = await (await page.request.get('/api/admin/audit-logs')).json();
    const { data } = await (await page.request.get('/api/admin/resources')).json();
    const { id: _id, archived: _archived, ...current } = data.resources.find(
      (resource) => resource.id === CENTRIFUGE.id,
    );

    const saved = await page.request.put(`/api/admin/resources/${CENTRIFUGE.id}`, { data: current });
    expect(saved.status()).toBe(200);

    const after = await (await page.request.get('/api/admin/audit-logs')).json();
    expect(after.data.auditLogs[0].id).toBe(before.data.auditLogs[0].id);
  });

  test('change history is only available to administrators', async ({ page }) => {
    for (const role of ['member', 'staff']) {
      await signIn(page, role);
      await expect(page.getByRole('heading', { name: 'Change History' })).toHaveCount(0);
      expect((await page.request.get('/api/admin/audit-logs')).status(), role).toBe(403);
      await page.getByRole('button', { name: 'Sign out' }).click();
    }
  });
});
