import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ResourceProblemForm from './ResourceProblemForm.jsx';

const resource = {
  id: 'resource-1',
  name: 'Microscope',
  location: 'Room 201',
};

const savedReport = {
  id: 'report-1',
  resourceId: resource.id,
  resourceName: resource.name,
  problemType: 'MALFUNCTION',
  description: 'The focus control slips.',
  reporterName: 'Local Lab Staff',
  submittedAt: '2026-11-07T08:00:00.000Z',
  status: 'PENDING',
};

function setup({
  resources = [resource],
  onLoadResources = vi.fn().mockResolvedValue(resources),
  onCreate = vi.fn().mockResolvedValue(savedReport),
} = {}) {
  render(
    <ResourceProblemForm
      onLoadResources={onLoadResources}
      onCreate={onCreate}
      reporterName="Local Lab Staff"
    />,
  );
  return { user: userEvent.setup(), onLoadResources, onCreate };
}

async function fillValidReport(user) {
  await user.selectOptions(await screen.findByLabelText(/affected resource/i), resource.id);
  await user.selectOptions(screen.getByLabelText(/problem type/i), 'MALFUNCTION');
  await user.type(screen.getByLabelText(/description/i), '  The focus control slips.  ');
}

describe('US-7 resource problem form', () => {
  it('loads resources, submits normalized data, and resets after success', async () => {
    const { user, onCreate } = setup();

    expect(screen.getByRole('status')).toHaveTextContent('Loading resources');
    await fillValidReport(user);
    await user.click(screen.getByRole('button', { name: /submit problem report/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({
      resourceId: resource.id,
      problemType: 'MALFUNCTION',
      description: 'The focus control slips.',
    }));
    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent('Problem report submitted');
    expect(confirmation).toHaveTextContent('Microscope');
    expect(confirmation).toHaveTextContent('Equipment malfunction');
    expect(confirmation).toHaveTextContent('Local Lab Staff');
    expect(screen.getByLabelText(/affected resource/i)).toHaveValue('');
    expect(screen.getByLabelText(/description/i)).toHaveValue('');
  });

  it('rejects an incomplete submission before calling the API', async () => {
    const { onCreate } = setup();
    await screen.findByRole('option', { name: /microscope/i });

    fireEvent.submit(document.querySelector('form'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Select a resource and problem type, and describe the problem.',
    );
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('shows loading failures and supports an empty-state retry', async () => {
    const onLoadResources = vi.fn()
      .mockRejectedValueOnce(new Error('Resources are unavailable.'))
      .mockResolvedValueOnce([]);
    const { user } = setup({ onLoadResources });

    expect(await screen.findByRole('alert')).toHaveTextContent('Resources are unavailable.');
    await user.click(screen.getByRole('button', { name: /refresh resources/i }));

    expect(await screen.findByText('There are no resources to report a problem for.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit problem report/i })).toBeDisabled();
    expect(onLoadResources).toHaveBeenCalledTimes(2);
  });

  it('keeps the draft after a failed submission so the report can be retried', async () => {
    const onCreate = vi.fn()
      .mockRejectedValueOnce(new Error('Report could not be saved.'))
      .mockResolvedValueOnce(savedReport);
    const { user } = setup({ onCreate });
    await fillValidReport(user);

    await user.click(screen.getByRole('button', { name: /submit problem report/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Report could not be saved.');
    expect(screen.getByLabelText(/affected resource/i)).toHaveValue(resource.id);
    expect(screen.getByLabelText(/description/i)).toHaveValue('  The focus control slips.  ');

    await user.click(screen.getByRole('button', { name: /submit problem report/i }));
    expect(await screen.findByText('Problem report submitted. Administrators have been notified.')).toBeInTheDocument();
    expect(onCreate).toHaveBeenCalledTimes(2);
  });

  it('disables controls while saving to prevent duplicate reports', async () => {
    let finish;
    const onCreate = vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { user } = setup({ onCreate });
    await fillValidReport(user);

    await user.click(screen.getByRole('button', { name: /submit problem report/i }));
    expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /refresh resources/i })).toBeDisabled();
    expect(screen.getByLabelText(/description/i)).toBeDisabled();
    expect(onCreate).toHaveBeenCalledOnce();

    finish(savedReport);
    expect(await screen.findByText('Problem report submitted. Administrators have been notified.')).toBeInTheDocument();
  });

  it('ignores a resource response after unmounting', async () => {
    let finish;
    const onLoadResources = vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { unmount } = render(
      <ResourceProblemForm
        onLoadResources={onLoadResources}
        onCreate={vi.fn()}
        reporterName="Local Lab Staff"
      />,
    );

    unmount();
    finish([resource]);
    await waitFor(() => expect(screen.queryByText('Microscope')).not.toBeInTheDocument());
  });
});
