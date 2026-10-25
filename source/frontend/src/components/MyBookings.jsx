import { useCallback, useEffect, useRef, useState } from 'react';

export const BOOKING_STATUS_LABELS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

const STATUS_FILTERS = ['ALL', ...Object.keys(BOOKING_STATUS_LABELS)];

function formatDateTime(value) {
  if (!value) return 'Not available';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Invalid date';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function MyBookings({
  onLoadBookings,
  onCancel,
  refreshKey = 0,
}) {
  const [bookings, setBookings] = useState([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [cancellingId, setCancellingId] = useState(null);

  const requestId = useRef(0);
  const mounted = useRef(false);
  const cancelling = useRef(false);

  const loadBookings = useCallback(async () => {
    const currentRequest = ++requestId.current;

    setIsLoading(true);
    setError('');

    try {
      const result = await onLoadBookings();

      if (!mounted.current || currentRequest !== requestId.current) {
        return;
      }

      const bookingList = Array.isArray(result)
        ? result
        : Array.isArray(result?.bookings)
          ? result.bookings
          : [];

      setBookings(bookingList);
    } catch (loadError) {
      if (mounted.current && currentRequest === requestId.current) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Bookings could not be loaded.'
        );
      }
    } finally {
      if (mounted.current && currentRequest === requestId.current) {
        setIsLoading(false);
      }
    }
  }, [onLoadBookings]);

  useEffect(() => {
    mounted.current = true;

    loadBookings();

    return () => {
      mounted.current = false;
      requestId.current++;
    };
  }, [loadBookings, refreshKey]);

  async function handleCancel(id) {
    if (cancelling.current) return;

    const confirmed = window.confirm(
      'Are you sure you want to cancel this booking?'
    );

    if (!confirmed) return;

    cancelling.current = true;

    setError('');
    setSuccess('');
    setCancellingId(id);

    try {
      await onCancel(id);

      if (!mounted.current) return;

      setBookings((previous) =>
        previous.map((booking) =>
          booking.id === id
            ? {
                ...booking,
                status: 'CANCELLED',
              }
            : booking
        )
      );

      setSuccess('Booking cancelled successfully.');

      await loadBookings();
    } catch (cancelError) {
      if (mounted.current) {
        setError(
          cancelError instanceof Error
            ? cancelError.message
            : 'Booking could not be cancelled.'
        );
      }
    } finally {
      cancelling.current = false;

      if (mounted.current) {
        setCancellingId(null);
      }
    }
  }

  const counts = bookings.reduce(
    (totals, booking) => ({
      ...totals,
      [booking.status]: (totals[booking.status] ?? 0) + 1,
    }),
    { ALL: bookings.length }
  );

  const visibleBookings =
    statusFilter === 'ALL'
      ? bookings
      : bookings.filter(
          (booking) => booking.status === statusFilter
        );

  return (
    <section
      className="form-card my-bookings"
      aria-labelledby="my-bookings-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Lab member</p>

          <h2 id="my-bookings-title">
            My Booking Requests
          </h2>

          <p>
            Track the status of your requests. Pending requests
            can be cancelled before they are reviewed.
          </p>
        </div>

        <button
          className="button secondary-button"
          type="button"
          disabled={isLoading || cancellingId !== null}
          onClick={loadBookings}
        >
          Refresh
        </button>
      </div>

      <div
        className="status-filters"
        role="group"
        aria-label="Filter by status"
      >
        {STATUS_FILTERS.map((status) => {
          const label =
            status === 'ALL'
              ? 'All'
              : BOOKING_STATUS_LABELS[status];

          const count = counts[status] ?? 0;

          return (
            <button
              key={status}
              className={
                statusFilter === status ? 'active' : ''
              }
              type="button"
              aria-label={`${label} (${count})`}
              aria-pressed={statusFilter === status}
              onClick={() => setStatusFilter(status)}
            >
              {label}

              <span
                className="filter-count"
                aria-hidden="true"
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {isLoading && (
        <div
          className="message info-message"
          role="status"
        >
          Loading your bookings…
        </div>
      )}

      {error && (
        <div
          className="message error-message"
          role="alert"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          className="message success-message"
          role="status"
        >
          {success}
        </div>
      )}

      {!isLoading && visibleBookings.length === 0 && (
        <div className="empty-bookings">
          <strong>
            {bookings.length === 0
              ? 'You have no booking requests.'
              : `No ${
                  BOOKING_STATUS_LABELS[statusFilter]?.toLowerCase() ??
                  'matching'
                } bookings`}
          </strong>

          <span>
            Requests you submit will appear here with their
            current status.
          </span>
        </div>
      )}

      {!isLoading && (
        <div className="booking-list">
          {visibleBookings.map((booking) => {
            const titleId = `my-booking-${booking.id}-title`;
            const isCancelling = cancellingId === booking.id;
            const canCancel = booking.status === 'PENDING';

            return (
              <article
                className="booking-card"
                key={booking.id}
                aria-labelledby={titleId}
              >
                <div className="booking-card-heading">
                  <div>
                    <span
                      className={`status-badge status-${String(
                        booking.status ?? ''
                      ).toLowerCase()}`}
                    >
                      {BOOKING_STATUS_LABELS[booking.status] ??
                        booking.status}
                    </span>

                    <h3 id={titleId}>
                      {booking.resourceName}
                    </h3>
                  </div>

                  {booking.createdAt && (
                    <span className="request-time">
                      Requested{' '}
                      {formatDateTime(booking.createdAt)}
                    </span>
                  )}
                </div>

                <dl className="booking-details">
                  <div>
                    <dt>Start</dt>

                    <dd>
                      {formatDateTime(booking.startTime)}
                    </dd>
                  </div>

                  <div>
                    <dt>End</dt>

                    <dd>
                      {formatDateTime(booking.endTime)}
                    </dd>
                  </div>

                  <div>
                    <dt>Reviewed</dt>

                    <dd>
                      {booking.reviewedAt
                        ? formatDateTime(booking.reviewedAt)
                        : booking.status === 'PENDING'
                          ? 'Awaiting review'
                          : 'Not reviewed'}
                    </dd>
                  </div>
                </dl>

                {booking.status === 'REJECTED' &&
                  booking.rejectionReason && (
                    <p className="rejection-reason">
                      <strong>Reason:</strong>{' '}
                      {booking.rejectionReason}
                    </p>
                  )}

                {canCancel && (
                  <div className="booking-actions">
                    <button
                      className="button decline-button"
                      type="button"
                      disabled={cancellingId !== null || isLoading}
                      onClick={() => handleCancel(booking.id)}
                    >
                      {isCancelling
                        ? 'Cancelling…'
                        : 'Cancel Booking'}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}