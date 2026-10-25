import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App.jsx';
import { archiveResource, listAdminResources, updateResourceAvailability } from './services/api.js';
import {
  devLogin,
  getMyBookings,
  getPendingBookings,
  getSession,
  getAuditLogs,
  listResources,
  listUsers,
  logout,
} from './services/api.js';

vi.mock('./services/api.js', () => ({
  archiveResource: vi.fn(),
  listAdminResources: vi.fn(),
  updateResourceAvailability: vi.fn(),
  cancelBooking: vi.fn(),
  createBooking: vi.fn(),
  createResource: vi.fn(),
  devLogin: vi.fn(),
  extractResourceFromPdf: vi.fn(),
  getMyBookings: vi.fn(),
  getPendingBookings: vi.fn(),
  getSession: vi.fn(),
  getAuditLogs: vi.fn(),
  listResources: vi.fn(),
  listUsers: vi.fn(),
  logout: vi.fn(),
  reviewBooking: vi.fn(),
  updateUserRole: vi.fn(),
}));

describe('App authorization UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAdminResources.mockResolvedValue({ resources: [] });
    getSession.mockRejectedValue(new Error('No session'));
    getPendingBookings.mockResolvedValue({ bookings: [] });
    listResources.mockResolvedValue([]);
    listUsers.mockResolvedValue({ users: [] });
    getMyBookings.mockResolvedValue({ bookings: [] });
    getAuditLogs.mockResolvedValue({ auditLogs: [], hasMore: false });
  });

  it('lets a lab member switch between requesting and viewing their bookings', async () => {
    const user = userEvent.setup();
    devLogin.mockResolvedValue({
      user: { id: 'user-member', displayName: 'Local Member', role: 'LAB_MEMBER' },
    });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /sign in as lab member/i }));

    expect(screen.getByRole('heading', { name: 'Resource Booking', level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /request a resource booking/i })).toBeInTheDocument();
    expect(getMyBookings).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /open navigation/i }));
    await user.click(screen.getByRole('button', { name: /^my bookings$/i }));

    expect(screen.getByRole('heading', { name: 'My Bookings', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'My Booking Requests' })).toBeInTheDocument();
    expect(await screen.findByText(/you have no booking requests/i)).toBeInTheDocument();
    expect(getMyBookings).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: /open navigation/i }));
    await user.click(screen.getByRole('button', { name: /request booking/i }));

    expect(await screen.findByRole('heading', { name: /request a resource booking/i })).toBeInTheDocument();
  });

  it('lets an administrator open user role management from navigation', async () => {
    const user = userEvent.setup();
    devLogin.mockResolvedValue({
      user: { id: 'user-admin', displayName: 'Local Admin', role: 'SYSTEM_ADMIN' },
    });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /sign in as system administrator/i }));
    await user.click(screen.getByRole('button', { name: /open navigation/i }));
    await user.click(screen.getByRole('button', { name: /user roles/i }));

    expect(screen.getByRole('heading', { name: /user administration/i })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'User Roles' })).toBeInTheDocument();
    expect(listUsers).toHaveBeenCalledOnce();
  });

  it('lets an administrator open resource availability from navigation', async () => {
    const user = userEvent.setup();
    getSession.mockResolvedValue({ user: { id: 'admin', displayName: 'Admin', role: 'SYSTEM_ADMIN' } });
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /open navigation/i }));
    await user.click(screen.getByRole('button', { name: /^resource availability$/i }));
    expect(await screen.findByRole('heading', { name: 'Resource Availability', level: 2 })).toBeInTheDocument();
    expect(await screen.findByText('No resources yet')).toBeInTheDocument();
    expect(listAdminResources).toHaveBeenCalledOnce();
    expect(screen.queryByRole('heading', { name: 'Create Resource', level: 2 })).not.toBeInTheDocument();
  });

  it('lets an administrator open the resource archive from navigation', async () => {
    const user = userEvent.setup();
    getSession.mockResolvedValue({ user: { id: 'admin', displayName: 'Admin', role: 'SYSTEM_ADMIN' } });
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /open navigation/i }));
    await user.click(screen.getByRole('button', { name: /^archive resources$/i }));
    expect(screen.getByRole('heading', { name: 'Resource Archive', level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Archive Resources', level: 2 })).toBeInTheDocument();
    expect(listAdminResources).toHaveBeenCalledOnce();
    expect(archiveResource).not.toHaveBeenCalled();
  });

  it('hides resource availability management from a member', async () => {
    const user = userEvent.setup();
    getSession.mockResolvedValue({ user: { id: 'member', displayName: 'Member', role: 'LAB_MEMBER' } });
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /open navigation/i }));
    expect(screen.queryByRole('button', { name: /^resource availability$/i })).not.toBeInTheDocument();
    expect(listAdminResources).not.toHaveBeenCalled();
  });

  it('shows members the availability saved by the administrator without hiding the resource', async () => {
    const user = userEvent.setup();
    let resource = { id: 'resource-1', name: 'Shared Microscope', category: 'Microscope', location: 'Lab A',
      availabilityStatus: 'AVAILABLE', currentStatus: 'OPERATIONAL', archived: false };
    listAdminResources.mockImplementation(async () => ({ resources: [{ ...resource }] }));
    listResources.mockImplementation(async () => [{ ...resource }]);
    updateResourceAvailability.mockImplementation(async (id, availabilityStatus) => {
      resource = { ...resource, availabilityStatus };
      return { ...resource };
    });
    devLogin.mockImplementation(async (email) => ({ user: {
      id: email, displayName: email, role: email === 'admin@local.test' ? 'SYSTEM_ADMIN' : 'LAB_MEMBER',
    } }));
    render(<App />);

    for (const status of ['UNAVAILABLE', 'AVAILABLE']) {
      await user.click(await screen.findByRole('button', { name: /sign in as system administrator/i }));
      await user.click(screen.getByRole('button', { name: /open navigation/i }));
      await user.click(screen.getByRole('button', { name: /^resource availability$/i }));
      await user.selectOptions(await screen.findByRole('combobox'), status);
      await user.click(screen.getByRole('button', { name: /save availability/i }));
      await screen.findByText(`Shared Microscope is now ${status.toLowerCase()}.`);
      await user.click(screen.getByRole('button', { name: /sign out/i }));
      await user.click(await screen.findByRole('button', { name: /sign in as lab member/i }));
      expect(await screen.findByRole('listitem', { name: 'Shared Microscope' })).toBeInTheDocument();
      const option = screen.getByRole('option', { name: /shared microscope/i });
      if (status === 'UNAVAILABLE') {
        expect(option).toBeDisabled();
        expect(screen.getByText('Unavailable · Cannot currently be booked')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /submit booking request/i })).toBeDisabled();
      } else {
        expect(option).toBeEnabled();
        expect(screen.getByText('Available · Can request booking')).toBeInTheDocument();
      }
      await user.click(screen.getByRole('button', { name: /sign out/i }));
    }
    expect(updateResourceAvailability).toHaveBeenCalledTimes(2);
  });

  it('lets only an administrator open change history', async () => {
    const user = userEvent.setup();
    devLogin.mockResolvedValue({
      user: { id: 'user-admin', displayName: 'Local Admin', role: 'SYSTEM_ADMIN' },
    });
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /sign in as system administrator/i }));
    await user.click(screen.getByRole('button', { name: /open navigation/i }));
    await user.click(screen.getByRole('button', { name: /change history/i }));
    expect(await screen.findByRole('heading', { name: 'Change History', level: 2 })).toBeInTheDocument();
    expect(getAuditLogs).toHaveBeenCalledWith(1, 20);
  });

  it('shows lab staff their role without member booking or admin tools', async () => {
    const user = userEvent.setup();
    devLogin.mockResolvedValue({
      user: { displayName: 'Local Staff', role: 'LAB_STAFF' },
    });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /sign in as lab staff/i }));

    expect(devLogin).toHaveBeenCalledWith('staff@local.test');
    expect(await screen.findByRole('heading', { name: /lab operations/i })).toBeInTheDocument();
    expect(screen.getByText('Lab Staff', { selector: '.user-panel span' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /request a resource booking/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open navigation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change history/i })).not.toBeInTheDocument();
  });

  it('lets an administrator open pending booking requests from navigation', async () => {
    const user = userEvent.setup();
    devLogin.mockResolvedValue({
      user: { displayName: 'Local Admin', role: 'SYSTEM_ADMIN' },
    });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /sign in as system administrator/i }));
    await user.click(screen.getByRole('button', { name: /open navigation/i }));
    await user.click(screen.getByRole('button', { name: /booking requests/i }));

    expect(screen.getByRole('heading', { name: /booking administration/i })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /pending booking requests/i })).toBeInTheDocument();
    expect(await screen.findByText(/no pending booking requests/i)).toBeInTheDocument();
  });

  it('allows the local system administrator to open the create form', async () => {
    const user = userEvent.setup();
    devLogin.mockResolvedValue({
      user: { displayName: 'Local Admin', role: 'SYSTEM_ADMIN' },
    });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /sign in as system administrator/i }));

    expect(await screen.findByRole('heading', { name: 'Create Resource' })).toBeInTheDocument();
    expect(screen.getByLabelText(/pdf document/i)).toBeInTheDocument();
    expect(screen.getByText('System Administrator')).toBeInTheDocument();
  });

  it('opens the booking request form for a lab member', async () => {
    const user = userEvent.setup();
    devLogin.mockResolvedValue({
      user: { displayName: 'Local Member', role: 'LAB_MEMBER' },
    });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /sign in as lab member/i }));

    expect(await screen.findByRole('heading', { name: /request a resource booking/i })).toBeInTheDocument();
    expect(screen.getByText('Lab Member')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Create Resource' })).not.toBeInTheDocument();
  });

  it('restores an existing session and can sign out', async () => {
    const user = userEvent.setup();
    getSession.mockResolvedValue({
      user: { displayName: 'Existing Admin', role: 'SYSTEM_ADMIN' },
    });
    logout.mockResolvedValue();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /sign out/i }));

    expect(logout).toHaveBeenCalledOnce();
    expect(await screen.findByRole('heading', { name: /local review sign in/i })).toBeInTheDocument();
  });

  it('shows a local-login failure without exposing the create form', async () => {
    const user = userEvent.setup();
    devLogin.mockRejectedValue(new Error('Local review login is unavailable.'));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /sign in as system administrator/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Local review login is unavailable.');
    expect(screen.queryByRole('heading', { name: 'Create Resource' })).not.toBeInTheDocument();
  });
});
