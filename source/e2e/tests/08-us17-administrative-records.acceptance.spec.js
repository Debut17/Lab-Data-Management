import { expect, test } from '@playwright/test';

import {
  ADMIN_NAME,
  MICROSCOPE,
  openAdminView,
  signIn,
} from './helpers.js';

const DESCRIPTION = 'The microscope illumination flickers intermittently (US-17 acceptance).';
const OUTCOME = 'The loose power connector was replaced and the illumination test passed.';

async function createResolvedReport(page) {
  await signIn(page, 'staff');
  const created = await page.request.post('/api/resource-reports', {
    data: {
      resourceId: MICROSCOPE.id,
      problemType: 'MALFUNCTION',
      description: DESCRIPTION,
    },
  });
  expect(created.status()).toBe(201);
  const { data: report } = await created.json();
  await page.getByRole('button', { name: 'Sign out' }).click();

  await signIn(page, 'admin');
  const resolved = await page.request.patch(`/api/admin/resource-reports/${report.id}/resolve`, {
    data: { outcome: OUTCOME },
  });
  expect(resolved.status()).toBe(200);
  return report;
}

test.describe('US-17 administrative records acceptance contract', () => {
  test('an administrator sees the complete issue lifecycle in one place', async ({ page }) => {
    test.fail(true, 'US-17 and its US-13 dependency are not implemented on the current baseline. Remove this marker when the contract passes.');

    const report = await createResolvedReport(page);
    await openAdminView(page, 'Administrative Records');

    const records = page.getByRole('region', { name: 'Administrative Records' });
    const issueRecord = records.locator('article').filter({ hasText: DESCRIPTION });
    await expect(issueRecord).toContainText('Resource problem');
    await expect(issueRecord).toContainText(MICROSCOPE.name);
    await expect(issueRecord).toContainText('Local Lab Staff');
    await expect(issueRecord).toContainText('Resolved');
    await expect(issueRecord).toContainText(OUTCOME);
    await expect(issueRecord).toContainText(ADMIN_NAME);
    await expect(issueRecord).toContainText(report.id);
    await expect(issueRecord.locator('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/);
  });

  test('administrative records are restricted to system administrators', async ({ page }) => {
    test.fail(true, 'US-17 is not implemented on the current baseline. Remove this marker when the contract passes.');

    for (const role of ['member', 'staff']) {
      await signIn(page, role);
      await expect(page.getByRole('heading', { name: 'Administrative Records' })).toHaveCount(0);
      const forbidden = await page.request.get('/api/admin/records');
      expect(forbidden.status(), role).toBe(403);
      await page.getByRole('button', { name: 'Sign out' }).click();
    }

    await signIn(page, 'admin');
    const allowed = await page.request.get('/api/admin/records');
    expect(allowed.status()).toBe(200);
  });

  test('records remain current after a new operation and are ordered newest first', async ({ page }) => {
    test.fail(true, 'US-17 and its US-13 dependency are not implemented on the current baseline. Remove this marker when the contract passes.');

    const report = await createResolvedReport(page);
    const response = await page.request.get('/api/admin/records');
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toContain('no-store');

    const { data } = await response.json();
    expect(data.records.length).toBeGreaterThan(0);
    expect(data.records[0]).toMatchObject({
      entityType: 'RESOURCE_REPORT',
      affectedRecordId: report.id,
      status: 'RESOLVED',
      outcome: OUTCOME,
    });

    const times = data.records.map((record) => Date.parse(record.occurredAt));
    expect(times).toEqual([...times].sort((left, right) => right - left));
  });
});
