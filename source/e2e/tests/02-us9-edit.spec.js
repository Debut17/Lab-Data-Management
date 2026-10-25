import { expect, test } from '@playwright/test';

import {
  MICROSCOPE,
  editorCard,
  expectFieldChange,
  historyEntry,
  memberResourceRow,
  openAdminView,
  signIn,
  signInAs,
} from './helpers.js';

const NEW_LOCATION = 'Biology Lab B, Room 305';
const NEW_OWNER = 'Dr. E2E Reviewer';

test.describe('US-9 edit resource records', () => {
  test('an administrator edits a resource and members see the saved details', async ({ page, browser }) => {
    await signIn(page, 'admin');
    await openAdminView(page, 'Edit Resources');
    await expect(page.getByRole('heading', { name: 'Edit Resource Records' })).toBeVisible();

    await editorCard(page, MICROSCOPE.name).getByRole('button', { name: 'Edit' }).click();
    const form = page.locator('.resource-editor-form');
    await expect(form.locator('input[name="location"]')).toHaveValue(MICROSCOPE.location);
    await form.locator('input[name="location"]').fill(NEW_LOCATION);
    await form.locator('input[name="responsiblePerson"]').fill(NEW_OWNER);
    await form.getByRole('button', { name: 'Save Changes' }).click();

    await expect(page.getByRole('status')).toHaveText('Resource updated successfully.');
    await expect(form).toHaveCount(0);
    await expect(editorCard(page, MICROSCOPE.name)).toContainText(NEW_LOCATION);

    // The change is stored on the server, not only in the page state.
    await page.reload();
    await openAdminView(page, 'Edit Resources');
    await expect(editorCard(page, MICROSCOPE.name)).toContainText(NEW_LOCATION);

    const member = await signInAs(browser, 'member');
    await expect(memberResourceRow(member, MICROSCOPE.name)).toContainText(NEW_LOCATION);
    await member.context().close();
  });

  test('the edit is recorded in Change History with before and after values', async ({ page }) => {
    await signIn(page, 'admin');
    await openAdminView(page, 'Change History');

    const entry = historyEntry(page, 'Resource updated', MICROSCOPE.id);
    await expect(entry).toBeVisible();
    await expect(entry).toContainText('Local System Administrator');
    await expectFieldChange(entry, 'Location', MICROSCOPE.location, NEW_LOCATION);
    await expectFieldChange(entry, 'Responsible Person', 'Dr. Example', NEW_OWNER);
  });

  test('a blank required field is not saved', async ({ page }) => {
    await signIn(page, 'admin');
    await openAdminView(page, 'Edit Resources');
    await editorCard(page, MICROSCOPE.name).getByRole('button', { name: 'Edit' }).click();
    const form = page.locator('.resource-editor-form');

    await form.locator('input[name="name"]').fill('');
    await form.getByRole('button', { name: 'Save Changes' }).click();

    await expect(form.locator('input[name="name"]:invalid')).toHaveCount(1);
    await expect(page.getByText('Resource updated successfully.')).toHaveCount(0);
    await form.getByRole('button', { name: 'Cancel' }).click();
    await expect(editorCard(page, MICROSCOPE.name)).toBeVisible();
  });

  test('the API rejects invalid edits even if the browser form is bypassed', async ({ page }) => {
    await signIn(page, 'admin');

    const response = await page.request.put(`/api/admin/resources/${MICROSCOPE.id}`, {
      data: {
        name: '   ',
        category: 'Microscope',
        location: NEW_LOCATION,
        availabilityStatus: 'AVAILABLE',
        currentStatus: 'OPERATIONAL',
      },
    });

    expect(response.status()).toBe(422);
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
  });
});
