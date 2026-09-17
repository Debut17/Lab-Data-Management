import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ResourceForm from './ResourceForm.jsx';

function createPdfFile() {
  return new File(['%PDF-1.7 resource'], 'resource.pdf', {
    type: 'application/pdf',
  });
}

async function extractSuggestions(user, onExtract) {
  await user.upload(screen.getByLabelText(/pdf document/i), createPdfFile());
  await user.click(screen.getByRole('button', { name: /extract from pdf/i }));
  expect(onExtract).toHaveBeenCalledOnce();
  await screen.findByText(/suggestions are ready for review/i);
}

describe('ResourceForm', () => {
  it('shows required-field errors without submitting invalid data', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<ResourceForm onCreate={onCreate} />);

    await user.click(screen.getByRole('button', { name: /create resource/i }));

    expect(await screen.findAllByText('This field is required.')).toHaveLength(3);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('offers optional PDF extraction without replacing manual entry', () => {
    render(<ResourceForm onCreate={vi.fn()} onExtract={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /upload pdf/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/resource name/i)).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /create resource/i })).toBeEnabled();
  });

  it('submits editable resource information and shows the saved record', async () => {
    const user = userEvent.setup();
    const savedResource = {
      id: 'resource-123',
      name: 'BX53 Upright Microscope',
      category: 'Microscope',
      location: 'Lab A',
      availabilityStatus: 'AVAILABLE',
      currentStatus: 'OPERATIONAL',
    };
    const onCreate = vi.fn().mockResolvedValue(savedResource);
    render(<ResourceForm onCreate={onCreate} />);

    await user.type(screen.getByLabelText(/resource name/i), 'BX53 Upright Microscope');
    await user.type(screen.getByLabelText(/^category/i), 'Microscope');
    await user.type(screen.getByLabelText(/^location/i), 'Lab A');
    await user.type(screen.getByLabelText(/responsible person/i), 'Dr. Example');
    await user.click(screen.getByRole('button', { name: /create resource/i }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'BX53 Upright Microscope',
        category: 'Microscope',
        location: 'Lab A',
        responsiblePerson: 'Dr. Example',
      }),
    );
    const successMessage = await screen.findByRole('status');
    expect(successMessage).toHaveTextContent('Resource created successfully');
    expect(successMessage).toHaveTextContent('resource-123');
  });

  it('keeps form values editable and reports submission errors', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockRejectedValue(new Error('Resource could not be saved.'));
    render(<ResourceForm onCreate={onCreate} />);

    const nameInput = screen.getByLabelText(/resource name/i);
    await user.type(nameInput, 'Old name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Corrected name');
    await user.type(screen.getByLabelText(/^category/i), 'Equipment');
    await user.type(screen.getByLabelText(/^location/i), 'Room 302');
    await user.click(screen.getByRole('button', { name: /create resource/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Resource could not be saved.');
    expect(nameInput).toHaveValue('Corrected name');
  });

  it('applies AI suggestions to untouched fields without auto-saving', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onExtract = vi.fn().mockResolvedValue({
      name: 'BX53 Upright Microscope',
      category: 'Microscope',
      location: 'Biology Lab A',
      description: 'Research microscope',
      responsiblePerson: 'Dr. Anuwry',
      availabilityStatus: 'UNAVAILABLE',
      currentStatus: 'MAINTENANCE',
      specifications: 'Manufacturer: Olympus; Model: BX53',
    });
    render(
      <ResourceForm onCreate={onCreate} onExtract={onExtract} />,
    );

    await extractSuggestions(user, onExtract);

    expect(screen.getByLabelText(/resource name/i)).toHaveValue('BX53 Upright Microscope');
    expect(screen.getByLabelText(/^category/i)).toHaveValue('Microscope');
    expect(screen.getByLabelText(/^location/i)).toHaveValue('Biology Lab A');
    expect(screen.getByLabelText(/responsible person/i)).toHaveValue('Dr. Anuwry');
    expect(screen.getByLabelText(/^availability/i)).toHaveValue('UNAVAILABLE');
    expect(screen.getByLabelText(/^current status/i)).toHaveValue('MAINTENANCE');
    expect(screen.getByLabelText(/^description/i)).toHaveValue('Research microscope');
    expect(screen.getByLabelText(/^specifications/i)).toHaveValue(
      'Manufacturer: Olympus; Model: BX53',
    );
    expect(screen.getAllByText('AI suggested')).toHaveLength(8);
    expect(screen.getByText(/review every suggested value before saving/i)).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('does not overwrite admin-entered values and keeps missing suggestions blank', async () => {
    const user = userEvent.setup();
    const onExtract = vi.fn().mockResolvedValue({
      name: 'AI name must not replace this value',
      category: 'Microscope',
      location: null,
      description: null,
      responsiblePerson: null,
      availabilityStatus: null,
      currentStatus: null,
      specifications: null,
    });
    render(<ResourceForm onCreate={vi.fn()} onExtract={onExtract} />);

    await user.type(screen.getByLabelText(/resource name/i), 'Admin-entered name');
    await extractSuggestions(user, onExtract);

    expect(screen.getByLabelText(/resource name/i)).toHaveValue('Admin-entered name');
    expect(screen.getByLabelText(/^category/i)).toHaveValue('Microscope');
    expect(screen.getByLabelText(/^location/i)).toHaveValue('');
    expect(screen.getByLabelText(/^description/i)).toHaveValue('');
    expect(screen.getByLabelText(/^availability/i)).toHaveValue('AVAILABLE');
    expect(screen.getByLabelText(/^current status/i)).toHaveValue('OPERATIONAL');
    expect(screen.getAllByText('AI suggested')).toHaveLength(1);
  });

  it('submits the admin-reviewed values and clears suggestions on cancel', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({
      id: 'resource-456',
      name: 'Reviewed Microscope',
    });
    const onExtract = vi.fn().mockResolvedValue({
      name: 'AI Microscope',
      category: 'Microscope',
      location: 'AI Lab',
      description: null,
      responsiblePerson: null,
      availabilityStatus: 'AVAILABLE',
      currentStatus: 'OPERATIONAL',
      specifications: null,
    });
    render(<ResourceForm onCreate={onCreate} onExtract={onExtract} />);

    await extractSuggestions(user, onExtract);
    const nameInput = screen.getByLabelText(/resource name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Reviewed Microscope');
    expect(screen.getAllByText('AI suggested')).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: /create resource/i }));

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Reviewed Microscope',
      category: 'Microscope',
      location: 'AI Lab',
    }));

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByLabelText(/resource name/i)).toHaveValue('');
    expect(screen.getByLabelText(/^category/i)).toHaveValue('');
    expect(screen.queryByText('AI suggested')).not.toBeInTheDocument();
    expect(screen.queryByText(/review every suggested value before saving/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/selected: resource\.pdf/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /extract from pdf/i })).toBeDisabled();
  });
});
