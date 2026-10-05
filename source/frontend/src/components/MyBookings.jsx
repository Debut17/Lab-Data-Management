import { useCallback, useEffect, useState } from 'react';

export const BOOKING_STATUS_LABELS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

const STATUS_FILTERS = ['ALL', ...Object.keys(BOOKING_STATUS_LABELS)];

function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function MyBookings({ loadBookings }) {
  const [bookings, setBookings] = useState([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async (isCurrent = () => true) => {
    setIsLoading(true);
    setLoadError('');
    try {
      const result = await loadBookings();
      if (isCurrent()) setBookings(result.bookings ?? []);
    } catch (error) {
      if (isCurrent()) {
        setLoadError(error instanceof Error ? error.message : 'Your bookings could not be loaded.');
      }
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [loadBookings]);

  useEffect(() => {
    let current = true;
    refresh(() => current);
    return () => {
      current = false;
    };
  }, [refresh]);

  const counts = bookings.reduce(
    (totals, booking) => ({ ...totals, [booking.status]: (totals[booking.status] ?? 0) + 1 }),
    { ALL: bookings.length },
  );
  const visibleBookings = statusFilter === 'ALL'
    ? bookings
    : bookings.filter((booking) => booking.status === statusFilter);

  return (
    <section className="form-card my-bookings" aria-labelledby="my-bookings-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Resource booking</p>
          <h2 id="my-bookings-title">My Bookings &amp; Requests</h2>
          <p>Track the status of every resource booking you have requested.</p>
        </div>
        <button
          className="button secondary-button"
          type="button"
          disabled={isLoading}
          onClick={() => refresh()}
        >
          Refresh
        </button>
      </div>

      <div className="status-filters" role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((status) => {
          const label = status === 'ALL' ? 'All' : BOOKING_STATUS_LABELS[status];
          const count = counts[status] ?? 0;
          return (
            <button
              key={status}
              className={statusFilter === status ? 'active' : ''}
              type="button"
              aria-label={`${label} (${count})`}
              aria-pressed={statusFilter === status}
              onClick={() => setStatusFilter(status)}
            >
              {label}
              <span className="filter-count" aria-hidden="true">{count}</span>
            </button>
          );
        })}
      </div>

      {isLoading && <div className="message info-message" role="status">Loading your bookings…</div>}
      {loadError && <div className="message error-message" role="alert">{loadError}</div>}

      {!isLoading && !loadError && visibleBookings.length === 0 && (
        <div className="empty-bookings">
          <strong>
            {bookings.length === 0
              ? 'You have no bookings yet'
              : `No ${BOOKING_STATUS_LABELS[statusFilter].toLowerCase()} bookings`}
          </strong>
          <span>Requests you submit will appear here with their current status.</span>
        </div>
      )}

      <div className="booking-list">
        {visibleBookings.map((booking) => {
          const titleId = `my-booking-${booking.id}-title`;
          return (
            <article className="booking-card" key={booking.id} aria-labelledby={titleId}>
              <div className="booking-card-heading">
                <div>
                  <span className={`status-badge status-${booking.status.toLowerCase()}`}>
                    {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
                  </span>
                  <h3 id={titleId}>{booking.resourceName}</h3>
                </div>
                <span className="request-time">Requested {formatDateTime(booking.createdAt)}</span>
              </div>
              <dl className="booking-details">
                <div>
                  <dt>Start</dt>
                  <dd>{formatDateTime(booking.startTime)}</dd>
                </div>
                <div>
                  <dt>End</dt>
                  <dd>{formatDateTime(booking.endTime)}</dd>
                </div>
                <div>
                  <dt>Reviewed</dt>
                  <dd>
                    {booking.reviewedAt
                      ? formatDateTime(booking.reviewedAt)
                      : booking.status === 'PENDING' ? 'Awaiting review' : 'Not reviewed'}
                  </dd>
                </div>
              </dl>
              {booking.status === 'REJECTED' && booking.rejectionReason && (
                <p className="rejection-reason">
                  <strong>Reason:</strong> {booking.rejectionReason}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
