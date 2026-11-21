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

describe('US-2 search and filter lab resources', () => {
  const sterilizer = {
    id: 'r4',
    name: 'Autoclave Microscope Sterilizer',
    category: 'Safety equipment',
    location: 'Biology Lab B, Room 204',
    availabilityStatus: 'AVAILABLE',
    currentStatus: 'OPERATIONAL',
  };

  function setupAll() {
    return setup({ loadResources: vi.fn().mockResolvedValue([microscope, centrifuge, fumeHood, sterilizer]) });
  }

  function visibleNames() {
    return screen.queryAllByRole('article').map((card) => within(card).getByRole('heading').textContent);
  }

  it('keeps only resources whose name contains the search term, ignoring case', async () => {
    const { user } = setupAll();
    await screen.findByRole('article', { name: microscope.name });

    await user.type(screen.getByRole('searchbox', { name: /search by name/i }), 'microSCOPE');

    expect(visibleNames()).toEqual([microscope.name, sterilizer.name]);
    expect(screen.getByText('2 of 4 resources · 2 can be booked now')).toBeInTheDocument();
  });

  it('offers each category once and keeps only resources in the selected category', async () => {
    const { user } = setupAll();
    await screen.findByRole('article', { name: microscope.name });
    const select = screen.getByRole('combobox', { name: /category/i });

    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'All categories',
      'Centrifuge',
      'Microscope',
      'Safety equipment',
    ]);

    await user.selectOptions(select, 'Safety equipment');

    expect(visibleNames()).toEqual([fumeHood.name, sterilizer.name]);
    expect(screen.getByText('2 of 4 resources · 1 can be booked now')).toBeInTheDocument();
  });

  it('applies the name search and category filter together', async () => {
    const { user } = setupAll();
    await screen.findByRole('article', { name: microscope.name });

    await user.type(screen.getByRole('searchbox', { name: /search by name/i }), 'microscope');
    await user.selectOptions(screen.getByRole('combobox', { name: /category/i }), 'Safety equipment');

    expect(visibleNames()).toEqual([sterilizer.name]);
  });

  it('shows a no-match message and restores the full list when filters are cleared', async () => {
    const { user } = setupAll();
    await screen.findByRole('article', { name: microscope.name });

    await user.type(screen.getByRole('searchbox', { name: /search by name/i }), 'telescope');

    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByText('No resources match your search')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /clear filters/i }));

    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(screen.getByRole('searchbox', { name: /search by name/i })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: /category/i })).toHaveValue('');
    expect(screen.getByText('4 resources · 2 can be booked now')).toBeInTheDocument();
  });
});
