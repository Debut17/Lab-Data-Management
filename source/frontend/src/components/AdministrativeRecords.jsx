import { useEffect, useState } from 'react';

const TABS = {
  resources: 'Resources',
  bookings: 'Bookings',
  users: 'User Roles',
  audit: 'Audit Log',
};

const BOOKING_STATUSES = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
const STATUS_LABELS = {
  ALL: 'All',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};
const ROLE_LABELS = {
  SYSTEM_ADMIN: 'System Administrator',
  LAB_STAFF: 'Lab Staff',
  LAB_MEMBER: 'Lab Member',
};

function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function humanise(value) {
  const text = value.replaceAll('_', ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function SummaryCard({ title, value, details }) {
  return (
    <div className="records-card">
      <span className="records-card-title">{title}</span>
      <strong>{value}</strong>
      <span className="records-card-details">{details}</span>
    </div>
  );
}

function useRecords(load, deps) {
  const [state, setState] = useState({ data: null, error: '', isLoading: true });

  useEffect(() => {
    let isCurrent = true;
    setState((current) => ({ ...current, error: '', isLoading: true }));
    load()
      .then((data) => {
        if (isCurrent) setState({ data, error: '', isLoading: false });
      })
      .catch((error) => {
        if (isCurrent) {
          setState({
            data: null,
            error: error instanceof Error ? error.message : 'Records could not be loaded.',
            isLoading: false,
          });
        }
      });
    return () => {
      isCurrent = false;
    };
  }, deps);

  return state;
}

function LoadState({ state, label }) {
  if (state.isLoading) {
    return <div className="message info-message" role="status">Loading {label}…</div>;
  }
  if (state.error) {
    return <div className="message error-message" role="alert">{state.error}</div>;
  }
  return null;
}

export default function AdministrativeRecords({
  loadSummary,
  loadResources,
  loadBookings,
  loadUsers,
  loadAuditLogs,
  onOpenHistory,
}) {
  const [tab, setTab] = useState('resources');
  const [bookingStatus, setBookingStatus] = useState('ALL');
  const [refreshKey, setRefreshKey] = useState(0);

  const summary = useRecords(loadSummary, [loadSummary, refreshKey]);
  const tabRecords = useRecords(() => {
    if (tab === 'resources') return loadResources();
    if (tab === 'bookings') return loadBookings(bookingStatus);
    if (tab === 'users') return loadUsers();
    return loadAuditLogs(1, 10);
  }, [tab, bookingStatus, refreshKey]);

  const counts = summary.data;
  const issueReports = counts?.issueReports;

  return (
    <section className="form-card administrative-records" aria-label="Administrative Records">
      <div className="section-heading">
        <div>
          <p className="eyebrow">US-17 · System administrator</p>
          {/* The page heading is already shown in the top bar. */}
          <p>An overview of lab resources, bookings, issue reports, user roles, and audit logs in one place.</p>
        </div>
        <button
          className="button secondary-button"
          type="button"
          disabled={summary.isLoading || tabRecords.isLoading}
          onClick={() => setRefreshKey((key) => key + 1)}
        >
          Refresh
        </button>
      </div>

      <LoadState state={summary} label="record summary" />
      {counts && (
        <div className="records-summary" aria-label="Record summary">
          <SummaryCard
            title="Resources"
            value={counts.resources.total}
            details={`${counts.resources.active} active · ${counts.resources.archived} archived · ${counts.resources.unavailable} unavailable`}
          />
          <SummaryCard
            title="Bookings"
            value={counts.bookings.total}
            details={`${counts.bookings.byStatus.PENDING} pending · ${counts.bookings.byStatus.APPROVED} approved`}
          />
          <SummaryCard
            title="Issue reports"
            value={issueReports ? issueReports.total : '—'}
            details={issueReports
              ? `${issueReports.byStatus.PENDING ?? 0} pending`
              : 'Available once issue reporting (US-7) is installed'}
          />
          <SummaryCard
            title="Active users"
            value={counts.users.total}
            details={`${counts.users.byRole.SYSTEM_ADMIN} admin · ${counts.users.byRole.LAB_STAFF} staff · ${counts.users.byRole.LAB_MEMBER} member${counts.users.byRole.LAB_MEMBER === 1 ? '' : 's'}`}
          />
          <SummaryCard
            title="Audit entries"
            value={counts.auditLogs.total}
            details={`${counts.auditLogs.lastSevenDays} in the last 7 days`}
          />
        </div>
      )}

      <div className="status-filters records-tabs" role="tablist" aria-label="Record type">
        {Object.entries(TABS).map(([value, label]) => (
          <button
            key={value}
            className={tab === value ? 'active' : ''}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'bookings' && (
        <label className="field records-filter">
          <span>Booking status</span>
          <select value={bookingStatus} onChange={(event) => setBookingStatus(event.target.value)}>
            {BOOKING_STATUSES.map((status) => (
              <option key={status} value={status}>{STATUS_LABELS[status]}</option>
            ))}
          </select>
        </label>
      )}

      <div role="tabpanel" aria-label={TABS[tab]}>
        <LoadState state={tabRecords} label={TABS[tab].toLowerCase()} />
        {!tabRecords.isLoading && !tabRecords.error && tabRecords.data && (
          <RecordTable tab={tab} data={tabRecords.data} onOpenHistory={onOpenHistory} />
        )}
      </div>
    </section>
  );
}

function EmptyRow({ columns, text }) {
  return (
    <tr>
      <td colSpan={columns} className="records-empty">{text}</td>
    </tr>
  );
}

function RecordTable({ tab, data, onOpenHistory }) {
  if (tab === 'resources') {
    const resources = data.resources ?? [];
    return (
      <div className="records-table-wrap">
        <table className="records-table">
          <thead>
            <tr><th>Name</th><th>Category</th><th>Location</th><th>Availability</th><th>Status</th><th>Record</th></tr>
          </thead>
          <tbody>
            {resources.length === 0 && <EmptyRow columns={6} text="No resources yet." />}
            {resources.map((resource) => (
              <tr key={resource.id}>
                <td>{resource.name}</td>
                <td>{resource.category}</td>
                <td>{resource.location}</td>
                <td>{humanise(resource.availabilityStatus)}</td>
                <td>{humanise(resource.currentStatus)}</td>
                <td>{resource.archived ? 'Archived' : 'Active'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (tab === 'bookings') {
    const bookings = data.bookings ?? [];
    return (
      <div className="records-table-wrap">
        <table className="records-table">
          <thead>
            <tr><th>Resource</th><th>Requester</th><th>Period</th><th>Status</th><th>Reviewed</th></tr>
          </thead>
          <tbody>
            {bookings.length === 0 && <EmptyRow columns={5} text="No bookings match this status." />}
            {bookings.map((booking) => (
              <tr key={booking.id}>
                <td>
                  {booking.resourceName}
                  {booking.resourceArchived && <span className="records-note"> (archived)</span>}
                </td>
                <td>{booking.requesterName}<span className="records-note">{booking.requesterEmail}</span></td>
                <td>{formatDateTime(booking.startTime)} – {formatDateTime(booking.endTime)}</td>
                <td>
                  {STATUS_LABELS[booking.status] ?? booking.status}
                  {booking.rejectionReason && <span className="records-note">{booking.rejectionReason}</span>}
                </td>
                <td>
                  {booking.reviewedAt
                    ? <>{booking.reviewerName}<span className="records-note">{formatDateTime(booking.reviewedAt)}</span></>
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (tab === 'users') {
    const users = data.users ?? [];
    return (
      <div className="records-table-wrap">
        <table className="records-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Account</th></tr>
          </thead>
          <tbody>
            {users.length === 0 && <EmptyRow columns={4} text="No users found." />}
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.displayName}</td>
                <td>{user.email}</td>
                <td>{ROLE_LABELS[user.role] ?? user.role}</td>
                <td>{user.isActive === false ? 'Inactive' : 'Active'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const auditLogs = data.auditLogs ?? [];
  return (
    <>
      <div className="records-table-wrap">
        <table className="records-table">
          <thead>
            <tr><th>When</th><th>Who</th><th>Action</th><th>Record</th></tr>
          </thead>
          <tbody>
            {auditLogs.length === 0 && <EmptyRow columns={4} text="No audit entries yet." />}
            {auditLogs.map((entry) => (
              <tr key={entry.id}>
                <td>{formatDateTime(entry.createdAt)}</td>
                <td>{entry.actorName}</td>
                <td>{humanise(entry.action)}</td>
                <td>{humanise(entry.entityType)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-actions">
        <button className="button secondary-button" type="button" onClick={onOpenHistory}>
          Open full Change History
        </button>
      </div>
    </>
  );
}
