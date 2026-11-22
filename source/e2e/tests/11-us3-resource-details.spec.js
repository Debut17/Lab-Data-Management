import { expect, test } from '@playwright/test';

import { MICROSCOPE, openNavigation, signIn, signOut } from './helpers.js';

async function openLabResources(page) {
  await openNavigation(page);
  await page
    .getByRole('navigation', { name: 'Member navigation' })
    .getByRole('button', { name: 'Lab Resources', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Lab Resources', level: 1 })).toBeVisible();
}

function detailValue(dialog, term) {
  return dialog.locator('dt', { hasText: term }).locator('xpath=following-sibling::dd[1]');
}

test.describe('US-3 view resource details', () => {
  test('a lab member sees the selected resource’s description, location, responsible person, availability, and status', async ({ page }) => {
    // Read the stored record so the check follows whatever earlier specs left in the database.
    await signIn(page, 'admin');
    const { data } = await (await page.request.get('/api/admin/resources')).json();
    const stored = data.resources.find((resource) => resource.id === MICROSCOPE.id);
    await signOut(page);

    await signIn(page, 'member');
    await openLabResources(page);

    await page.getByRole('button', { name: `View details for ${MICROSCOPE.name}` }).click();
    const dialog = page.getByRole('dialog', { name: MICROSCOPE.name });
    await expect(dialog).toBeVisible();

    await expect(detailValue(dialog, 'Description')).toHaveText(stored.description || 'Not provided');
    await expect(detailValue(dialog, 'Location')).toHaveText(stored.location);
    await expect(detailValue(dialog, 'Responsible person')).toHaveText(stored.responsiblePerson || 'Not provided');
    await expect(detailValue(dialog, 'Availability')).toContainText(
      stored.availabilityStatus === 'AVAILABLE' ? 'Available' : 'Unavailable',
    );
    const status = stored.currentStatus.replaceAll('_', ' ').toLowerCase();
    await expect(detailValue(dialog, 'Current status')).toHaveText(status.charAt(0).toUpperCase() + status.slice(1));

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});
