import { useEffect, useState } from 'react';

import BookingForm from './components/BookingForm.jsx';
import AuditHistory from './components/AuditHistory.jsx';
import BookingReview from './components/BookingReview.jsx';
import MyBookings from './components/MyBookings.jsx';
import ResourceForm from './components/ResourceForm.jsx';
import ResourceEditor from './components/ResourceEditor.jsx';
import RoleManagement, { ROLE_LABELS } from './components/RoleManagement.jsx';
import ResourceArchive from './components/ResourceArchive.jsx';
import ResourceAvailability from './components/ResourceAvailability.jsx';

import {
  archiveResource,
  listAdminResources,
  updateResourceAvailability,
  updateResource,
  cancelBooking,
  createBooking,
  createResource,
  devLogin,
  extractResourceFromPdf,
  getMyBookings,
  getPendingBookings,
  getSession,
  getAuditLogs,
  listResources,
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
  const [bookingRefreshKey, setBookingRefreshKey] = useState(0);

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
      setLoginError(
        error instanceof Error ? error.message : 'Sign in failed.'
      );
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
    return (
      <main className="centered-state">
        Checking session…
      </main>
    );
  }

  if (!user) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand-mark" aria-hidden="true">
            LD
          </div>

          <p className="eyebrow">Lab Data Management</p>

          <h1>Local review sign in</h1>

          <p>
            Demo authentication is available only when the backend
            explicitly enables local review mode.
          </p>

          {loginError && (
            <div role="alert" className="message error-message">
              {loginError}
            </div>
          )}

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
  const isLabMember = user.role === 'LAB_MEMBER';

  const hasNavigation = isAdministrator || isLabMember;

  const navigationId = isAdministrator
    ? 'administrator-navigation'
    : 'member-navigation';

  const administratorTitles = {
    resources: 'Resource Administration',
    edit: 'Edit Resources',
    availability: 'Resource Availability',
    archive: 'Resource Archive',
    bookings: 'Booking Administration',
    users: 'User Administration',
    history: 'Change History',
  };

  const pageTitle = isAdministrator
    ? administratorTitles[activeView] ?? administratorTitles.resources
    : isLabStaff
      ? 'Lab Operations'
      : activeView === 'my-bookings'
        ? 'My Bookings'
        : 'Resource Booking';

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow light">
            Lab Data Management
          </p>

          <h1>{pageTitle}</h1>
        </div>

        <div className="topbar-actions">
          {hasNavigation && (
            <button
              className="menu-button"
              type="button"
              aria-label={
                isNavigationOpen
                  ? 'Close navigation'
                  : 'Open navigation'
              }
              aria-expanded={isNavigationOpen}
              aria-controls={navigationId}
              onClick={() =>
                setIsNavigationOpen((open) => !open)
              }
            >
              <span aria-hidden="true">☰</span>
            </button>
          )}

          <div className="user-panel">
            <div>
              <strong>{user.displayName}</strong>

              <span>
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
            </div>

            <button
              className="text-button"
              type="button"
              onClick={handleLogout}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {isAdministrator && isNavigationOpen && (
        <nav
          className="admin-navigation"
          id="administrator-navigation"
          aria-label="Administrator navigation"
        >
          <button
            className={activeView === 'resources' ? 'active' : ''}
            type="button"
            onClick={() => openView('resources')}
          >
            Create Resource
          </button>

          <button
            className={activeView === 'edit' ? 'active' : ''}
            type="button"
            onClick={() => openView('edit')}
          >
            Edit Resources
          </button>

          <button
            className={activeView === 'availability' ? 'active' : ''}
            type="button"
            onClick={() => openView('availability')}
          >
            Resource Availability
          </button>

          <button
            className={activeView === 'archive' ? 'active' : ''}
            type="button"
            onClick={() => openView('archive')}
          >
            Archive Resources
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

          <button
            className={activeView === 'history' ? 'active' : ''}
            type="button"
            onClick={() => openView('history')}
          >
            Change History
          </button>
        </nav>
      )}

      {isLabMember && isNavigationOpen && (
        <nav
          className="admin-navigation"
          id={navigationId}
          aria-label="Member navigation"
        >
          <button
            className={
              activeView !== 'my-bookings' ? 'active' : ''
            }
            type="button"
            onClick={() => openView('resources')}
          >
            Request Booking
          </button>

          <button
            className={
              activeView === 'my-bookings' ? 'active' : ''
            }
            type="button"
            onClick={() => openView('my-bookings')}
          >
            My Bookings
          </button>
        </nav>
      )}

      <main className="content">
        {isAdministrator ? (
          activeView === 'edit' ? (
            <ResourceEditor
              loadResources={listAdminResources}
              onUpdate={updateResource}
            />
          ) : activeView === 'availability' ? (
            <ResourceAvailability
              loadResources={listAdminResources}
              onUpdateAvailability={updateResourceAvailability}
            />
          ) : activeView === 'archive' ? (
            <ResourceArchive
              loadResources={listAdminResources}
              onArchive={archiveResource}
            />
          ) : activeView === 'users' ? (
            <RoleManagement
              currentUserId={user.id}
              loadUsers={listUsers}
              onUpdateRole={updateUserRole}
            />
          ) : activeView === 'history' ? (
            <AuditHistory
              loadAuditLogs={getAuditLogs}
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
          <section
            className="form-card access-denied"
            aria-labelledby="staff-title"
          >
            <p className="eyebrow">Lab Staff</p>

            <h2 id="staff-title">
              Issue reporting is not available yet
            </h2>

            <p>
              Resource problem reporting for Lab Staff is
              planned for a later iteration.
            </p>
          </section>
        ) : activeView === 'my-bookings' ? (
          <MyBookings
            onLoadBookings={getMyBookings}
            onCancel={cancelBooking}
            refreshKey={bookingRefreshKey}
          />
        ) : (
          <BookingForm
            onLoadResources={listResources}
            onCreate={createBooking}
            onCreated={() =>
              setBookingRefreshKey((key) => key + 1)
            }
          />
        )}
      </main>
    </div>
  );
}