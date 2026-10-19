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
  rejectionReason: null,
  reviewedAt: null,
  createdAt: '2026-10-04T12:00:00.000Z',
};
const approved = {
  ...pending,
  id: 'booking-2',
  resourceName: 'High-Speed Centrifuge',
  status: 'APPROVED',
  reviewedAt: '2026-10-05T09:00:00.000Z',
};
const rejected = {
  ...pending,
  id: 'booking-3',
  resourceName: 'Confocal Microscope',
  status: 'REJECTED',
  rejectionReason: 'Required training has not been completed.',
  reviewedAt: '2026-10-05T10:00:00.000Z',
};
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
  return screen.getByRole('article', { name: resourceName });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MyBookings', () => {
  it('lists the member\'s bookings with their current status', async () => {
    const { onLoadBookings } = renderBookings();

    expect(screen.getByRole('status')).toHaveTextContent(/loading your bookings/i);
    expect(await screen.findByText('BX53 Upright Microscope')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(within(bookingItem('BX53 Upright Microscope')).getByText('Pending')).toBeInTheDocument();
    expect(within(bookingItem('BX53 Upright Microscope')).getByText('Awaiting review')).toBeInTheDocument();
    expect(within(bookingItem('High-Speed Centrifuge')).getByText('Approved')).toBeInTheDocument();
    expect(within(bookingItem('Fume Hood')).getByText('Cancelled')).toBeInTheDocument();
    expect(within(bookingItem('Fume Hood')).getByText('Not reviewed')).toBeInTheDocument();
    expect(onLoadBookings).toHaveBeenCalledOnce();
  });

  it('shows the administrator reason for a rejected request', async () => {
    renderBookings();

    await screen.findByText('Confocal Microscope');

    expect(within(bookingItem('Confocal Microscope')).getByText('Rejected')).toBeInTheDocument();
    expect(within(bookingItem('Confocal Microscope')).getByText(/required training has not been completed/i))
      .toBeInTheDocument();
  });

  it('filters bookings by status and shows a count per status', async () => {
    const user = userEvent.setup();
    renderBookings();
    await screen.findByText('BX53 Upright Microscope');

    const filters = screen.getByRole('group', { name: /filter by status/i });
    expect(within(filters).getByRole('button', { name: 'All (4)' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(filters).getByRole('button', { name: 'Approved (1)' }));

    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(bookingItem('High-Speed Centrifuge')).toBeInTheDocument();
    expect(within(filters).getByRole('button', { name: 'Approved (1)' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows an empty filter state', async () => {
    const user = userEvent.setup();
    renderBookings({ bookings: [pending] });
    await screen.findByText('BX53 Upright Microscope');

    await user.click(screen.getByRole('button', { name: 'Rejected (0)' }));

    expect(screen.getByText(/no rejected bookings/i)).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
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
    const { onLoadBookings, onCancel } = renderBookings({ bookings: [pending] });
    onLoadBookings.mockResolvedValueOnce({ bookings: [{ ...pending, status: 'CANCELLED' }] });

    await user.click(await screen.findByRole('button', { name: 'Cancel Booking' }));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledWith('booking-1');
    expect(onLoadBookings).toHaveBeenCalledTimes(2);
    expect(await within(await screen.findByRole('article')).findByText('Cancelled')).toBeInTheDocument();
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

  it('reports a load failure and can refresh the list', async () => {
    const user = userEvent.setup();
    const onLoadBookings = vi
      .fn()
      .mockRejectedValueOnce(new Error('Bookings are temporarily unavailable.'))
      .mockResolvedValueOnce({ bookings: [approved] });
    render(<MyBookings onLoadBookings={onLoadBookings} onCancel={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Bookings are temporarily unavailable.');
    await user.click(screen.getByRole('button', { name: /refresh/i }));

    expect(await screen.findByText('High-Speed Centrifuge')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reloads when the refresh key changes after a new request', async () => {
    const { onLoadBookings, onCancel, rerender } = renderBookings({ refreshKey: 0 });
    await screen.findByText('BX53 Upright Microscope');

    rerender(<MyBookings onLoadBookings={onLoadBookings} onCancel={onCancel} refreshKey={1} />);

    await vi.waitFor(() => expect(onLoadBookings).toHaveBeenCalledTimes(2));
  });
});
