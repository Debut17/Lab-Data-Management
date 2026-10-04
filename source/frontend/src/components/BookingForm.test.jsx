import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import BookingForm from './BookingForm.jsx';

const resources = [{
  id: '10000000-0000-4000-8000-000000000001',
  name: 'BX53 Upright Microscope',
  category: 'Microscope',
  location: 'Biology Lab A',
  availabilityStatus: 'AVAILABLE',
  currentStatus: 'OPERATIONAL',
}];

async function fillBooking(user) {
  await user.selectOptions(
    await screen.findByLabelText(/resource \*/i),
    resources[0].id,
  );
  await user.type(screen.getByLabelText(/start time/i), '2026-10-10T09:00');
  await user.type(screen.getByLabelText(/end time/i), '2026-10-10T11:00');
}

describe('BookingForm', () => {
  it('loads resources and submits a valid request as ISO timestamps', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({
      id: 'booking-1',
      resourceName: 'BX53 Upright Microscope',
      status: 'PENDING',
    });
    render(
      <BookingForm
        onLoadResources={vi.fn().mockResolvedValue(resources)}
        onCreate={onCreate}
      />,
    );

    await fillBooking(user);
    await user.click(screen.getByRole('button', { name: /submit booking request/i }));

    expect(onCreate).toHaveBeenCalledWith({
      resourceId: resources[0].id,
      startTime: new Date('2026-10-10T09:00').toISOString(),
      endTime: new Date('2026-10-10T11:00').toISOString(),
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Booking request submitted');
    expect(screen.getByRole('status')).toHaveTextContent('Status: Pending');
  });

  it('shows required-field errors without submitting', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <BookingForm
        onLoadResources={vi.fn().mockResolvedValue(resources)}
        onCreate={onCreate}
      />,
    );

    await screen.findByRole('option', { name: /microscope/i });
    await user.click(screen.getByRole('button', { name: /submit booking request/i }));

    expect(screen.getByText('Select a resource.')).toBeInTheDocument();
    expect(screen.getByText('Enter a start time.')).toBeInTheDocument();
    expect(screen.getByText('Enter an end time.')).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('requires the end time to be after the start time', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <BookingForm
        onLoadResources={vi.fn().mockResolvedValue(resources)}
        onCreate={onCreate}
      />,
    );

    await user.selectOptions(await screen.findByLabelText(/resource \*/i), resources[0].id);
    await user.type(screen.getByLabelText(/start time/i), '2026-10-10T11:00');
    await user.type(screen.getByLabelText(/end time/i), '2026-10-10T09:00');
    await user.click(screen.getByRole('button', { name: /submit booking request/i }));

    expect(screen.getByText('End time must be after start time.')).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('shows conflict reasons and preserves entered values', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockRejectedValue(
      new Error('The resource already has an approved booking during that time.'),
    );
    render(
      <BookingForm
        onLoadResources={vi.fn().mockResolvedValue(resources)}
        onCreate={onCreate}
      />,
    );

    await fillBooking(user);
    await user.click(screen.getByRole('button', { name: /submit booking request/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('approved booking');
    expect(screen.getByLabelText(/resource \*/i)).toHaveValue(resources[0].id);
    expect(screen.getByLabelText(/start time/i)).toHaveValue('2026-10-10T09:00');
  });

  it('supports retrying a failed resource load and clearing the form', async () => {
    const user = userEvent.setup();
    const onLoadResources = vi
      .fn()
      .mockRejectedValueOnce(new Error('Resources could not be loaded.'))
      .mockResolvedValueOnce(resources);
    render(<BookingForm onLoadResources={onLoadResources} onCreate={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Resources could not be loaded.');
    await user.click(screen.getByRole('button', { name: /try again/i }));
    await fillBooking(user);
    await user.click(screen.getByRole('button', { name: /clear/i }));

    expect(onLoadResources).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText(/resource \*/i)).toHaveValue('');
    expect(screen.getByLabelText(/start time/i)).toHaveValue('');
  });

  it('explains when no resources are available', async () => {
    render(
      <BookingForm
        onLoadResources={vi.fn().mockResolvedValue([])}
        onCreate={vi.fn()}
      />,
    );

    expect(await screen.findByText(/no available resources/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit booking request/i })).toBeDisabled();
  });
});
