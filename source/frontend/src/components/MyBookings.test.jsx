import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import MyBookings from './MyBookings.jsx';

const pending = {
  id: 'booking-1',
  resourceName: 'BX53 Upright Microscope',
  startTime: '2026-10-10T02:00:00.000Z',
  endTime: '2026-10-10T04:00:00.000Z',
  status: 'PENDING',
};
const approved = { ...pending, id: 'booking-2', resourceName: 'High-Speed Centrifuge', status: 'APPROVED' };
const rejected = { ...pending, id: 'booking-3', resourceName: 'Confocal Microscope', status: 'REJECTED' };
const cancelled = { ...pending, id: 'booking-4', resourceName: 'Fume Hood', status: 'CANCELLED' };

function renderBookings({
  bookings = [pending, approved, rejected, cancelled],
  onCancel = vi.fn().mockResolvedValue({ id: pending.id, status: 'CANCELLED' }),
  refreshKey,
} = {}) {
  const onLoadBookings = vi.fn().mockResolvedValue({ bookings });
  const view = render(
    <MyBookings onLoadBookings={onLoadBookings} onCancel={onCancel} refreshKey={refreshKey} />,
  );
  return { onLoadBookings, onCancel, ...view };
}

function bookingItem(resourceName) {
  return screen.getByText(resourceName).closest('article');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MyBookings', () => {
  it('lists the member\'s bookings with their current status', async () => {
    const { onLoadBookings } = renderBookings();

    expect(await screen.findByText('BX53 Upright Microscope')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(within(bookingItem('BX53 Upright Microscope')).getByText('PENDING')).toBeInTheDocument();
    expect(within(bookingItem('High-Speed Centrifuge')).getByText('APPROVED')).toBeInTheDocument();
    expect(within(bookingItem('Fume Hood')).getByText('CANCELLED')).toBeInTheDocument();
    expect(onLoadBookings).toHaveBeenCalledOnce();
  });

  it('offers cancellation only for pending bookings', async () => {
    renderBookings();

    await screen.findByText('BX53 Upright Microscope');
    expect(screen.getAllByRole('button', { name: 'Cancel Booking' })).toHaveLength(1);
    expect(within(bookingItem('BX53 Upright Microscope')).getByRole('button', { name: 'Cancel Booking' }))
      .toBeInTheDocument();
    for (const name of ['High-Speed Centrifuge', 'Confocal Microscope', 'Fume Hood']) {
      expect(within(bookingItem(name)).queryByRole('button')).not.toBeInTheDocument();
    }
  });

  it('cancels a confirmed pending booking and reloads the list', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { onLoadBookings, onCancel } = renderBookings();
    onLoadBookings.mockResolvedValueOnce({ bookings: [{ ...pending, status: 'CANCELLED' }] });

    await user.click(await screen.findByRole('button', { name: 'Cancel Booking' }));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledWith('booking-1');
    expect(onLoadBookings).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('CANCELLED')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel Booking' })).not.toBeInTheDocument();
  });

  it('does not cancel when the member dismisses the confirmation', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { onLoadBookings, onCancel } = renderBookings();

    await user.click(await screen.findByRole('button', { name: 'Cancel Booking' }));

    expect(onCancel).not.toHaveBeenCalled();
    expect(onLoadBookings).toHaveBeenCalledOnce();
  });

  it('disables the button while the cancellation is in progress', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let finishCancel;
    const onCancel = vi.fn(() => new Promise((resolve) => { finishCancel = resolve; }));
    renderBookings({ onCancel });

    await user.click(await screen.findByRole('button', { name: 'Cancel Booking' }));

    expect(screen.getByRole('button', { name: 'Cancelling…' })).toBeDisabled();
    finishCancel();
    expect(await screen.findByRole('button', { name: 'Cancel Booking' })).toBeEnabled();
  });

  it('shows the server reason when a cancellation fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onCancel = vi.fn().mockRejectedValue(new Error('Only pending booking requests can be cancelled.'));
    const { onLoadBookings } = renderBookings({ onCancel });

    await user.click(await screen.findByRole('button', { name: 'Cancel Booking' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Only pending booking requests can be cancelled.');
    expect(onLoadBookings).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Cancel Booking' })).toBeEnabled();
  });

  it('shows an empty state when the member has no bookings', async () => {
    const { onLoadBookings } = renderBookings({ bookings: [] });

    expect(await screen.findByText(/you have no booking requests/i)).toBeInTheDocument();
    expect(onLoadBookings).toHaveBeenCalledOnce();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('reports a load failure', async () => {
    const onLoadBookings = vi.fn().mockRejectedValue(new Error('Bookings are temporarily unavailable.'));
    render(<MyBookings onLoadBookings={onLoadBookings} onCancel={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Bookings are temporarily unavailable.');
  });

  it('reloads when the refresh key changes after a new request', async () => {
    const { onLoadBookings, onCancel, rerender } = renderBookings({ refreshKey: 0 });
    await screen.findByText('BX53 Upright Microscope');

    rerender(<MyBookings onLoadBookings={onLoadBookings} onCancel={onCancel} refreshKey={1} />);

    await vi.waitFor(() => expect(onLoadBookings).toHaveBeenCalledTimes(2));
  });
});
