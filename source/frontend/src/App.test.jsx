import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App.jsx';
import { devLogin, getSession, logout } from './services/api.js';

vi.mock('./services/api.js', () => ({
  createResource: vi.fn(),
  devLogin: vi.fn(),
  extractResourceFromPdf: vi.fn(),
  getSession: vi.fn(),
  logout: vi.fn(),
}));

describe('App authorization UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockRejectedValue(new Error('No session'));
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

  it('does not expose the form to a lab member', async () => {
    const user = userEvent.setup();
    devLogin.mockResolvedValue({
      user: { displayName: 'Local Member', role: 'LAB_MEMBER' },
    });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /sign in as lab member/i }));

    expect(await screen.findByText(/system administrator access is required/i)).toBeInTheDocument();
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
