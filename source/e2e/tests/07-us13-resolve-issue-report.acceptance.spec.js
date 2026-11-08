import { expect, test } from '@playwright/test';

import {
  ADMIN_NAME,
  MICROSCOPE,
  openAdminView,
  signIn,
} from './helpers.js';

const DESCRIPTION = 'The microscope focus control slips during operation (US-13 acceptance).';
const OUTCOME = 'The focus assembly was tightened, calibrated, and verified operational.';

async function createPendingReport(page) {
  await signIn(page, 'staff');
  const response = await page.request.post('/api/resource-reports', {
    data: {
      resourceId: MICROSCOPE.id,
      problemType: 'MALFUNCTION',
      description: DESCRIPTION,
    },
  });
  expect(response.status()).toBe(201);
  const { data } = await response.json();
  await page.getByRole('button', { name: 'Sign out' }).click();
  return data;
}

async function openResolvedReports(page) {
  const filters = page.getByRole('group', { name: 'Filter issue reports' });
  await filters.getByRole('button', { name: /^Resolved/ }).click();
}

test.describe('US-13 issue report resolution', () => {
  test('an administrator records an outcome that persists for the reporter', async ({ page }) => {
    await createPendingReport(page);
    await signIn(page, 'admin');
    await openAdminView(page, 'Issue Reports');

    let report = page.locator('article').filter({ hasText: DESCRIPTION });
    await expect(report).toBeVisible();
    await report.getByRole('button', { name: `Update ${MICROSCOPE.name} report` }).click();

    const form = report.getByRole('form', { name: `Update ${MICROSCOPE.name} report` });
    await form.getByLabel('Status').selectOption('RESOLVED');
    await form.getByLabel(/Resolution note/).fill(OUTCOME);
    await form.getByRole('button', { name: 'Save update' }).click();

    await expect(page.getByRole('status')).toContainText(`${MICROSCOPE.name} is now Resolved`);
    await openResolvedReports(page);
    report = page.locator('article').filter({ hasText: DESCRIPTION });
    await expect(report).toContainText('Resolved');
    await expect(report).toContainText(OUTCOME);
    await expect(report).toContainText(`by ${ADMIN_NAME}`);

    await page.reload();
    await openAdminView(page, 'Issue Reports');
    await openResolvedReports(page);
    const persisted = page.locator('article').filter({ hasText: DESCRIPTION });
    await expect(persisted).toContainText('Resolved');
    await expect(persisted).toContainText(OUTCOME);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await signIn(page, 'staff');
    const reporterView = page.locator('article').filter({ hasText: DESCRIPTION });
    await expect(reporterView).toContainText('Resolved');
    await expect(reporterView).toContainText(OUTCOME);
    await expect(reporterView).toContainText(`by ${ADMIN_NAME}`);
  });

  test('only administrators can resolve and invalid or unchanged updates are rejected', async ({ page }) => {
    const report = await createPendingReport(page);
    const update = { status: 'RESOLVED', resolutionNote: OUTCOME };

    for (const role of ['member', 'staff']) {
      await signIn(page, role);
      const forbidden = await page.request.patch(`/api/admin/resource-reports/${report.id}`, {
        data: update,
      });
      expect(forbidden.status(), role).toBe(403);
      await page.getByRole('button', { name: 'Sign out' }).click();
    }

    await signIn(page, 'admin');
    const invalid = await page.request.patch(`/api/admin/resource-reports/${report.id}`, {
      data: { status: 'RESOLVED', resolutionNote: '   ' },
    });
    expect(invalid.status()).toBe(422);

    const resolved = await page.request.patch(`/api/admin/resource-reports/${report.id}`, {
      data: update,
    });
    expect(resolved.status()).toBe(200);
    const resolvedBody = await resolved.json();
    expect(resolvedBody).toMatchObject({
      success: true,
      data: {
        id: report.id,
        status: 'RESOLVED',
        resolutionNote: OUTCOME,
        reporterNotified: true,
      },
    });

    const unchanged = await page.request.patch(`/api/admin/resource-reports/${report.id}`, {
      data: update,
    });
    expect(unchanged.status()).toBe(409);
    await expect(unchanged.json()).resolves.toMatchObject({
      error: { code: 'REPORT_UNCHANGED' },
    });
  });

  test('resolving a report creates a traceable audit record', async ({ page }) => {
    const report = await createPendingReport(page);
    await signIn(page, 'admin');
    const resolved = await page.request.patch(`/api/admin/resource-reports/${report.id}`, {
      data: { status: 'RESOLVED', resolutionNote: OUTCOME },
    });
    expect(resolved.status()).toBe(200);

    const history = await page.request.get('/api/admin/audit-logs');
    expect(history.status()).toBe(200);
    const { data } = await history.json();
    const entry = data.auditLogs.find((item) => (
      item.action === 'RESOURCE_REPORT_STATUS_CHANGED'
      && item.affectedRecordId === report.id
    ));
    expect(entry).toMatchObject({
      actorName: ADMIN_NAME,
      entityType: 'RESOURCE_REPORT',
      affectedRecordId: report.id,
    });
    expect(entry.changes).toMatchObject({
      status: { before: 'PENDING', after: 'RESOLVED' },
      resolutionNote: { before: null, after: OUTCOME },
    });
  });
});
