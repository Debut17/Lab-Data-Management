import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import IssueReportReview from './IssueReportReview.jsx';

const pendingReport = {
  id: 'report-1',
  resourceName: 'Shared Microscope',
  problemType: 'MALFUNCTION',
  description: 'The lamp does not turn on.',
  reporterName: 'Local Lab Staff',
  reporterEmail: 'staff@local.test',
  submittedAt: '2026-11-08T03:00:00.000Z',
  status: 'PENDING',
  resolutionNote: null,
  statusUpdatedAt: null,
  statusUpdatedByName: null,
};

const resolvedReport = {
  ...pendingReport,
  id: 'report-2',
  resourceName: 'Centrifuge',
  status: 'RESOLVED',
  resolutionNote: 'Rebalanced the rotor.',
  statusUpdatedAt: '2026-11-07T05:00:00.000Z',
  statusUpdatedByName: 'Local Administrator',
};

function renderReview(onResolve = vi.fn()) {
  const loadReports = vi.fn().mockResolvedValue({ reports: [pendingReport, resolvedReport] });
  render(<IssueReportReview loadReports={loadReports} onResolve={onResolve} />);
  return { loadReports, onResolve };
}

describe('IssueReportReview', () => {
  it('shows open reports first and resolved reports with their outcome', async () => {
    const user = userEvent.setup();
    renderReview();

    expect(await screen.findByText('Shared Microscope')).toBeInTheDocument();
    expect(screen.getByText('The lamp does not turn on.')).toBeInTheDocument();
    expect(screen.queryByText('Centrifuge')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^resolved/i }));
    expect(screen.getByText('Centrifuge')).toBeInTheDocument();
    expect(screen.getByText('Rebalanced the rotor.')).toBeInTheDocument();
    expect(screen.getByText('by Local Administrator')).toBeInTheDocument();
  });

  it('resolves a report with a note and tells the administrator the reporter was notified', async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn().mockResolvedValue({
      ...pendingReport,
      status: 'RESOLVED',
      resolutionNote: 'Replaced the lamp.',
      statusUpdatedAt: '2026-11-08T05:00:00.000Z',
      statusUpdatedByName: 'Local Administrator',
      reporterNotified: true,
    });
    renderReview(onResolve);

    await user.click(await screen.findByRole('button', { name: /update shared microscope report/i }));
    const form = screen.getByRole('form', { name: /update shared microscope report/i });
    await user.selectOptions(within(form).getByLabelText(/status/i), 'RESOLVED');
    await user.type(within(form).getByLabelText(/resolution note/i), '  Replaced the lamp.  ');
    await user.click(within(form).getByRole('button', { name: /save update/i }));

    expect(onResolve).toHaveBeenCalledWith('report-1', { status: 'RESOLVED', resolutionNote: 'Replaced the lamp.' });
    expect(await screen.findByText(/shared microscope is now resolved\. local lab staff was notified\./i))
      .toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^resolved/i }));
    expect(screen.getByText('Replaced the lamp.')).toBeInTheDocument();
  });

  it('requires a resolution note before marking a report resolved', async () => {
    const user = userEvent.setup();
    const { onResolve } = renderReview();

    await user.click(await screen.findByRole('button', { name: /update shared microscope report/i }));
    const form = screen.getByRole('form', { name: /update shared microscope report/i });
    await user.selectOptions(within(form).getByLabelText(/status/i), 'RESOLVED');
    form.noValidate = true;
    await user.click(within(form).getByRole('button', { name: /save update/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/add a resolution note/i);
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('keeps the form open and shows the error when saving fails', async () => {
    const user = userEvent.setup();
    renderReview(vi.fn().mockRejectedValue(new Error('Change the status or resolution note before saving.')));

    await user.click(await screen.findByRole('button', { name: /update shared microscope report/i }));
    await user.click(screen.getByRole('button', { name: /save update/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/change the status or resolution note/i);
    expect(screen.getByRole('form', { name: /update shared microscope report/i })).toBeInTheDocument();
  });
});
