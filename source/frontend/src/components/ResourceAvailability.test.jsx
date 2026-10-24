import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ResourceAvailability from './ResourceAvailability.jsx';

const resource = {
  id: 'resource-1', name: 'Microscope', category: 'Instrument', location: 'Room 201',
  availabilityStatus: 'AVAILABLE', currentStatus: 'OPERATIONAL', archived: false,
};

function setup({ resources = [resource], loadResources = vi.fn().mockResolvedValue({ resources }),
  onUpdateAvailability = vi.fn().mockImplementation(async (id, availabilityStatus) => ({ ...resource, id, availabilityStatus })) } = {}) {
  render(<ResourceAvailability loadResources={loadResources} onUpdateAvailability={onUpdateAvailability} />);
  return { user: userEvent.setup(), loadResources, onUpdateAvailability };
}

describe('US-11 resource availability', () => {
  it('shows loading, then saved statuses and disables unchanged actions', async () => {
    setup();
    expect(screen.getByRole('status')).toHaveTextContent('Loading resources');
    expect(await screen.findByText('Current availability: Available')).toBeInTheDocument();
    expect(screen.getByText('Operational status: operational')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save availability/i })).toBeDisabled();
  });

  it('saves unavailable and available only after Save is selected', async () => {
    const { user, onUpdateAvailability } = setup();
    const select = await screen.findByRole('combobox', { name: /availability for microscope/i });
    const save = screen.getByRole('button', { name: /save availability/i });
    await user.selectOptions(select, 'UNAVAILABLE');
    expect(onUpdateAvailability).not.toHaveBeenCalled();
    expect(screen.getByText('Current availability: Available')).toBeInTheDocument();
    await user.click(save);
    expect(onUpdateAvailability).toHaveBeenLastCalledWith(resource.id, 'UNAVAILABLE');
    expect(await screen.findByText('Microscope is now unavailable.')).toBeInTheDocument();
    expect(screen.getByText('Current availability: Unavailable')).toBeInTheDocument();
    expect(save).toBeDisabled();
    await user.selectOptions(select, 'AVAILABLE');
    await user.click(save);
    expect(onUpdateAvailability).toHaveBeenLastCalledWith(resource.id, 'AVAILABLE');
    expect(await screen.findByText('Microscope is now available.')).toBeInTheDocument();
  });

  it('disables refresh and all edits while saving to prevent duplicate writes', async () => {
    let complete;
    const onUpdateAvailability = vi.fn().mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const { user } = setup({ onUpdateAvailability });
    const select = await screen.findByRole('combobox');
    await user.selectOptions(select, 'UNAVAILABLE');
    await user.click(screen.getByRole('button', { name: /save availability/i }));
    expect(select).toBeDisabled();
    expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /save availability/i })).toHaveTextContent('Saving…');
    complete({ ...resource, availabilityStatus: 'UNAVAILABLE' });
    await screen.findByText('Microscope is now unavailable.');
    expect(onUpdateAvailability).toHaveBeenCalledOnce();
  });

  it('preserves the stored status and draft after a failed save so it can be retried', async () => {
    const onUpdateAvailability = vi.fn().mockRejectedValueOnce(new Error('Save failed.'))
      .mockResolvedValueOnce({ ...resource, availabilityStatus: 'UNAVAILABLE' });
    const { user } = setup({ onUpdateAvailability });
    const select = await screen.findByRole('combobox');
    await user.selectOptions(select, 'UNAVAILABLE');
    await user.click(screen.getByRole('button', { name: /save availability/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed.');
    expect(screen.getByText('Current availability: Available')).toBeInTheDocument();
    expect(select).toHaveValue('UNAVAILABLE');
    await user.click(screen.getByRole('button', { name: /save availability/i }));
    expect(await screen.findByText('Microscope is now unavailable.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a load error and supports retry and refresh with fresh server values', async () => {
    const loadResources = vi.fn().mockRejectedValueOnce(new Error('Load failed.'))
      .mockResolvedValueOnce({ resources: [resource] })
      .mockResolvedValueOnce({ resources: [{ ...resource, availabilityStatus: 'UNAVAILABLE' }] });
    const { user } = setup({ loadResources });
    expect(await screen.findByRole('alert')).toHaveTextContent('Load failed.');
    await user.click(screen.getByRole('button', { name: /try again/i }));
    await screen.findByText('Current availability: Available');
    await user.click(screen.getByRole('button', { name: /refresh/i }));
    expect(await screen.findByText('Current availability: Unavailable')).toBeInTheDocument();
    expect(loadResources).toHaveBeenCalledTimes(3);
  });

  it('keeps archived resources visible with disabled controls', async () => {
    setup({ resources: [{ ...resource, archived: true }] });
    const form = await screen.findByRole('form', { name: /availability for microscope/i });
    expect(within(form).getByText(/archived · availability cannot be changed/i)).toBeInTheDocument();
    expect(within(form).getByRole('combobox')).toBeDisabled();
    expect(within(form).getByRole('button')).toBeDisabled();
  });

  it('shows an empty list with a helpful next step', async () => {
    setup({ resources: [] });
    expect(await screen.findByText('No resources yet')).toBeInTheDocument();
    expect(screen.getByText('Create a resource to manage its availability.')).toBeInTheDocument();
  });

  it('ignores a load result after unmounting', async () => {
    let complete;
    const loadResources = vi.fn().mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const { unmount } = render(<ResourceAvailability loadResources={loadResources} onUpdateAvailability={vi.fn()} />);
    unmount();
    complete({ resources: [resource] });
    await waitFor(() => expect(screen.queryByText('Microscope')).not.toBeInTheDocument());
  });
});
