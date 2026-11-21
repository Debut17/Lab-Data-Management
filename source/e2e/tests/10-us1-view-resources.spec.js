import { expect, test } from '@playwright/test';

import { MICROSCOPE, openNavigation, signIn } from './helpers.js';

async function openLabResources(page) {
  await openNavigation(page);
  await page
    .getByRole('navigation', { name: 'Member navigation' })
    .getByRole('button', { name: 'Lab Resources', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Lab Resources', level: 1 })).toBeVisible();
}

test.describe('US-1 view lab resources', () => {
  test('a lab member sees every current non-archived resource', async ({ page }) => {
    await signIn(page, 'admin');
    const { data } = await (await page.request.get('/api/admin/resources')).json();
    const active = data.resources.filter((resource) => !resource.archived);
    const archived = data.resources.filter((resource) => resource.archived);
    await page.getByRole('button', { name: 'Sign out' }).click();

    await signIn(page, 'member');
    await openLabResources(page);

    const resources = page.getByRole('region', { name: 'Lab Resources' });
    await expect(resources.getByRole('article')).toHaveCount(active.length);
    // Earlier specs edit seeded resources, so compare against the stored values
    // rather than the original seed data.
    for (const resource of active) {
      const card = resources.getByRole('article', { name: resource.name, exact: true });
      await expect(card).toBeVisible();
      await expect(card).toContainText(resource.category);
      await expect(card).toContainText(resource.location);
    }
    for (const resource of archived) {
      await expect(resources.getByRole('article', { name: resource.name, exact: true })).toHaveCount(0);
    }
    expect(active.some((resource) => resource.id === MICROSCOPE.id)).toBe(true);
  });

  test('the resource list leads to the booking form', async ({ page }) => {
    await signIn(page, 'member');
    await openLabResources(page);

    await page.getByRole('button', { name: 'Request a booking' }).click();

    await expect(page.getByRole('heading', { name: 'Resource Booking', level: 1 })).toBeVisible();
  });
});
