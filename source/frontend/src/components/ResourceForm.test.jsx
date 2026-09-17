import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ResourceForm from './ResourceForm.jsx';

describe('ResourceForm', () => {
  it('shows required-field errors without submitting invalid data', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<ResourceForm onCreate={onCreate} />);

    await user.click(screen.getByRole('button', { name: /create resource/i }));

    expect(await screen.findAllByText('This field is required.')).toHaveLength(3);
    expect(onCreate).not.toHaveBeenCalled();
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
});
