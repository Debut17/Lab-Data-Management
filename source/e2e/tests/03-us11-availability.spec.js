import { expect, test } from '@playwright/test';

import {
  CENTRIFUGE,
  availabilitySelect,
  bookingOption,
  expectFieldChange,
  historyEntry,
  memberResourceRow,
  openAdminView,
  signIn,
  signInAs,
} from './helpers.js';

async function setAvailability(page, label, value) {
  await availabilitySelect(page, CENTRIFUGE.name).selectOption(value);
  await page.getByRole('button', { name: `Save availability for ${CENTRIFUGE.name}` }).click();
  await expect(page.getByRole('status')).toHaveText(`${CENTRIFUGE.name} is now ${label}.`);
}

function futureSlot(daysAhead) {
  const start = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

test.describe('US-11 set resource availability', () => {
  test('members cannot book a resource the administrator marks unavailable', async ({ page, browser }) => {
    await signIn(page, 'admin');
    await openAdminView(page, 'Resource Availability');
    await setAvailability(page, 'unavailable', 'UNAVAILABLE');

    const member = await signInAs(browser, 'member');
    await expect(memberResourceRow(member, CENTRIFUGE.name))
      .toContainText('Unavailable · Cannot currently be booked');
    await expect(bookingOption(member, CENTRIFUGE.name)).toHaveJSProperty('disabled', true);

    // The server enforces the rule too, not only the disabled option.
    const response = await member.request.post('/api/bookings', {
      data: { resourceId: CENTRIFUGE.id, ...futureSlot(10) },
    });
    expect(response.status()).toBe(409);
    expect((await response.json()).error.code).toBe('RESOURCE_UNAVAILABLE');
    await member.context().close();
  });

  test('members can book again once the resource is available', async ({ page, browser }) => {
    await signIn(page, 'admin');
    await openAdminView(page, 'Resource Availability');
    await setAvailability(page, 'available', 'AVAILABLE');

    const member = await signInAs(browser, 'member');
    await expect(memberResourceRow(member, CENTRIFUGE.name)).toContainText('Available · Can request booking');
    await expect(bookingOption(member, CENTRIFUGE.name)).toHaveJSProperty('disabled', false);
    await member.context().close();
  });

  test('both availability changes are recorded in Change History', async ({ page }) => {
    await signIn(page, 'admin');
    await openAdminView(page, 'Change History');

    const entries = page
      .locator('li.audit-entry')
      .filter({ hasText: 'Resource availability changed' })
      .filter({ hasText: CENTRIFUGE.id });
    await expect(entries).toHaveCount(2);
    // Newest first: back to AVAILABLE, then the change to UNAVAILABLE.
    await expectFieldChange(entries.nth(0), 'Availability Status', 'UNAVAILABLE', 'AVAILABLE');
    await expectFieldChange(entries.nth(1), 'Availability Status', 'AVAILABLE', 'UNAVAILABLE');
    await expect(historyEntry(page, 'Resource availability changed', CENTRIFUGE.id))
      .toContainText('Local System Administrator');
  });
});
