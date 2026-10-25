import { expect } from '@playwright/test';

// Seeded by source/database/seeds.sql. Both resources start with one PENDING booking.
export const MICROSCOPE = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'BX53 Upright Microscope',
  location: 'Biology Lab A, Room 201',
};
export const CENTRIFUGE = {
  id: '10000000-0000-4000-8000-000000000002',
  name: 'High-Speed Centrifuge',
};
export const ADMIN_NAME = 'Local System Administrator';

const SIGN_IN_BUTTONS = {
  admin: 'Sign in as System Administrator',
  member: 'Sign in as Lab Member',
  staff: 'Sign in as Lab Staff',
};

export async function signIn(page, role) {
  await page.goto('/');
  await page.getByRole('button', { name: SIGN_IN_BUTTONS[role] }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

/** Opens a new browser context so two roles can be signed in at the same time. */
export async function signInAs(browser, role) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, role);
  return page;
}

export async function openAdminView(page, label) {
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Administrator navigation' })
    .getByRole('button', { name: label, exact: true })
    .click();
}

export function editorCard(page, name) {
  return page
    .locator('.resource-editor-card')
    .filter({ has: page.getByRole('heading', { name, level: 3, exact: true }) });
}

// The availability <form> and its <select> share the label "Availability for <name>".
export function availabilitySelect(page, name) {
  return page
    .getByRole('form', { name: `Availability for ${name}`, exact: true })
    .locator('select');
}

export function memberResourceRow(page, name) {
  return page
    .getByRole('list', { name: 'Current resource availability' })
    .getByRole('listitem', { name, exact: true });
}

export function bookingOption(page, name) {
  return page.locator('select[name="resourceId"] option', { hasText: name });
}

/** The newest Change History entry for one action on one record. */
export function historyEntry(page, action, recordId) {
  return page
    .locator('li.audit-entry')
    .filter({ hasText: action })
    .filter({ hasText: recordId })
    .first();
}

export async function expectFieldChange(entry, field, before, after) {
  await entry.getByText('View changes').click();
  const change = entry.locator('.audit-change').filter({
    has: entry.page().locator('dt', { hasText: new RegExp(`^${field}$`) }),
  });
  await expect(change.locator('dd').nth(0)).toHaveText(`Before ${before}`);
  await expect(change.locator('dd').nth(1)).toHaveText(`After ${after}`);
}
