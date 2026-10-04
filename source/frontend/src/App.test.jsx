import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App.jsx';
import { devLogin, getSession, listBookableResources, logout } from './services/api.js'; //Added Iteration 3

vi.mock('./services/api.js', () => ({
  createBooking: vi.fn(), //Added Iteration 3
  createResource: vi.fn(),
  devLogin: vi.fn(),
  extractResourceFromPdf: vi.fn(),
  getSession: vi.fn(),
  listBookableResources: vi.fn(), //Added Iteration 3
  logout: vi.fn(),
}));

describe('App authorization UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockRejectedValue(new Error('No session'));
    listBookableResources.mockResolvedValue([]); //Added Iteration 3
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

  it('opens the booking request form for a lab member', async () => { //Added Iteration 3
    const user = userEvent.setup();
    devLogin.mockResolvedValue({
      user: { displayName: 'Local Member', role: 'LAB_MEMBER' },
    });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /sign in as lab member/i }));

    expect(await screen.findByRole('heading', { name: /request a resource booking/i })).toBeInTheDocument(); //Added Iteration 3
    expect(screen.getByText('Lab Member')).toBeInTheDocument(); //Added Iteration 3
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
