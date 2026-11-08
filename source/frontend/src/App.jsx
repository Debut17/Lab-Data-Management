import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import BookingForm from './components/BookingForm.jsx';
import AuditHistory from './components/AuditHistory.jsx';
import BookingReview from './components/BookingReview.jsx';
import MyBookings from './components/MyBookings.jsx';
import ResourceForm from './components/ResourceForm.jsx';
import ResourceEditor from './components/ResourceEditor.jsx';
import RoleManagement, { ROLE_LABELS } from './components/RoleManagement.jsx';
import ResourceArchive from './components/ResourceArchive.jsx';
import ResourceAvailability from './components/ResourceAvailability.jsx';
// US-7: Load staff reporting and administrator notification screens.
import ResourceProblemForm from './components/ResourceProblemForm.jsx';
import AdminNotifications from './components/AdminNotifications.jsx';
import {
  createResourceReport,
  getResourceReportNotifications,
  markResourceReportNotificationRead,
} from './services/api.js';
// US-7: Load staff reporting and administrator notification screens.

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
  // Left NavBar: align the hamburger area with the actual top-bar height.
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
    // US-7: Label the administrator resource problem notification page.
    'problem-notifications': 'Resource Problem Notifications',
    // US-7: Label the administrator resource problem notification page.
  };

  const pageTitle = isAdministrator
    ? administratorTitles[activeView] ?? administratorTitles.resources
    : isLabStaff
      ? 'Lab Operations'
      : activeView === 'my-bookings'
        ? 'My Bookings'
        : 'Resource Booking';

  // Left NavBar
  return (
    <div
      ref={appShellRef}
      className={`app-shell${hasNavigation ? ' has-navigation' : ''}${hasNavigation && isNavigationOpen ? ' navigation-open' : ''}`}
    >
      <header className="topbar" ref={topbarRef}>
        <div>
          {/* Left NavBar */}
          {!hasNavigation && (
            <p className="eyebrow light">
              Lab Data Management
            </p>
          )}

          <h1>{pageTitle}</h1>
        </div>

        <div className="topbar-actions">
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

      {/* Left NavBar */}
      {hasNavigation && (
        <aside
          className="app-sidebar"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setIsNavigationOpen(false);
            }
          }}
        >
          <div className="sidebar-brand">
            {/* Hamburger button (hover one) Tanisorn */}
            <button
              className="menu-button sidebar-toggle"
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

            <p className="eyebrow light sidebar-label">
              Lab Data Management
            </p>
          </div>

          {isAdministrator && (
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

              {/* US-7: Let administrators open resource problem notifications. */}
              <button
                className={activeView === 'problem-notifications' ? 'active' : ''}
                type="button"
                onClick={() => openView('problem-notifications')}
              >
                Problem Notifications
              </button>
              {/* US-7: Let administrators open resource problem notifications. */}
            </nav>
          )}

          {isLabMember && (
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
        </aside>
      )}

      {/* Left NavBar */}
      {hasNavigation && isNavigationOpen && (
        <button
          className="navigation-backdrop"
          type="button"
          aria-label="Dismiss navigation"
          onClick={() => setIsNavigationOpen(false)}
        />
      )}

      <main className="content">
        {isAdministrator ? (
          /* US-7: Show the administrator's resource problem inbox. */
          activeView === 'problem-notifications' ? (
            <AdminNotifications
              key={user.id}
              onLoadNotifications={getResourceReportNotifications}
              onMarkRead={markResourceReportNotificationRead}
            />
          ) :
          /* US-7: Show the administrator's resource problem inbox. */
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
          // US-7: Replace the staff placeholder with resource problem submission.
          <ResourceProblemForm
            key={user.id}
            onLoadResources={listResources}
            onCreate={(report) => createResourceReport(report)}
            reporterName={user.displayName}
          />
          // US-7: Replace the staff placeholder with resource problem submission.
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
