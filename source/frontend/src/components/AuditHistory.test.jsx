import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import AuditHistory from './AuditHistory.jsx';

const entry = {
  id: '7',
  actorId: 'admin-1',
  actorName: 'Local Administrator',
  action: 'ROLE_ASSIGNED',
  entityType: 'USER',
  affectedRecordId: 'user-2',
  changes: { role: { before: 'LAB_MEMBER', after: 'LAB_STAFF' } },
  createdAt: '2026-10-24T08:00:00.000Z',
};

describe('AuditHistory', () => {
  it('shows who changed what and when with expandable field details', async () => {
    const loadAuditLogs = vi.fn().mockResolvedValue({ auditLogs: [entry], hasMore: false });
    const user = userEvent.setup();
    render(<AuditHistory loadAuditLogs={loadAuditLogs} />);

    expect(await screen.findByText('Local Administrator')).toBeInTheDocument();
    expect(screen.getByText('Role assigned')).toBeInTheDocument();
    expect(screen.getByText(/USER/)).toBeInTheDocument();
    expect(screen.getByText(/user-2/)).toBeInTheDocument();
    expect(document.querySelector('time')).toHaveAttribute('datetime', entry.createdAt);
    await user.click(screen.getByText('View changes'));
    expect(screen.getByText('LAB_MEMBER')).toBeInTheDocument();
    expect(screen.getByText('LAB_STAFF')).toBeInTheDocument();
    expect(loadAuditLogs).toHaveBeenCalledWith(1, 20);
  });

  it('explains legacy entries with no field diff', async () => {
    render(<AuditHistory loadAuditLogs={vi.fn().mockResolvedValue({
      auditLogs: [{ ...entry, changes: null }], hasMore: false,
    })} />);
    expect(await screen.findByText(/field details were not recorded/i)).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    render(<AuditHistory loadAuditLogs={vi.fn().mockResolvedValue({ auditLogs: [], hasMore: false })} />);
    expect(await screen.findByText(/no change history yet/i)).toBeInTheDocument();
  });

  it('shows an error and can retry', async () => {
    const loadAuditLogs = vi.fn()
      .mockRejectedValueOnce(new Error('History unavailable.'))
      .mockResolvedValueOnce({ auditLogs: [entry], hasMore: false });
    const user = userEvent.setup();
    render(<AuditHistory loadAuditLogs={loadAuditLogs} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('History unavailable.');
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Local Administrator')).toBeInTheDocument();
    expect(loadAuditLogs).toHaveBeenCalledTimes(2);
  });

  it('moves between bounded pages', async () => {
    const loadAuditLogs = vi.fn()
      .mockResolvedValueOnce({ auditLogs: [entry], hasMore: true })
      .mockResolvedValueOnce({ auditLogs: [{ ...entry, id: '6' }], hasMore: false })
      .mockResolvedValueOnce({ auditLogs: [entry], hasMore: true });
    const user = userEvent.setup();
    render(<AuditHistory loadAuditLogs={loadAuditLogs} />);
    await screen.findByText('Local Administrator');
    await user.click(screen.getByRole('button', { name: /next page/i }));
    expect(await screen.findByText('Page 2')).toBeInTheDocument();
    expect(loadAuditLogs).toHaveBeenNthCalledWith(2, 2, 20);
    expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /previous page/i }));
    expect(await screen.findByText('Page 1')).toBeInTheDocument();
    expect(loadAuditLogs).toHaveBeenNthCalledWith(3, 1, 20);
  });
});
