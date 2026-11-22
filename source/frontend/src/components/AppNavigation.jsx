const ROLE_NAVIGATION = Object.freeze({
  SYSTEM_ADMIN: Object.freeze([
    { view: 'resources', label: 'Create Resource', title: 'Resource Administration' },
    { view: 'edit', label: 'Edit Resources', title: 'Edit Resources' },
    { view: 'availability', label: 'Resource Availability', title: 'Resource Availability' },
    { view: 'archive', label: 'Archive Resources', title: 'Resource Archive' },
    { view: 'bookings', label: 'Booking Requests', title: 'Booking Administration' },
    { view: 'users', label: 'User Roles', title: 'User Administration' },
    { view: 'history', label: 'Change History', title: 'Change History' },
    { view: 'problem-notifications', label: 'Problem Notifications', title: 'Resource Problem Notifications' },
    { view: 'issue-reports', label: 'Issue Reports', title: 'Issue Reports' },
    { view: 'records', label: 'Administrative Records', title: 'Administrative Records' },
  ]),
  LAB_MEMBER: Object.freeze([
    { view: 'lab-resources', label: 'Lab Resources', title: 'Lab Resources' },
    { view: 'resources', label: 'Request Booking', title: 'Resource Booking' },
    { view: 'my-bookings', label: 'My Bookings', title: 'My Bookings' },
  ]),
});

const ROLE_NAVIGATION_LABELS = Object.freeze({
  SYSTEM_ADMIN: 'Administrator navigation',
  LAB_MEMBER: 'Member navigation',
});

export function hasAppNavigation(role) {
  return Boolean(ROLE_NAVIGATION[role]);
}

export function getPageTitle(role, activeView) {
  if (role === 'LAB_STAFF') {
    return 'Lab Operations';
  }

  const items = ROLE_NAVIGATION[role];
  return items?.find(({ view }) => view === activeView)?.title
    ?? items?.[0]?.title
    ?? 'Resource Booking';
}

export default function AppNavigation({
  role,
  activeView,
  isOpen,
  onToggle,
  onOpenView,
  onDismiss,
}) {
  const items = ROLE_NAVIGATION[role];
  if (!items) {
    return null;
  }

  const navigationId = `${role.toLowerCase().replace('_', '-')}-navigation`;

  return (
    <>
      <aside
        className="app-sidebar"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onDismiss();
          }
        }}
      >
        <div className="sidebar-brand">
          <button
            className="menu-button sidebar-toggle"
            type="button"
            aria-label={isOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={isOpen}
            aria-controls={navigationId}
            onClick={onToggle}
          >
            <span aria-hidden="true">☰</span>
          </button>

          <p className="eyebrow light sidebar-label">Lab Data Management</p>
        </div>

        <nav
          className="admin-navigation"
          id={navigationId}
          aria-label={ROLE_NAVIGATION_LABELS[role]}
        >
          {items.map(({ view, label }) => (
            <button
              key={view}
              className={activeView === view ? 'active' : ''}
              type="button"
              onClick={() => onOpenView(view)}
            >
              {label}
            </button>
          ))}
        </nav>
      </aside>

      {isOpen && (
        <button
          className="navigation-backdrop"
          type="button"
          aria-label="Dismiss navigation"
          onClick={onDismiss}
        />
      )}
    </>
  );
}
