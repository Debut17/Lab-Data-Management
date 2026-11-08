import { expect, test } from '@playwright/test';

import {
  ADMIN_NAME,
  CENTRIFUGE,
  MICROSCOPE,
  openAdminView,
  signIn,
  signOut,
} from './helpers.js';

// Iteration 5 browser journeys that drive the UI itself: the staff form (US-7),
// the status workflow (US-13), and every Administrative Records tab (US-17).

const STAFF_NAME = 'Local Lab Staff';

function reportForm(page) {
  return page.getByRole('region', { name: 'Report a Resource Problem' });
}

function myReport(page, description) {
  return page.getByRole('region', { name: 'My Problem Reports' })
    .locator('article').filter({ hasText: description });
}

function issueCard(page, description) {
  return page.getByRole('region', { name: 'Issue Reports' })
    .locator('article').filter({ hasText: description });
}

function issueFilter(page, label) {
  return page.getByRole('group', { name: 'Filter issue reports' })
    .getByRole('button', { name: new RegExp(`^${label} \\d+$`) });
}

async function filterCount(page, label) {
  const text = await issueFilter(page, label).innerText();
  return Number(text.match(/(\d+)$/)[1]);
}

function records(page) {
  return page.getByRole('region', { name: 'Administrative Records' });
}

function summaryCard(page, title) {
  return records(page).locator('.records-card').filter({ hasText: title });
}

async function summaryValue(page, title) {
  return Number(await summaryCard(page, title).locator('strong').innerText());
}

async function openRecordsTab(page, name) {
  const tab = records(page).getByRole('tab', { name, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(records(page).getByRole('status')).toHaveCount(0);
}

function recordRow(page, text) {
  return records(page).getByRole('tabpanel').getByRole('row').filter({ hasText: text });
}

async function submitReportThroughForm(page, description, problemType = 'DAMAGE') {
  const form = reportForm(page);
  await form.getByLabel('Affected resource').selectOption(MICROSCOPE.id);
  await form.getByLabel('Problem type').selectOption(problemType);
  await form.getByLabel('Description').fill(description);
  await form.getByRole('button', { name: 'Submit problem report' }).click();
  await expect(form.getByRole('status')).toContainText('Problem report submitted.');
}

async function openUpdateForm(page, description) {
  const card = issueCard(page, description);
  await card.getByRole('button', { name: `Update ${MICROSCOPE.name} report` }).click();
  return card.getByRole('form', { name: `Update ${MICROSCOPE.name} report` });
}

test.describe('Iteration 5 UI journeys', () => {
  test('US-7: the staff form refuses an incomplete report and lists a submitted one as Pending', async ({ page }) => {
    const description = 'The microscope stage clip is cracked (US-7 UI journey).';
    await signIn(page, 'staff');
    const form = reportForm(page);

    // Whitespace passes the browser "required" check, so the app's own validation must stop it.
    await form.getByLabel('Affected resource').selectOption(MICROSCOPE.id);
    await form.getByLabel('Problem type').selectOption('DAMAGE');
    await form.getByLabel('Description').fill('   ');
    await form.getByRole('button', { name: 'Submit problem report' }).click();
    await expect(form.getByRole('alert'))
      .toHaveText('Select a resource and problem type, and describe the problem.');
    await expect(form.getByRole('status')).toHaveCount(0);

    await form.getByLabel('Description').fill(description);
    await form.getByRole('button', { name: 'Submit problem report' }).click();
    const confirmation = form.getByRole('status');
    await expect(confirmation).toContainText(`${MICROSCOPE.name} · Physical damage · Pending`);
    await expect(confirmation).toContainText(`Reported by ${STAFF_NAME}`);

    // The form resets so the same report is not submitted twice by accident.
    await expect(form.getByLabel('Description')).toHaveValue('');
    await expect(form.getByLabel('Affected resource')).toHaveValue('');

    const mine = myReport(page, description);
    await expect(mine).toHaveCount(1);
    await expect(mine).toContainText('Pending');
    await expect(mine).toContainText('Physical damage');

    await page.reload();
    await expect(myReport(page, description)).toContainText('Pending');
  });

  test('US-13: a report moves Pending → In progress → Resolved and the filters and reporter follow', async ({ page }) => {
    const description = 'The microscope fine-focus knob grinds (US-13 UI journey).';
    const progressNote = 'Replacement knob ordered from the supplier.';
    const outcome = 'The fine-focus knob was replaced and tested.';

    await signIn(page, 'staff');
    await submitReportThroughForm(page, description, 'MALFUNCTION');
    await signOut(page);

    await signIn(page, 'admin');
    await openAdminView(page, 'Issue Reports');
    await expect(issueCard(page, description)).toContainText('Pending');
    const openBefore = await filterCount(page, 'Open');
    const resolvedBefore = await filterCount(page, 'Resolved');

    // A pending report opens the editor on "In progress", and a note is optional there.
    let update = await openUpdateForm(page, description);
    await expect(update.getByLabel('Status')).toHaveValue('IN_PROGRESS');
    await update.getByLabel(/Resolution note/).fill(progressNote);
    await update.getByRole('button', { name: 'Save update' }).click();
    await expect(page.getByRole('status'))
      .toHaveText(`${MICROSCOPE.name} is now In progress. ${STAFF_NAME} was notified.`);
    await expect(issueCard(page, description)).toContainText('In progress');
    await expect(issueCard(page, description)).toContainText(`by ${ADMIN_NAME}`);
    await expect(issueFilter(page, 'Open')).toHaveText(`Open ${openBefore}`);

    // Resolving needs a real outcome; whitespace is refused before anything is saved.
    update = await openUpdateForm(page, description);
    await update.getByLabel('Status').selectOption('RESOLVED');
    await update.getByLabel(/Resolution note/).fill('   ');
    await update.getByRole('button', { name: 'Save update' }).click();
    await expect(update.getByRole('alert')).toHaveText('Add a resolution note describing the outcome.');
    await update.getByRole('button', { name: 'Cancel' }).click();
    await expect(issueCard(page, description)).toContainText('In progress');

    update = await openUpdateForm(page, description);
    await update.getByLabel('Status').selectOption('RESOLVED');
    await update.getByLabel(/Resolution note/).fill(outcome);
    await update.getByRole('button', { name: 'Save update' }).click();
    await expect(page.getByRole('status')).toContainText(`${MICROSCOPE.name} is now Resolved`);

    // The resolved report leaves the Open filter and appears under Resolved.
    await expect(issueFilter(page, 'Open')).toHaveText(`Open ${openBefore - 1}`);
    await expect(issueFilter(page, 'Resolved')).toHaveText(`Resolved ${resolvedBefore + 1}`);
    await expect(issueCard(page, description)).toHaveCount(0);
    await issueFilter(page, 'Resolved').click();
    await expect(issueCard(page, description)).toContainText(outcome);
    await issueFilter(page, 'All').click();
    await expect(issueCard(page, description)).toHaveCount(1);

    await signOut(page);
    await signIn(page, 'staff');
    const mine = myReport(page, description);
    await expect(mine).toContainText('Resolved');
    await expect(mine).toContainText(outcome);
    await expect(mine).toContainText(`by ${ADMIN_NAME}`);
  });

  test('US-17: summary cards match the API and update after a new report', async ({ page }) => {
    await signIn(page, 'admin');
    await openAdminView(page, 'Administrative Records');
    await expect(page.getByRole('heading', { name: 'Administrative Records', level: 1 })).toBeVisible();

    const summaryResponse = await page.request.get('/api/admin/records/summary');
    const { data: summary } = await summaryResponse.json();
    await expect(summaryCard(page, 'Resources').locator('strong')).toHaveText(String(summary.resources.total));
    await expect(summaryCard(page, 'Bookings').locator('strong')).toHaveText(String(summary.bookings.total));
    await expect(summaryCard(page, 'Active users').locator('strong')).toHaveText(String(summary.users.total));
    await expect(summaryCard(page, 'Issue reports')).toContainText(
      `${summary.issueReports.byStatus.PENDING} pending · ${summary.issueReports.byStatus.IN_PROGRESS} in progress`,
    );

    const reportsBefore = await summaryValue(page, 'Issue reports');
    const auditBefore = await summaryValue(page, 'Audit entries');
    await signOut(page);

    await signIn(page, 'staff');
    await submitReportThroughForm(page, 'The microscope lamp housing is loose (US-17 summary journey).');
    await signOut(page);

    await signIn(page, 'admin');
    await openAdminView(page, 'Administrative Records');
    await expect(summaryCard(page, 'Issue reports').locator('strong')).toHaveText(String(reportsBefore + 1));
    await expect(summaryCard(page, 'Issue reports'))
      .toContainText(`${summary.issueReports.byStatus.PENDING + 1} pending`);
    await expect(summaryCard(page, 'Audit entries').locator('strong')).toHaveText(String(auditBefore + 1));
  });

  test('US-17: the Bookings tab filters by status and shows the rejection reason', async ({ page }) => {
    const reason = 'The centrifuge is reserved for calibration that week (US-17 bookings journey).';
    await signIn(page, 'member');
    const start = new Date(Date.UTC(2031, 0, 14, 2, 0));
    const created = await page.request.post('/api/bookings', {
      data: {
        resourceId: CENTRIFUGE.id,
        startTime: start.toISOString(),
        endTime: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
      },
    });
    expect(created.status()).toBe(201);
    const { data: booking } = await created.json();
    await signOut(page);

    await signIn(page, 'admin');
    const declined = await page.request.patch(`/api/admin/bookings/${booking.id}`, {
      data: { decision: 'REJECT', reason },
    });
    expect(declined.status()).toBe(200);

    await openAdminView(page, 'Administrative Records');
    await openRecordsTab(page, 'Bookings');
    const statusFilter = records(page).getByLabel('Booking status');
    await expect(statusFilter).toHaveValue('ALL');
    await expect(recordRow(page, reason)).toContainText('Rejected');

    await statusFilter.selectOption('REJECTED');
    const rejected = recordRow(page, reason);
    await expect(rejected).toContainText(CENTRIFUGE.name);
    await expect(rejected).toContainText('member@local.test');
    await expect(rejected).toContainText(ADMIN_NAME);

    await statusFilter.selectOption('PENDING');
    await expect(recordRow(page, reason)).toHaveCount(0);
    const statusCells = records(page).getByRole('tabpanel').locator('tbody tr td:nth-child(4)');
    await expect(statusCells.first()).toHaveText('Pending');
    for (const status of await statusCells.allInnerTexts()) {
      expect(status).toBe('Pending');
    }
  });

  test('US-17: the Resources, User Roles, and Audit Log tabs list records and link to Change History', async ({ page }) => {
    await signIn(page, 'admin');
    await openAdminView(page, 'Administrative Records');

    // Resources is the default tab.
    await expect(records(page).getByRole('tab', { name: 'Resources' })).toHaveAttribute('aria-selected', 'true');
    // Every resource is listed, archived ones included (an earlier US-9 journey moves the microscope).
    const { data: summary } = await (await page.request.get('/api/admin/records/summary')).json();
    await expect(records(page).getByRole('tabpanel').locator('tbody tr')).toHaveCount(summary.resources.total);
    const microscope = recordRow(page, MICROSCOPE.name);
    await expect(microscope).toContainText('Microscope');
    await expect(microscope).toContainText('Active');

    await openRecordsTab(page, 'User Roles');
    await expect(recordRow(page, 'admin@local.test')).toContainText('System Administrator');
    await expect(recordRow(page, 'staff@local.test')).toContainText('Lab Staff');
    await expect(recordRow(page, 'member@local.test')).toContainText('Lab Member');

    // The tab shows the latest ten audit entries, newest first, as the audit API returns them.
    const auditResponse = await page.request.get('/api/admin/audit-logs?page=1&limit=10');
    const { data: audit } = await auditResponse.json();
    await openRecordsTab(page, 'Audit Log');
    const rows = records(page).getByRole('tabpanel').locator('tbody tr');
    await expect(rows).toHaveCount(audit.auditLogs.length);
    await expect(rows.first()).toContainText(audit.auditLogs[0].actorName);
    await expect(rows.last()).toContainText(audit.auditLogs.at(-1).actorName);

    await records(page).getByRole('button', { name: 'Open full Change History' }).click();
    await expect(page.getByRole('heading', { name: 'Change History', level: 1 })).toBeVisible();
    await expect(records(page)).toHaveCount(0);
  });

  test('US-7 + US-13 + US-17: one report travels from staff to administrator to the records view', async ({ page }) => {
    const description = 'The microscope camera adapter is misaligned (lifecycle journey).';
    const outcome = 'The camera adapter was realigned and the image checked.';

    await signIn(page, 'staff');
    await submitReportThroughForm(page, description, 'INCORRECT_RECORD');
    await signOut(page);

    await signIn(page, 'admin');
    await openAdminView(page, 'Problem Notifications');
    const notification = page.locator('article').filter({ hasText: description });
    await expect(notification).toContainText('Incorrect resource record');
    await expect(notification.getByText('New notification')).toBeVisible();

    await openAdminView(page, 'Issue Reports');
    const update = await openUpdateForm(page, description);
    await update.getByLabel('Status').selectOption('RESOLVED');
    await update.getByLabel(/Resolution note/).fill(outcome);
    await update.getByRole('button', { name: 'Save update' }).click();
    await expect(page.getByRole('status')).toContainText(`${MICROSCOPE.name} is now Resolved`);

    await openAdminView(page, 'Administrative Records');
    await openRecordsTab(page, 'Issue Reports');
    const issue = recordRow(page, description);
    await expect(issue).toContainText('Incorrect record');
    await expect(issue).toContainText(STAFF_NAME);
    await expect(issue).toContainText('Resolved');
    await expect(issue).toContainText(outcome);
    await expect(issue).toContainText(ADMIN_NAME);

    await openRecordsTab(page, 'Audit Log');
    const latest = records(page).getByRole('tabpanel').locator('tbody tr').first();
    await expect(latest).toContainText('Resource report status changed');
    await expect(latest).toContainText(ADMIN_NAME);
  });
});

test.describe('Iteration 5 views on a phone-sized screen', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('an administrator reaches Issue Reports and Administrative Records from the menu', async ({ page }) => {
    await signIn(page, 'admin');

    await openAdminView(page, 'Issue Reports');
    await expect(page.getByRole('heading', { name: 'Issue Reports', level: 1 })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Filter issue reports' })).toBeVisible();

    await openAdminView(page, 'Administrative Records');
    await expect(page.getByRole('heading', { name: 'Administrative Records', level: 1 })).toBeVisible();
    await expect(summaryCard(page, 'Issue reports')).toBeVisible();

    // The page itself must not scroll sideways; wide tables scroll inside their own wrapper.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
