import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import LabResources from './LabResources.jsx';

const microscope = {
  id: 'r1',
  name: 'BX53 Upright Microscope',
  category: 'Microscope',
  location: 'Biology Lab A, Room 201',
  availabilityStatus: 'AVAILABLE',
  currentStatus: 'OPERATIONAL',
};
const centrifuge = {
  id: 'r2',
  name: 'High-Speed Centrifuge',
  category: 'Centrifuge',
  location: 'Chemistry Lab, Room 105',
  availabilityStatus: 'UNAVAILABLE',
  currentStatus: 'OPERATIONAL',
};
const fumeHood = {
  id: 'r3',
  name: 'Fume Hood',
  category: 'Safety equipment',
  location: 'Chemistry Lab, Room 110',
  availabilityStatus: 'AVAILABLE',
  currentStatus: 'MAINTENANCE',
};

function setup({ loadResources = vi.fn().mockResolvedValue([microscope, centrifuge, fumeHood]) } = {}) {
  const onRequestBooking = vi.fn();
  render(<LabResources loadResources={loadResources} onRequestBooking={onRequestBooking} />);
  return { user: userEvent.setup(), loadResources, onRequestBooking };
}

describe('US-1 view lab resources', () => {
  it('lists every resource returned for members with its category, location, and status', async () => {
    const { loadResources } = setup();

    expect(screen.getByRole('status')).toHaveTextContent(/loading resources/i);
    const card = await screen.findByRole('article', { name: microscope.name });
    expect(within(card).getByText('Microscope')).toBeInTheDocument();
    expect(within(card).getByText('Biology Lab A, Room 201')).toBeInTheDocument();
    expect(within(card).getByText('Operational')).toBeInTheDocument();
    expect(within(card).getByText('Available · Can request booking')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(loadResources).toHaveBeenCalledOnce();
  });

  it('shows which resources cannot be booked and why', async () => {
    setup();

    const centrifugeCard = await screen.findByRole('article', { name: centrifuge.name });
    expect(within(centrifugeCard).getByText('Unavailable')).toBeInTheDocument();
    expect(within(centrifugeCard).getByText('Unavailable · Cannot currently be booked')).toBeInTheDocument();

    const hoodCard = screen.getByRole('article', { name: fumeHood.name });
    expect(within(hoodCard).getByText('Maintenance')).toBeInTheDocument();
    expect(within(hoodCard).getByText('Available · Cannot be booked during maintenance')).toBeInTheDocument();
  });

  it('summarises how many resources exist and how many can be booked now', async () => {
    setup();

    expect(await screen.findByText('3 resources · 1 can be booked now')).toBeInTheDocument();
  });

  it('opens the booking form from the page', async () => {
    const { user, onRequestBooking } = setup();
    await screen.findByRole('article', { name: microscope.name });

    await user.click(screen.getByRole('button', { name: /request a booking/i }));

    expect(onRequestBooking).toHaveBeenCalledOnce();
  });

  it('shows an empty state when there are no resources', async () => {
    setup({ loadResources: vi.fn().mockResolvedValue([]) });

    expect(await screen.findByText('No lab resources yet')).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('reports a load failure and can retry or refresh', async () => {
    const loadResources = vi
      .fn()
      .mockRejectedValueOnce(new Error('Resources could not be loaded.'))
      .mockResolvedValueOnce([microscope])
      .mockResolvedValueOnce([microscope, centrifuge]);
    const { user } = setup({ loadResources });

    expect(await screen.findByRole('alert')).toHaveTextContent('Resources could not be loaded.');
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('1 resource · 1 can be booked now')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('article', { name: centrifuge.name })).toBeInTheDocument();
    expect(loadResources).toHaveBeenCalledTimes(3);
  });
});
