import { expect, test } from '@playwright/test';

import {
  ADMIN_NAME,
  MICROSCOPE,
  openNavigation,
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
  const resolved = await page.request.patch(`/api/admin/resource-reports/${report.id}`, {
    data: { status: 'RESOLVED', resolutionNote: OUTCOME },
  });
  expect(resolved.status()).toBe(200);
  return report;
}

test.describe('US-17 administrative records acceptance contract', () => {
  test('an administrator sees the complete issue lifecycle in one place', async ({ page }) => {
    const report = await createResolvedReport(page);
    await openNavigation(page);
    const recordsButton = page
      .getByRole('navigation', { name: 'Administrator navigation' })
      .getByRole('button', { name: 'Administrative Records', exact: true });
    await expect(recordsButton).toBeVisible({ timeout: 1_000 });
    await recordsButton.click();

    const records = page.getByRole('region', { name: 'Administrative Records' });
    await records.getByRole('tab', { name: 'Issue Reports' }).click();
    const issueRecord = records.getByRole('row').filter({ hasText: DESCRIPTION });
    await expect(issueRecord).toContainText('Malfunction');
    await expect(issueRecord).toContainText(MICROSCOPE.name);
    await expect(issueRecord).toContainText('Local Lab Staff');
    await expect(issueRecord).toContainText('Resolved');
    await expect(issueRecord).toContainText(OUTCOME);
    await expect(issueRecord).toContainText(ADMIN_NAME);

    const response = await page.request.get('/api/admin/resource-reports');
    expect(response.status()).toBe(200);
    const { data } = await response.json();
    expect(data.reports.find((item) => item.id === report.id)).toMatchObject({
      id: report.id,
      status: 'RESOLVED',
      resolutionNote: OUTCOME,
      statusUpdatedByName: ADMIN_NAME,
    });
  });

  test('administrative records are restricted to system administrators', async ({ page }) => {
    for (const role of ['member', 'staff']) {
      await signIn(page, role);
      await expect(page.getByRole('heading', { name: 'Administrative Records' })).toHaveCount(0);
      for (const path of ['/api/admin/records/summary', '/api/admin/records/bookings?status=ALL']) {
        const forbidden = await page.request.get(path);
        expect(forbidden.status(), `${role}: ${path}`).toBe(403);
      }
      await page.getByRole('button', { name: 'Sign out' }).click();
    }

    await signIn(page, 'admin');
    for (const path of ['/api/admin/records/summary', '/api/admin/records/bookings?status=ALL']) {
      const allowed = await page.request.get(path);
      expect(allowed.status(), path).toBe(200);
    }
  });

  test('records remain current after a new operation and are ordered newest first', async ({ page }) => {
    const report = await createResolvedReport(page);
    const response = await page.request.get('/api/admin/resource-reports');
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toContain('no-store');

    const { data } = await response.json();
    expect(data.reports.length).toBeGreaterThan(0);
    expect(data.reports[0]).toMatchObject({
      id: report.id,
      status: 'RESOLVED',
      resolutionNote: OUTCOME,
    });

    const times = data.reports.map((record) => Date.parse(record.submittedAt));
    expect(times).toEqual([...times].sort((left, right) => right - left));
  });
});
