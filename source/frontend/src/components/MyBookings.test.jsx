import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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
const cancelled = {
  ...pending,
  id: 'booking-4',
  resourceName: 'Fume Hood',
  status: 'CANCELLED',
};

function renderBookings(bookings = [pending, approved, rejected, cancelled]) {
  const loadBookings = vi.fn().mockResolvedValue({ bookings });
  render(<MyBookings loadBookings={loadBookings} />);
  return loadBookings;
}

describe('MyBookings', () => {
  it('lists the member\'s bookings with their current status', async () => {
    const loadBookings = renderBookings();

    expect(screen.getByRole('status')).toHaveTextContent(/loading your bookings/i);
    const pendingCard = await screen.findByRole('article', { name: 'BX53 Upright Microscope' });
    expect(within(pendingCard).getByText('Pending')).toBeInTheDocument();
    expect(within(pendingCard).getByText('Awaiting review')).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'High-Speed Centrifuge' })).getByText('Approved'))
      .toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Fume Hood' })).getByText('Not reviewed'))
      .toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(loadBookings).toHaveBeenCalledOnce();
  });

  it('shows the administrator reason for a rejected request', async () => {
    renderBookings();

    const rejectedCard = await screen.findByRole('article', { name: 'Confocal Microscope' });

    expect(within(rejectedCard).getByText('Rejected')).toBeInTheDocument();
    expect(within(rejectedCard).getByText(/required training has not been completed/i))
      .toBeInTheDocument();
  });

  it('filters bookings by status and shows a count per status', async () => {
    const user = userEvent.setup();
    renderBookings();
    await screen.findByRole('article', { name: 'BX53 Upright Microscope' });

    const filters = screen.getByRole('group', { name: /filter by status/i });
    expect(within(filters).getByRole('button', { name: 'All (4)' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(filters).getByRole('button', { name: 'Approved (1)' }));

    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('article', { name: 'High-Speed Centrifuge' })).toBeInTheDocument();
    expect(within(filters).getByRole('button', { name: 'Approved (1)' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows empty states for no bookings and for an empty filter', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <MyBookings loadBookings={vi.fn().mockResolvedValue({ bookings: [] })} />,
    );
    expect(await screen.findByText(/you have no bookings yet/i)).toBeInTheDocument();
    unmount();

    renderBookings([pending]);
    await screen.findByRole('article', { name: 'BX53 Upright Microscope' });
    await user.click(screen.getByRole('button', { name: 'Rejected (0)' }));

    expect(screen.getByText(/no rejected bookings/i)).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('reports a load failure and can refresh the list', async () => {
    const user = userEvent.setup();
    const loadBookings = vi
      .fn()
      .mockRejectedValueOnce(new Error('Your bookings could not be loaded.'))
      .mockResolvedValueOnce({ bookings: [approved] });
    render(<MyBookings loadBookings={loadBookings} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Your bookings could not be loaded.');
    await user.click(screen.getByRole('button', { name: /refresh/i }));

    expect(await screen.findByRole('article', { name: 'High-Speed Centrifuge' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(loadBookings).toHaveBeenCalledTimes(2);
  });
});
