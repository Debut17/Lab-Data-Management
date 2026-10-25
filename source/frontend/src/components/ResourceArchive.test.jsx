import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ResourceArchive from './ResourceArchive.jsx';

const microscope = {
  id: 'resource-1', name: 'BX53 Upright Microscope', category: 'Microscope', location: 'Room 201', archived: false,
};
const centrifuge = {
  id: 'resource-2', name: 'High-Speed Centrifuge', category: 'Centrifuge', location: 'Room 105', archived: false,
};
const oldScope = {
  id: 'resource-3', name: 'Retired Stereo Microscope', category: 'Microscope', location: 'Store', archived: true,
};

function setup({
  resources = [microscope, centrifuge, oldScope],
  loadResources = vi.fn().mockResolvedValue({ resources }),
  onArchive = vi.fn().mockImplementation(async (id) => ({ ...resources.find((r) => r.id === id), archived: true })),
} = {}) {
  render(<ResourceArchive loadResources={loadResources} onArchive={onArchive} />);
  return { user: userEvent.setup(), loadResources, onArchive };
}

function card(name) {
  return screen.getByRole('article', { name });
}

describe('US-10 archive resources', () => {
  it('shows active resources by default and counts archived ones', async () => {
    const { loadResources } = setup();

    expect(screen.getByRole('status')).toHaveTextContent(/loading resources/i);
    expect(await screen.findByRole('article', { name: microscope.name })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Active (2)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Archived (1)' })).toBeInTheDocument();
    expect(loadResources).toHaveBeenCalledOnce();
  });

  it('keeps archived resources visible to administrators without an archive action', async () => {
    const { user } = setup();
    await screen.findByRole('article', { name: microscope.name });

    await user.click(screen.getByRole('button', { name: 'Archived (1)' }));

    const archivedCard = card(oldScope.name);
    expect(within(archivedCard).getByText('Archived')).toBeInTheDocument();
    expect(within(archivedCard).queryByRole('button', { name: /archive/i })).not.toBeInTheDocument();
  });

  it('asks for confirmation and only archives after it is confirmed', async () => {
    const { user, onArchive } = setup();

    await user.click(await screen.findByRole('button', { name: `Archive ${microscope.name}` }));

    expect(within(card(microscope.name)).getByRole('heading', { name: `Archive ${microscope.name}?` }))
      .toBeInTheDocument();
    expect(onArchive).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Confirm Archive' })).not.toBeInTheDocument();
    expect(onArchive).not.toHaveBeenCalled();
  });

  it('archives a resource, moves it to the archived list, and confirms the result', async () => {
    const { user, onArchive } = setup();

    await user.click(await screen.findByRole('button', { name: `Archive ${microscope.name}` }));
    await user.click(screen.getByRole('button', { name: 'Confirm Archive' }));

    expect(onArchive).toHaveBeenCalledWith('resource-1');
    expect(await screen.findByRole('status')).toHaveTextContent(/was archived/i);
    expect(screen.queryByRole('article', { name: microscope.name })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archived (2)' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Archived (2)' }));
    expect(within(card(microscope.name)).getByText('Archived')).toBeInTheDocument();
  });

  it('shows why archiving failed and keeps the resource active', async () => {
    const onArchive = vi.fn().mockRejectedValue(
      new Error('This resource has 2 pending or upcoming bookings. Decline or cancel them before archiving.'),
    );
    const { user } = setup({ onArchive });

    await user.click(await screen.findByRole('button', { name: `Archive ${microscope.name}` }));
    await user.click(screen.getByRole('button', { name: 'Confirm Archive' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/2 pending or upcoming bookings/);
    expect(within(card(microscope.name)).getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm Archive' })).toBeEnabled();
  });

  it('disables other actions while an archive is saving', async () => {
    let finish;
    const onArchive = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const { user } = setup({ onArchive });

    await user.click(await screen.findByRole('button', { name: `Archive ${microscope.name}` }));
    await user.click(screen.getByRole('button', { name: 'Confirm Archive' }));

    expect(screen.getByRole('button', { name: 'Archiving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: `Archive ${centrifuge.name}` })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
    finish({ ...microscope, archived: true });
    expect(await screen.findByRole('status')).toHaveTextContent(/was archived/i);
  });

  it('reports a load failure, retries, and shows an empty archived list', async () => {
    const loadResources = vi
      .fn()
      .mockRejectedValueOnce(new Error('Resources could not be loaded.'))
      .mockResolvedValueOnce({ resources: [microscope] });
    const { user } = setup({ loadResources });

    expect(await screen.findByRole('alert')).toHaveTextContent('Resources could not be loaded.');
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByRole('article', { name: microscope.name })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Archived (0)' }));
    expect(screen.getByText('No archived resources')).toBeInTheDocument();
  });
});
