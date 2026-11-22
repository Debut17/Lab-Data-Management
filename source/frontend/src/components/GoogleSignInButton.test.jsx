import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import GoogleSignInButton from './GoogleSignInButton.jsx';

const SCRIPT = 'script[src="https://accounts.google.com/gsi/client"]';

function mockGoogle() {
  const google = {
    accounts: {
      id: {
        initialize: vi.fn(),
        renderButton: vi.fn(),
      },
    },
  };
  window.google = google;
  return google.accounts.id;
}

afterEach(() => {
  delete window.google;
  document.querySelectorAll(SCRIPT).forEach((script) => script.remove());
});

describe('US-16 Google sign-in button', () => {
  it('initialises Google Identity Services for the university domain and renders the button', async () => {
    const googleId = mockGoogle();

    render(<GoogleSignInButton clientId="client-1" allowedEmailDomain="ku.th" onCredential={vi.fn()} />);

    await waitFor(() => expect(googleId.renderButton).toHaveBeenCalledOnce());
    expect(googleId.initialize).toHaveBeenCalledWith(expect.objectContaining({
      client_id: 'client-1',
      hd: 'ku.th',
    }));
    expect(googleId.renderButton.mock.calls[0][0]).toBe(screen.getByTestId('google-sign-in-button'));
  });

  it('passes the returned ID token to the sign-in handler', async () => {
    const googleId = mockGoogle();
    const onCredential = vi.fn();
    render(<GoogleSignInButton clientId="client-1" allowedEmailDomain="ku.th" onCredential={onCredential} />);
    await waitFor(() => expect(googleId.initialize).toHaveBeenCalledOnce());

    googleId.initialize.mock.calls[0][0].callback({ credential: 'id-token' });

    expect(onCredential).toHaveBeenCalledWith('id-token');
  });

  it('loads the Google script once and renders the button after it loads', async () => {
    render(<GoogleSignInButton clientId="client-1" allowedEmailDomain="ku.th" onCredential={vi.fn()} />);

    const script = document.querySelector(SCRIPT);
    expect(script).not.toBeNull();
    const googleId = mockGoogle();
    script.dispatchEvent(new Event('load'));

    await waitFor(() => expect(googleId.renderButton).toHaveBeenCalledOnce());
    expect(document.querySelectorAll(SCRIPT)).toHaveLength(1);
  });

  it('shows an error when the Google script cannot be loaded', async () => {
    render(<GoogleSignInButton clientId="client-1" allowedEmailDomain="ku.th" onCredential={vi.fn()} />);

    document.querySelector(SCRIPT).dispatchEvent(new Event('error'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Google sign-in could not be loaded.');
  });
});
