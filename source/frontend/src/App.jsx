import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import AppContent from './components/AppContent.jsx';
import AppNavigation, {
  getPageTitle,
  hasAppNavigation,
} from './components/AppNavigation.jsx';
import GoogleSignInButton from './components/GoogleSignInButton.jsx';
import { ROLE_LABELS } from './components/RoleManagement.jsx';
import {
  devLogin,
  getAuthConfig,
  getSession,
  googleLogin,
  logout,
} from './services/api.js';

import './styles.css';

export default function App() {
  const [user, setUser] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [authConfig, setAuthConfig] = useState(null);
  const [activeView, setActiveView] = useState('resources');
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const appShellRef = useRef(null);
  const topbarRef = useRef(null);

  useLayoutEffect(() => {
    const shell = appShellRef.current;
    const topbar = topbarRef.current;
    if (!shell || !topbar) return;

    const syncHeaderHeight = () => {
      shell.style.setProperty('--app-header-height', `${topbar.getBoundingClientRect().height}px`);
    };

    syncHeaderHeight();
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(syncHeaderHeight);
    observer.observe(topbar);
    return () => observer.disconnect();
  }, [user, isCheckingSession]);

  useEffect(() => {
    getSession()
      .then(({ user: sessionUser }) => {
        setUser(sessionUser);
        setActiveView(sessionUser?.role === 'LAB_MEMBER' ? 'lab-resources' : 'resources');
      })
      .catch(() => setUser(null))
      .finally(() => setIsCheckingSession(false));

    getAuthConfig()
      .then(setAuthConfig)
      .catch(() => setAuthConfig({ googleClientId: null, devLoginEnabled: false }));
  }, []);

  async function signIn(login) {
    setLoginError('');

    try {
      const result = await login();
      setUser(result.user);
      setActiveView(result.user.role === 'LAB_MEMBER' ? 'lab-resources' : 'resources');
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Sign in failed.');
    }
  }

  function handleLogin(email) {
    return signIn(() => devLogin(email));
  }

  function handleGoogleCredential(credential) {
    return signIn(() => googleLogin(credential));
  }

  async function handleLogout() {
    await logout();
    setUser(null);
    setActiveView('resources');
    setIsNavigationOpen(false);
  }

  function openView(view) {
    setActiveView(view);
    setIsNavigationOpen(false);
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
          <h1>Sign in</h1>

          {authConfig?.googleClientId ? (
            <>
              <p>
                Use your @{authConfig.allowedEmailDomain} Google account. First-time
                users start as Lab Members; an administrator can change your role.
              </p>
              <GoogleSignInButton
                clientId={authConfig.googleClientId}
                allowedEmailDomain={authConfig.allowedEmailDomain}
                onCredential={handleGoogleCredential}
              />
            </>
          ) : authConfig && !authConfig.devLoginEnabled ? (
            <p>Sign-in is not available right now. Contact a system administrator.</p>
          ) : null}

          {loginError && (
            <div role="alert" className="message error-message">{loginError}</div>
          )}

          {authConfig?.devLoginEnabled && (
            <>
              <h2 className="login-section-title">Local review sign in</h2>
              <p>
                Demo authentication is available only when the backend explicitly
                enables local review mode.
              </p>
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
                <button
                  className="button secondary-button"
                  type="button"
                  onClick={() => handleLogin('staff@local.test')}
                >
                  Sign in as Lab Staff
                </button>
              </div>
            </>
          )}
        </section>
      </main>
    );
  }

  const hasNavigation = hasAppNavigation(user.role);
  const pageTitle = getPageTitle(user.role, activeView);

  return (
    <div
      ref={appShellRef}
      className={`app-shell${hasNavigation ? ' has-navigation' : ''}${hasNavigation && isNavigationOpen ? ' navigation-open' : ''}`}
    >
      <header className="topbar" ref={topbarRef}>
        <div>
          {!hasNavigation && <p className="eyebrow light">Lab Data Management</p>}
          <h1>{pageTitle}</h1>
        </div>

        <div className="topbar-actions">
          <div className="user-panel">
            <div>
              <strong>{user.displayName}</strong>
              <span>{ROLE_LABELS[user.role] ?? user.role}</span>
            </div>
            <button className="text-button" type="button" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <AppNavigation
        role={user.role}
        activeView={activeView}
        isOpen={isNavigationOpen}
        onToggle={() => setIsNavigationOpen((open) => !open)}
        onOpenView={openView}
        onDismiss={() => setIsNavigationOpen(false)}
      />

      <main className="content">
        <AppContent user={user} activeView={activeView} onOpenView={openView} />
      </main>
    </div>
  );
}
