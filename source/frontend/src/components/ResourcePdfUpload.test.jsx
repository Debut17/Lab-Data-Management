import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ResourcePdfUpload from './ResourcePdfUpload.jsx';

function createPdfFile(contents = '%PDF-1.7 resource') {
  return new File([contents], 'resource.pdf', { type: 'application/pdf' });
}

describe('ResourcePdfUpload', () => {
  it('shows a PDF picker and keeps extraction disabled until a file is selected', () => {
    render(<ResourcePdfUpload onExtract={vi.fn()} />);

    expect(screen.getByLabelText(/pdf document/i)).toHaveAttribute('accept', expect.stringContaining('.pdf'));
    expect(screen.getByRole('button', { name: /extract from pdf/i })).toBeDisabled();
  });

  it('shows a loading state and reports extracted suggestions without auto-saving', async () => {
    const user = userEvent.setup();
    let finishExtraction;
    const onExtract = vi.fn(() => new Promise((resolve) => {
      finishExtraction = resolve;
    }));
    const onSuggestions = vi.fn();
    render(
      <ResourcePdfUpload
        onExtract={onExtract}
        onSuggestions={onSuggestions}
      />,
    );
    const file = createPdfFile();

    await user.upload(screen.getByLabelText(/pdf document/i), file);
    await user.click(screen.getByRole('button', { name: /extract from pdf/i }));

    expect(screen.getByRole('button', { name: /extracting/i })).toBeDisabled();
    expect(onExtract).toHaveBeenCalledWith(file);

    const suggestions = {
      name: 'BX53 Upright Microscope',
      category: 'Microscope',
      location: null,
    };
    finishExtraction(suggestions);

    expect(await screen.findByText(/2 suggestions.*ready for review/i)).toBeInTheDocument();
    expect(onSuggestions).toHaveBeenCalledWith(suggestions);
  });

  it('rejects unsupported and oversized files before calling the API', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onExtract = vi.fn();
    render(<ResourcePdfUpload onExtract={onExtract} />);
    const input = screen.getByLabelText(/pdf document/i);

    await user.upload(
      input,
      new File(['plain text'], 'resource.txt', { type: 'text/plain' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/select a pdf file/i);

    await user.upload(
      input,
      new File([new Uint8Array((5 * 1024 * 1024) + 1)], 'large.pdf', {
        type: 'application/pdf',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/5 mib or smaller/i);
    expect(onExtract).not.toHaveBeenCalled();
  });

  it('shows a manual-entry fallback and allows retry after extraction fails', async () => {
    const user = userEvent.setup();
    const onExtract = vi.fn().mockRejectedValue(new Error('AI gateway is unavailable.'));
    render(<ResourcePdfUpload onExtract={onExtract} />);

    await user.upload(screen.getByLabelText(/pdf document/i), createPdfFile());
    await user.click(screen.getByRole('button', { name: /extract from pdf/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('AI gateway is unavailable.');
    expect(alert).toHaveTextContent(/continue by entering.*manually/i);
    expect(screen.getByRole('button', { name: /extract from pdf/i })).toBeEnabled();
  });
});
