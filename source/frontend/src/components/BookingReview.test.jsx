import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import BookingReview from './BookingReview.jsx';

const booking = {
  id: 'booking-1',
  resourceName: 'Confocal Microscope',
  requesterName: 'Lab Member',
  requesterEmail: 'member@example.test',
  startTime: '2026-10-10T02:00:00.000Z',
  endTime: '2026-10-10T04:00:00.000Z',
  status: 'PENDING',
  createdAt: '2026-10-04T12:00:00.000Z',
};

describe('BookingReview', () => {
  it('loads and displays pending booking details', async () => {
    const loadBookings = vi.fn().mockResolvedValue({ bookings: [booking] });

    render(<BookingReview loadBookings={loadBookings} onReview={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent(/loading pending booking requests/i);
    expect(await screen.findByRole('heading', { name: 'Confocal Microscope' })).toBeInTheDocument();
    expect(screen.getByText('Lab Member')).toBeInTheDocument();
    expect(screen.getByText('member@example.test')).toBeInTheDocument();
    expect(loadBookings).toHaveBeenCalledOnce();
  });

  it('shows an empty state when there are no pending requests', async () => {
    render(
      <BookingReview
        loadBookings={vi.fn().mockResolvedValue({ bookings: [] })}
        onReview={vi.fn()}
      />,
    );

    expect(await screen.findByText(/no pending booking requests/i)).toBeInTheDocument();
  });

  it('confirms approval and removes the reviewed request', async () => {
    const user = userEvent.setup();
    const onReview = vi.fn().mockResolvedValue({ ...booking, status: 'APPROVED' });
    render(
      <BookingReview
        loadBookings={vi.fn().mockResolvedValue({ bookings: [booking] })}
        onReview={onReview}
      />,
    );

    await user.click(await screen.findByRole('button', { name: /approve confocal microscope/i }));
    expect(screen.getByRole('heading', { name: /approve booking request/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /confirm approval/i }));

    await waitFor(() => expect(onReview).toHaveBeenCalledWith('booking-1', { decision: 'APPROVE' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/approved/i);
    expect(screen.queryByRole('heading', { name: 'Confocal Microscope' })).not.toBeInTheDocument();
  });

  it('requires and trims an administrator comment before declining', async () => {
    const user = userEvent.setup();
    const onReview = vi.fn().mockResolvedValue({ ...booking, status: 'REJECTED' });
    render(
      <BookingReview
        loadBookings={vi.fn().mockResolvedValue({ bookings: [booking] })}
        onReview={onReview}
      />,
    );

    await user.click(await screen.findByRole('button', { name: /decline confocal microscope/i }));
    const confirmButton = screen.getByRole('button', { name: /confirm decline/i });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText(/administrator comment/i), '  Training is incomplete.  ');
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    await waitFor(() => expect(onReview).toHaveBeenCalledWith('booking-1', {
      decision: 'REJECT',
      reason: 'Training is incomplete.',
    }));
    expect(await screen.findByRole('status')).toHaveTextContent(/declined/i);
  });

  it('keeps the request visible and reports load or decision failures', async () => {
    const loadFailure = vi.fn().mockRejectedValue(new Error('Pending requests could not be loaded.'));
    const { unmount } = render(
      <BookingReview loadBookings={loadFailure} onReview={vi.fn()} />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Pending requests could not be loaded.');
    unmount();

    const user = userEvent.setup();
    const onReview = vi.fn().mockRejectedValue(new Error('Booking conflicts with another request.'));
    render(
      <BookingReview
        loadBookings={vi.fn().mockResolvedValue({ bookings: [booking] })}
        onReview={onReview}
      />,
    );

    await user.click(await screen.findByRole('button', { name: /approve confocal microscope/i }));
    await user.click(screen.getByRole('button', { name: /confirm approval/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Booking conflicts with another request.');
    expect(screen.getByRole('heading', { name: 'Confocal Microscope' })).toBeInTheDocument();
  });
});
