import { expect, test } from '@playwright/test';

import { MICROSCOPE, signIn, signOut } from './helpers.js';

// A slot far enough ahead that other specs never book it.
function slot(daysAhead) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + daysAhead);
  start.setUTCHours(3, 0, 0, 0);
  return {
    resourceId: MICROSCOPE.id,
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
  };
}

test.describe('US-6 cancel a booking before it starts', () => {
  test('cancelling an approved booking releases its period for new requests', async ({ page }) => {
    const period = slot(45);

    await signIn(page, 'member');
    const created = await page.request.post('/api/bookings', { data: period });
    expect(created.status()).toBe(201);
    const { data: booking } = await created.json();
    await signOut(page);

    await signIn(page, 'admin');
    const approved = await page.request.patch(`/api/admin/bookings/${booking.id}`, {
      data: { decision: 'APPROVE' },
    });
    expect(approved.status()).toBe(200);
    await signOut(page);

    await signIn(page, 'member');
    const blocked = await page.request.post('/api/bookings', { data: period });
    expect(blocked.status()).toBe(409);
    expect((await blocked.json()).error.code).toBe('BOOKING_CONFLICT');

    const cancelled = await page.request.delete(`/api/bookings/${booking.id}`);
    expect(cancelled.status()).toBe(200);
    expect((await cancelled.json()).data.status).toBe('CANCELLED');

    const rebooked = await page.request.post('/api/bookings', { data: period });
    expect(rebooked.status()).toBe(201);

    const again = await page.request.delete(`/api/bookings/${booking.id}`);
    expect(again.status()).toBe(409);
    expect((await again.json()).error.code).toBe('BOOKING_CANNOT_CANCEL');
  });
});
