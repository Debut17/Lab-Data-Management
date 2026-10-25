import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ResourceEditor from './ResourceEditor.jsx';

const microscope = {
  id: 'resource-1',
  name: 'BX53 Upright Microscope',
  category: 'Microscope',
  location: 'Biology Lab A, Room 201',
  description: 'Upright microscope for laboratory observation.',
  responsiblePerson: 'Dr. Example',
  availabilityStatus: 'AVAILABLE',
  currentStatus: 'OPERATIONAL',
  specifications: null,
  archived: false,
};
const retired = {
  id: 'resource-2',
  name: 'Retired Stereo Microscope',
  category: 'Microscope',
  location: 'Store',
  description: null,
  responsiblePerson: null,
  availabilityStatus: 'AVAILABLE',
  currentStatus: 'OUT_OF_SERVICE',
  specifications: null,
  archived: true,
};

function setup({
  resources = [microscope, retired],
  loadResources = vi.fn().mockResolvedValue({ resources }),
  onUpdate = vi.fn().mockImplementation(async (id, form) => ({ id, ...form })),
} = {}) {
  render(<ResourceEditor loadResources={loadResources} onUpdate={onUpdate} />);
  return { user: userEvent.setup(), loadResources, onUpdate };
}

function cardFor(name) {
  return screen.getByRole('heading', { name, level: 3 }).closest('.resource-editor-card');
}

async function openEditor(user, resource = microscope) {
  await screen.findByRole('heading', { name: resource.name, level: 3 });
  await user.click(within(cardFor(resource.name)).getByRole('button', { name: 'Edit' }));
}

describe('US-9 edit resource records', () => {
  it('shows loading, then every resource with archived ones locked', async () => {
    const { loadResources } = setup();

    expect(screen.getByText(/loading resources/i)).toBeInTheDocument();
    await screen.findByRole('heading', { name: microscope.name, level: 3 });

    expect(within(cardFor(microscope.name)).getByRole('button', { name: 'Edit' })).toBeEnabled();
    const archivedCard = cardFor(retired.name);
    expect(within(archivedCard).getByText('Archived')).toBeInTheDocument();
    expect(within(archivedCard).getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(loadResources).toHaveBeenCalledOnce();
  });

  it('fills the form with the stored values and turns null fields into blanks', async () => {
    const { user } = setup();

    await openEditor(user);

    expect(screen.getByRole('heading', { name: `Edit: ${microscope.name}` })).toBeInTheDocument();
    expect(screen.getByLabelText(/resource name/i)).toHaveValue(microscope.name);
    expect(screen.getByLabelText(/location/i)).toHaveValue(microscope.location);
    expect(screen.getByLabelText(/responsible person/i)).toHaveValue('Dr. Example');
    expect(screen.getByLabelText(/availability status/i)).toHaveValue('AVAILABLE');
    expect(screen.getByLabelText(/current status/i)).toHaveValue('OPERATIONAL');
    expect(screen.getByLabelText(/specifications/i)).toHaveValue('');
  });

  it('saves the edited form for the selected resource and shows the new values', async () => {
    const { user, onUpdate } = setup();
    await openEditor(user);

    const location = screen.getByLabelText(/location/i);
    await user.clear(location);
    await user.type(location, 'Biology Lab B, Room 305');
    await user.selectOptions(screen.getByLabelText(/current status/i), 'MAINTENANCE');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Resource updated successfully.');
    expect(onUpdate).toHaveBeenCalledWith('resource-1', {
      name: microscope.name,
      category: microscope.category,
      location: 'Biology Lab B, Room 305',
      description: microscope.description,
      responsiblePerson: microscope.responsiblePerson,
      availabilityStatus: 'AVAILABLE',
      currentStatus: 'MAINTENANCE',
      specifications: '',
    });
    expect(screen.queryByRole('heading', { name: /^Edit:/ })).not.toBeInTheDocument();
    const updatedCard = cardFor(microscope.name);
    expect(within(updatedCard).getByText('Biology Lab B, Room 305')).toBeInTheDocument();
    expect(within(updatedCard).getByText('MAINTENANCE')).toBeInTheDocument();
  });

  it('keeps the form open and shows the server message when saving fails', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('Archived resources cannot be edited.'));
    const { user } = setup({ onUpdate });
    await openEditor(user);

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Archived resources cannot be edited.');
    expect(screen.getByRole('heading', { name: `Edit: ${microscope.name}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('disables the form and edit buttons while a save is in progress', async () => {
    let finishSave;
    const onUpdate = vi.fn().mockImplementation(
      (id, form) => new Promise((resolve) => { finishSave = () => resolve({ id, ...form }); }),
    );
    const { user } = setup({ onUpdate });
    await openEditor(user);

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByLabelText(/resource name/i)).toBeDisabled();
    expect(within(cardFor(microscope.name)).getByRole('button', { name: 'Edit' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Saving...' }));
    expect(onUpdate).toHaveBeenCalledOnce();

    finishSave();
    expect(await screen.findByRole('status')).toHaveTextContent('Resource updated successfully.');
  });

  it('cancel closes the form without saving or changing the list', async () => {
    const { user, onUpdate } = setup();
    await openEditor(user);

    const name = screen.getByLabelText(/resource name/i);
    await user.clear(name);
    await user.type(name, 'Unsaved name');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('heading', { name: /^Edit:/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: microscope.name, level: 3 })).toBeInTheDocument();
    expect(screen.queryByText('Unsaved name')).not.toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('shows a load error', async () => {
    setup({ loadResources: vi.fn().mockRejectedValue(new Error('Resources could not be loaded.')) });
    expect(await screen.findByRole('alert')).toHaveTextContent('Resources could not be loaded.');
  });

  it('explains when there are no resources to edit', async () => {
    setup({ resources: [] });
    expect(await screen.findByText('No resources found.')).toBeInTheDocument();
  });
});
