import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import MyResourceReports from './MyResourceReports.jsx';

describe('MyResourceReports', () => {
  it('shows the reporter the status and the administrator outcome', async () => {
    const loadReports = vi.fn().mockResolvedValue({
      reports: [{
        id: 'report-1',
        resourceName: 'Shared Microscope',
        problemType: 'MALFUNCTION',
        description: 'The lamp does not turn on.',
        submittedAt: '2026-11-08T03:00:00.000Z',
        status: 'RESOLVED',
        resolutionNote: 'Replaced the lamp.',
        statusUpdatedAt: '2026-11-08T05:00:00.000Z',
        statusUpdatedByName: 'Local Administrator',
      }],
    });
    render(<MyResourceReports loadReports={loadReports} />);

    expect(await screen.findByText('Shared Microscope')).toBeInTheDocument();
    expect(screen.getByText('Resolved')).toBeInTheDocument();
    expect(screen.getByText('Replaced the lamp.')).toBeInTheDocument();
    expect(screen.getByText(/by Local Administrator/)).toBeInTheDocument();
  });

  it('reloads when a new report is submitted', async () => {
    const loadReports = vi.fn().mockResolvedValue({ reports: [] });
    const { rerender } = render(<MyResourceReports loadReports={loadReports} refreshKey={0} />);
    expect(await screen.findByText(/have not reported any problems yet/i)).toBeInTheDocument();
    rerender(<MyResourceReports loadReports={loadReports} refreshKey={1} />);
    await screen.findByText(/have not reported any problems yet/i);
    expect(loadReports).toHaveBeenCalledTimes(2);
  });
});
