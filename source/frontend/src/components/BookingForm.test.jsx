import { fireEvent, render, screen, within } from '@testing-library/react';
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
  const unavailableResource = { ...resources[0], id: 'unavailable-1', name: 'Centrifuge', availabilityStatus: 'UNAVAILABLE' };

  it('keeps unavailable resources visible with an explicit status and disables their booking option', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<BookingForm onLoadResources={vi.fn().mockResolvedValue([...resources, unavailableResource])} onCreate={onCreate} />);
    const unavailable = await screen.findByRole('listitem', { name: 'Centrifuge' });
    expect(within(unavailable).getByText('Unavailable · Cannot currently be booked')).toBeInTheDocument();
    expect(within(screen.getByRole('listitem', { name: resources[0].name })).getByText('Available · Can request booking')).toBeInTheDocument();
    const option = screen.getByRole('option', { name: /centrifuge/i });
    expect(option).toBeDisabled();
    await user.selectOptions(screen.getByLabelText(/resource \*/i), unavailableResource.id);
    expect(screen.getByLabelText(/resource \*/i)).toHaveValue('');
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
  });

  it('shows an all-unavailable list and disables submission without hiding resources', async () => {
    render(<BookingForm onLoadResources={vi.fn().mockResolvedValue([unavailableResource])} onCreate={vi.fn()} />);
    expect(await screen.findByRole('listitem', { name: 'Centrifuge' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /centrifuge/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /submit booking request/i })).toBeDisabled();
    expect(screen.getByLabelText(/resource \*/i)).toBeEnabled();
    expect(screen.getByText(/no available resources can be booked/i)).toBeInTheDocument();
  });

  it.each([
    ['MAINTENANCE', 'Available · Cannot be booked during maintenance'],
    ['OUT_OF_SERVICE', 'Available · Cannot be booked while out of service'],
  ])('explains why an AVAILABLE resource with %s status cannot be booked', async (currentStatus, message) => {
    render(<BookingForm onLoadResources={vi.fn().mockResolvedValue([{ ...resources[0], currentStatus }])} onCreate={vi.fn()} />);
    expect(within(await screen.findByRole('listitem', { name: resources[0].name })).getByText(message)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /microscope/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /submit booking request/i })).toBeDisabled();
  });

  it('refreshes both states, clears an unavailable selection, and preserves entered times', async () => {
    const user = userEvent.setup();
    const onLoadResources = vi.fn().mockResolvedValueOnce(resources)
      .mockResolvedValueOnce([{ ...resources[0], availabilityStatus: 'UNAVAILABLE' }])
      .mockResolvedValueOnce(resources);
    render(<BookingForm onLoadResources={onLoadResources} onCreate={vi.fn()} />);
    await fillBooking(user);
    await user.click(screen.getByRole('button', { name: /refresh availability/i }));
    expect(await screen.findByRole('option', { name: /unavailable/i })).toBeDisabled();
    expect(screen.getByLabelText(/resource \*/i)).toHaveValue('');
    expect(screen.getByLabelText(/start time/i)).toHaveValue('2026-10-10T09:00');
    expect(screen.getByRole('button', { name: /submit booking request/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /refresh availability/i }));
    expect(await screen.findByRole('option', { name: /can request booking/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /submit booking request/i })).toBeEnabled();
  });

  it('keeps a selected resource when refresh confirms it is still bookable', async () => {
    const user = userEvent.setup();
    render(<BookingForm onLoadResources={vi.fn().mockResolvedValue(resources)} onCreate={vi.fn()} />);
    await fillBooking(user);
    await user.click(screen.getByRole('button', { name: /refresh availability/i }));
    await screen.findByRole('option', { name: /can request booking/i });
    expect(screen.getByLabelText(/resource \*/i)).toHaveValue(resources[0].id);
  });

  it('does not show stale availability or accept bookings after refresh fails', async () => {
    const user = userEvent.setup();
    const onLoadResources = vi.fn().mockResolvedValueOnce(resources).mockRejectedValueOnce(new Error('Refresh failed.'));
    render(<BookingForm onLoadResources={onLoadResources} onCreate={vi.fn()} />);
    await fillBooking(user);
    await user.click(screen.getByRole('button', { name: /refresh availability/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh failed.');
    expect(screen.queryByRole('listitem', { name: resources[0].name })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit booking request/i })).toBeDisabled();
  });

  it('rejects a manually selected unavailable resource before calling the booking API', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<BookingForm onLoadResources={vi.fn().mockResolvedValue([...resources, unavailableResource])} onCreate={onCreate} />);
    await fillBooking(user);
    fireEvent.change(screen.getByLabelText(/resource \*/i), { target: { value: unavailableResource.id } });
    await user.click(screen.getByRole('button', { name: /submit booking request/i }));
    expect(screen.getByText(/this resource cannot currently be booked/i)).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

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
