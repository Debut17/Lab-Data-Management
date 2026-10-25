import { expect, test } from '@playwright/test';

import {
  MICROSCOPE,
  availabilitySelect,
  bookingOption,
  editorCard,
  expectFieldChange,
  historyEntry,
  memberResourceRow,
  openAdminView,
  signIn,
  signInAs,
} from './helpers.js';

const NEW_RESOURCE = {
  name: 'E2E Archive Spectrometer',
  category: 'Spectrometer',
  location: 'Physics Lab, Room 110',
};

function archiveCard(page, name) {
  return page.getByRole('article', { name });
}

async function archive(page, name) {
  await page.getByRole('button', { name: `Archive ${name}`, exact: true }).click();
  await expect(archiveCard(page, name).getByRole('heading', { name: `Archive ${name}?` })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm Archive' }).click();
}

test.describe('US-10 archive resource records', () => {
  test('a resource with a pending booking cannot be archived', async ({ page }) => {
    await signIn(page, 'admin');
    await openAdminView(page, 'Archive Resources');

    await archive(page, MICROSCOPE.name);

    await expect(page.getByRole('alert')).toContainText('has 1 pending or upcoming booking');
    await expect(archiveCard(page, MICROSCOPE.name)).toContainText('Active');
  });

  test('an archived resource disappears for members and is locked for administrators', async ({ page, browser }) => {
    await signIn(page, 'admin');

    // Create a resource with no bookings so it is allowed to be archived.
    await expect(page.getByRole('heading', { name: 'Resource Administration', level: 1 })).toBeVisible();
    await page.locator('input[name="name"]').fill(NEW_RESOURCE.name);
    await page.locator('input[name="category"]').fill(NEW_RESOURCE.category);
    await page.locator('input[name="location"]').fill(NEW_RESOURCE.location);
    await page.getByRole('button', { name: 'Create Resource' }).click();
    await expect(page.getByRole('status')).toContainText('Resource created successfully.');

    const member = await signInAs(browser, 'member');
    await expect(memberResourceRow(member, NEW_RESOURCE.name)).toBeVisible();

    await openAdminView(page, 'Archive Resources');
    await archive(page, NEW_RESOURCE.name);
    await expect(page.getByRole('status'))
      .toHaveText(`${NEW_RESOURCE.name} was archived. Lab members can no longer see or book it.`);
    await page.getByRole('button', { name: /^Archived \(\d+\)$/ }).click();
    await expect(archiveCard(page, NEW_RESOURCE.name)).toContainText('Archived');

    await openAdminView(page, 'Edit Resources');
    const card = editorCard(page, NEW_RESOURCE.name);
    await expect(card).toContainText('Archived');
    await expect(card.getByRole('button', { name: 'Edit' })).toBeDisabled();

    await openAdminView(page, 'Resource Availability');
    await expect(availabilitySelect(page, NEW_RESOURCE.name)).toBeDisabled();

    await member.reload();
    await expect(member.getByRole('list', { name: 'Current resource availability' })).toBeVisible();
    await expect(memberResourceRow(member, NEW_RESOURCE.name)).toHaveCount(0);
    await expect(bookingOption(member, NEW_RESOURCE.name)).toHaveCount(0);
    await member.context().close();
  });

  test('creating and archiving are recorded in Change History', async ({ page }) => {
    await signIn(page, 'admin');
    const { data } = await (await page.request.get('/api/admin/resources')).json();
    const created = data.resources.find((resource) => resource.name === NEW_RESOURCE.name);
    expect(created, 'the resource created by the previous test').toBeTruthy();

    await openAdminView(page, 'Change History');
    await expect(historyEntry(page, 'Resource created', created.id)).toBeVisible();
    await expectFieldChange(historyEntry(page, 'Resource archived', created.id), 'Archived', 'No', 'Yes');
  });
});
