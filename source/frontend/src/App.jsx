import { useEffect, useState } from 'react';

import ResourceForm from './components/ResourceForm.jsx';
import { createResource, devLogin, getSession, logout } from './services/api.js';
import './styles.css';

export default function App() {
  const [user, setUser] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    getSession()
      .then(({ user: sessionUser }) => setUser(sessionUser))
      .catch(() => setUser(null))
      .finally(() => setIsCheckingSession(false));
  }, []);

  async function handleLogin(email) {
    setLoginError('');
    try {
      const result = await devLogin(email);
      setUser(result.user);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Sign in failed.');
    }
  }

  async function handleLogout() {
    await logout();
    setUser(null);
  }

  if (isCheckingSession) {
    return <main className="centered-state">Checking session…</main>;
  }

  if (!user) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand-mark" aria-hidden="true">LD</div>
          <p className="eyebrow">Lab Data Management</p>
          <h1>Local review sign in</h1>
          <p>
            Demo authentication is available only when the backend explicitly enables local review mode.
          </p>
          {loginError && <div role="alert" className="message error-message">{loginError}</div>}
          <div className="login-actions">
            <button
              className="button primary-button"
              type="button"
              onClick={() => handleLogin('admin@local.test')}
            >
              Sign in as System Administrator
            </button>
            <button
              className="button secondary-button"
              type="button"
              onClick={() => handleLogin('member@local.test')}
            >
              Sign in as Lab Member
            </button>
          </div>
        </section>
      </main>
    );
  }

  const isAdministrator = user.role === 'SYSTEM_ADMIN';

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow light">Lab Data Management</p>
          <h1>Resource Administration</h1>
        </div>
        <div className="user-panel">
          <div>
            <strong>{user.displayName}</strong>
            <span>{isAdministrator ? 'System Administrator' : 'Lab Member'}</span>
          </div>
          <button className="text-button" type="button" onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      <main className="content">
        {isAdministrator ? (
          <ResourceForm onCreate={createResource} />
        ) : (
          <section className="form-card access-denied">
            <p className="eyebrow">Access restricted</p>
            <h2>System Administrator access is required</h2>
            <p>This account cannot create resource records.</p>
          </section>
        )}
      </main>
    </div>
  );
}
