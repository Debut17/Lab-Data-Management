import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App.jsx';
import {
  devLogin,
  getPendingBookings,
  getSession,
  listBookableResources,
  listUsers,
  logout,
} from './services/api.js';

vi.mock('./services/api.js', () => ({
  createBooking: vi.fn(),
  createResource: vi.fn(),
  devLogin: vi.fn(),
  extractResourceFromPdf: vi.fn(),
  getPendingBookings: vi.fn(),
  getSession: vi.fn(),
  listBookableResources: vi.fn(),
  listUsers: vi.fn(),
  logout: vi.fn(),
  reviewBooking: vi.fn(),
  updateUserRole: vi.fn(),
}));

describe('App authorization UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockRejectedValue(new Error('No session'));
    getPendingBookings.mockResolvedValue({ bookings: [] });
    listBookableResources.mockResolvedValue([]);
    listUsers.mockResolvedValue({ users: [] });
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
