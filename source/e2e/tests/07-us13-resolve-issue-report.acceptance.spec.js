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

test.describe('US-13 resolve issue report acceptance contract', () => {
  test('an administrator records an outcome that remains after reload', async ({ page }) => {
    test.fail(true, 'US-13 is not implemented on the current baseline. Remove this marker when the contract passes.');

    await createPendingReport(page);
    await signIn(page, 'admin');
    await openAdminView(page, 'Problem Notifications');

    const report = page.locator('article').filter({ hasText: DESCRIPTION });
    const resolveButton = report.getByRole('button', { name: 'Resolve issue' });
    // Fail as an assertion while US-13 is absent. A raw locator click would wait
    // for the whole test timeout, which Playwright does not treat as an expected failure.
    await expect(resolveButton).toBeVisible({ timeout: 1_000 });
    await resolveButton.click();
    const form = page.getByRole('form', { name: 'Resolve issue report' });
    await form.getByLabel('Resolution outcome').fill(OUTCOME);
    await form.getByRole('button', { name: 'Record resolution' }).click();

    await expect(report).toContainText('Resolved');
    await expect(report).toContainText(OUTCOME);
    await expect(report).toContainText(`Resolved by ${ADMIN_NAME}`);
    await expect(report.locator('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/);

    await page.reload();
    await openAdminView(page, 'Problem Notifications');
    const persisted = page.locator('article').filter({ hasText: DESCRIPTION });
    await expect(persisted).toContainText('Resolved');
    await expect(persisted).toContainText(OUTCOME);
  });

  test('only administrators can resolve and invalid or repeated outcomes are rejected', async ({ page }) => {
    test.fail(true, 'US-13 is not implemented on the current baseline. Remove this marker when the contract passes.');

    const report = await createPendingReport(page);

    for (const role of ['member', 'staff']) {
      await signIn(page, role);
      const forbidden = await page.request.patch(`/api/admin/resource-reports/${report.id}/resolve`, {
        data: { outcome: OUTCOME },
      });
      expect(forbidden.status(), role).toBe(403);
      await page.getByRole('button', { name: 'Sign out' }).click();
    }

    await signIn(page, 'admin');
    const invalid = await page.request.patch(`/api/admin/resource-reports/${report.id}/resolve`, {
      data: { outcome: '   ' },
    });
    expect(invalid.status()).toBe(422);

    const resolved = await page.request.patch(`/api/admin/resource-reports/${report.id}/resolve`, {
      data: { outcome: OUTCOME },
    });
    expect(resolved.status()).toBe(200);
    const resolvedBody = await resolved.json();
    expect(resolvedBody).toMatchObject({
      success: true,
      data: {
        id: report.id,
        status: 'RESOLVED',
        resolutionOutcome: OUTCOME,
      },
    });

    const repeated = await page.request.patch(`/api/admin/resource-reports/${report.id}/resolve`, {
      data: { outcome: 'A later outcome must not overwrite the first one.' },
    });
    expect(repeated.status()).toBe(409);
  });

  test('resolving a report creates a traceable audit record', async ({ page }) => {
    test.fail(true, 'US-13 is not implemented on the current baseline. Remove this marker when the contract passes.');

    const report = await createPendingReport(page);
    await signIn(page, 'admin');
    const resolved = await page.request.patch(`/api/admin/resource-reports/${report.id}/resolve`, {
      data: { outcome: OUTCOME },
    });
    expect(resolved.status()).toBe(200);

    const history = await page.request.get('/api/admin/audit-logs');
    expect(history.status()).toBe(200);
    const { data } = await history.json();
    const entry = data.auditLogs.find((item) => (
      item.action === 'RESOURCE_REPORT_RESOLVED'
      && item.affectedRecordId === report.id
    ));
    expect(entry).toMatchObject({
      actorName: ADMIN_NAME,
      entityType: 'RESOURCE_REPORT',
      affectedRecordId: report.id,
    });
    expect(entry.changes).toMatchObject({
      status: { before: 'PENDING', after: 'RESOLVED' },
      resolutionOutcome: { before: null, after: OUTCOME },
    });
  });
});
