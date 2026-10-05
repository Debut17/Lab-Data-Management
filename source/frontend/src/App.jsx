import { useEffect, useState } from 'react';

import BookingForm from './components/BookingForm.jsx';
import BookingReview from './components/BookingReview.jsx';
import ResourceForm from './components/ResourceForm.jsx';
import RoleManagement, { ROLE_LABELS } from './components/RoleManagement.jsx';
import {
  createBooking,
  createResource,
  devLogin,
  extractResourceFromPdf,
  getPendingBookings,
  getSession,
  listBookableResources,
  listUsers,
  logout,
  reviewBooking,
  updateUserRole,
} from './services/api.js';
import './styles.css';

export default function App() {
  const [user, setUser] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [activeView, setActiveView] = useState('resources');
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);

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
            <button
              className="button secondary-button"
              type="button"
              onClick={() => handleLogin('staff@local.test')}
            >
              Sign in as Lab Staff
            </button>
          </div>
        </section>
      </main>
    );
  }

  const isAdministrator = user.role === 'SYSTEM_ADMIN';
  const isLabStaff = user.role === 'LAB_STAFF';
  const administratorTitles = {
    resources: 'Resource Administration',
    bookings: 'Booking Administration',
    users: 'User Administration',
  };
  const pageTitle = isAdministrator
    ? administratorTitles[activeView] ?? administratorTitles.resources
    : isLabStaff ? 'Lab Operations' : 'Resource Booking';

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow light">Lab Data Management</p>
          <h1>{pageTitle}</h1>
        </div>
        <div className="topbar-actions">
          {isAdministrator && (
            <button
              className="menu-button"
              type="button"
              aria-label={isNavigationOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={isNavigationOpen}
              aria-controls="administrator-navigation"
              onClick={() => setIsNavigationOpen((open) => !open)}
            >
              <span aria-hidden="true">☰</span>
            </button>
          )}
          <div className="user-panel">
            <div>
              <strong>{user.displayName}</strong>
              <span>{ROLE_LABELS[user.role] ?? user.role}</span>
            </div>
            <button className="text-button" type="button" onClick={handleLogout}>Sign out</button>
          </div>
        </div>
      </header>

      {isAdministrator && isNavigationOpen && (
        <nav className="admin-navigation" id="administrator-navigation" aria-label="Administrator navigation">
          <button
            className={activeView === 'resources' ? 'active' : ''}
            type="button"
            onClick={() => openView('resources')}
          >
            Create Resource
          </button>
          <button
            className={activeView === 'bookings' ? 'active' : ''}
            type="button"
            onClick={() => openView('bookings')}
          >
            Booking Requests
          </button>
          <button
            className={activeView === 'users' ? 'active' : ''}
            type="button"
            onClick={() => openView('users')}
          >
            User Roles
          </button>
        </nav>
      )}

      <main className="content">
        {isAdministrator ? (
          activeView === 'users' ? (
            <RoleManagement
              currentUserId={user.id}
              loadUsers={listUsers}
              onUpdateRole={updateUserRole}
            />
          ) : activeView === 'bookings' ? (
            <BookingReview
              loadBookings={getPendingBookings}
              onReview={reviewBooking}
            />
          ) : (
            <ResourceForm
              onCreate={createResource}
              onExtract={extractResourceFromPdf}
            />
          )
        ) : isLabStaff ? (
          <section className="form-card access-denied" aria-labelledby="staff-title">
            <p className="eyebrow">Lab Staff</p>
            <h2 id="staff-title">Issue reporting is not available yet</h2>
            <p>Resource problem reporting for Lab Staff is planned for a later iteration.</p>
          </section>
        ) : (
          <BookingForm
            onLoadResources={listBookableResources}
            onCreate={createBooking}
          />
        )}
      </main>
    </div>
  );
}
