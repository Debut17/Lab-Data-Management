import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import AdministrativeRecords from './AdministrativeRecords.jsx';

const summary = {
  resources: { total: 3, active: 2, archived: 1, unavailable: 1 },
  bookings: { total: 4, byStatus: { PENDING: 1, APPROVED: 2, REJECTED: 1, CANCELLED: 0 } },
  users: { total: 4, byRole: { SYSTEM_ADMIN: 1, LAB_STAFF: 1, LAB_MEMBER: 2 } },
  issueReports: null,
  auditLogs: { total: 12, lastSevenDays: 5 },
};
const resources = [
  { id: 'r1', name: 'BX53 Upright Microscope', category: 'Microscope', location: 'Room 201', availabilityStatus: 'AVAILABLE', currentStatus: 'OPERATIONAL', archived: false },
  { id: 'r2', name: 'Retired Centrifuge', category: 'Centrifuge', location: 'Store', availabilityStatus: 'UNAVAILABLE', currentStatus: 'OUT_OF_SERVICE', archived: true },
];
const rejectedBooking = {
  id: 'b1',
  resourceName: 'Retired Centrifuge',
  resourceArchived: true,
  requesterName: 'Local Lab Member',
  requesterEmail: 'member@local.test',
  startTime: '2026-11-10T02:00:00.000Z',
  endTime: '2026-11-10T04:00:00.000Z',
  status: 'REJECTED',
  rejectionReason: 'Resource is being retired.',
  reviewerName: 'Local Administrator',
  reviewedAt: '2026-11-07T03:00:00.000Z',
  createdAt: '2026-11-06T03:00:00.000Z',
};

function setup(overrides = {}) {
  const props = {
    loadSummary: vi.fn().mockResolvedValue(summary),
    loadResources: vi.fn().mockResolvedValue({ resources }),
    loadBookings: vi.fn().mockResolvedValue({ bookings: [rejectedBooking] }),
    loadUsers: vi.fn().mockResolvedValue({
      users: [{ id: 'u1', displayName: 'Local Lab Member', email: 'member@local.test', role: 'LAB_MEMBER', isActive: true }],
    }),
    loadAuditLogs: vi.fn().mockResolvedValue({
      auditLogs: [{ id: '1', actorName: 'Local Administrator', action: 'RESOURCE_ARCHIVED', entityType: 'RESOURCE', createdAt: '2026-11-07T03:00:00.000Z' }],
    }),
    onOpenHistory: vi.fn(),
    ...overrides,
  };
  render(<AdministrativeRecords {...props} />);
  return { user: userEvent.setup(), ...props };
}

describe('US-17 administrative records', () => {
  it('summarises every record type and shows resources first', async () => {
    const { loadSummary, loadResources } = setup();

    const cards = await screen.findByLabelText('Record summary');
    expect(within(cards).getByText('2 active · 1 archived · 1 unavailable')).toBeInTheDocument();
    expect(within(cards).getByText('1 pending · 2 approved')).toBeInTheDocument();
    expect(within(cards).getByText('1 admin · 1 staff · 2 members')).toBeInTheDocument();
    expect(within(cards).getByText('5 in the last 7 days')).toBeInTheDocument();
    expect(within(cards).getByText(/available once issue reporting/i)).toBeInTheDocument();

    expect(await screen.findByRole('cell', { name: 'BX53 Upright Microscope' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Archived' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Out of service' })).toBeInTheDocument();
    expect(loadSummary).toHaveBeenCalledOnce();
    expect(loadResources).toHaveBeenCalledOnce();
  });

  it('shows issue report counts when issue reporting is available', async () => {
    setup({
      loadSummary: vi.fn().mockResolvedValue({ ...summary, issueReports: { total: 3, byStatus: { PENDING: 2 } } }),
    });

    const cards = await screen.findByLabelText('Record summary');
    expect(within(cards).getByText('2 pending')).toBeInTheDocument();
  });

  it('lists bookings in every status and filters by status', async () => {
    const { user, loadBookings } = setup();

    await user.click(await screen.findByRole('tab', { name: 'Bookings' }));

    expect(await screen.findByText('Resource is being retired.')).toBeInTheDocument();
    expect(screen.getByText('(archived)')).toBeInTheDocument();
    expect(loadBookings).toHaveBeenLastCalledWith('ALL');

    await user.selectOptions(screen.getByLabelText('Booking status'), 'REJECTED');

    await waitFor(() => expect(loadBookings).toHaveBeenLastCalledWith('REJECTED'));
  });

  it('shows user roles and the latest audit entries with a link to Change History', async () => {
    const { user, loadAuditLogs, onOpenHistory } = setup();

    await user.click(await screen.findByRole('tab', { name: 'User Roles' }));
    expect(await screen.findByRole('cell', { name: 'member@local.test' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Lab Member' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Audit Log' }));
    expect(await screen.findByRole('cell', { name: 'Resource archived' })).toBeInTheDocument();
    expect(loadAuditLogs).toHaveBeenCalledWith(1, 10);

    await user.click(screen.getByRole('button', { name: /open full change history/i }));
    expect(onOpenHistory).toHaveBeenCalledOnce();
  });

  it('shows empty tables and reports load failures', async () => {
    const { user } = setup({
      loadSummary: vi.fn().mockRejectedValue(new Error('Summary could not be loaded.')),
      loadResources: vi.fn().mockResolvedValue({ resources: [] }),
      loadBookings: vi.fn().mockRejectedValue(new Error('Bookings could not be loaded.')),
    });

    expect(await screen.findByText('Summary could not be loaded.')).toBeInTheDocument();
    expect(await screen.findByText('No resources yet.')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Bookings' }));
    expect(await screen.findByText('Bookings could not be loaded.')).toBeInTheDocument();
  });

  it('refreshes the summary and the open tab', async () => {
    const { user, loadSummary, loadResources } = setup();
    await screen.findByRole('cell', { name: 'BX53 Upright Microscope' });

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(loadSummary).toHaveBeenCalledTimes(2));
    expect(loadResources).toHaveBeenCalledTimes(2);
  });
});
