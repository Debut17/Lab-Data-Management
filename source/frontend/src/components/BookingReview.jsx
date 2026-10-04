import { useEffect, useState } from 'react';

function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function BookingReview({ loadBookings, onReview }) {
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [activeDecision, setActiveDecision] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError('');

    loadBookings()
      .then((result) => {
        if (isCurrent) setBookings(result.bookings ?? []);
      })
      .catch((error) => {
        if (isCurrent) {
          setLoadError(error instanceof Error
            ? error.message
            : 'Pending booking requests could not be loaded.');
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [loadBookings]);

  function openDecision(booking, decision) {
    setActiveDecision({ bookingId: booking.id, resourceName: booking.resourceName, decision });
    setRejectionReason('');
    setDecisionError('');
    setSuccessMessage('');
  }

  function closeDecision() {
    if (isSubmitting) return;
    setActiveDecision(null);
    setRejectionReason('');
    setDecisionError('');
  }

  async function submitDecision(event) {
    event.preventDefault();
    if (!activeDecision) return;

    const trimmedReason = rejectionReason.trim();
    const payload = activeDecision.decision === 'APPROVE'
      ? { decision: 'APPROVE' }
      : { decision: 'REJECT', reason: trimmedReason };

    setIsSubmitting(true);
    setDecisionError('');
    try {
      const updated = await onReview(activeDecision.bookingId, payload);
      setBookings((current) => current.filter(
        (booking) => booking.id !== activeDecision.bookingId,
      ));
      const decisionLabel = updated.status === 'REJECTED' ? 'declined' : 'approved';
      setSuccessMessage(`${activeDecision.resourceName} was ${decisionLabel}.`);
      setActiveDecision(null);
      setRejectionReason('');
    } catch (error) {
      setDecisionError(error instanceof Error
        ? error.message
        : 'The booking decision could not be saved.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="form-card booking-review" aria-labelledby="booking-review-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Booking administration</p>
          <h2 id="booking-review-title">Pending Booking Requests</h2>
          <p>Review each requested resource and time period before making a decision.</p>
        </div>
        <span className="manual-badge">Administrator only</span>
      </div>

      {isLoading && <div className="message info-message" role="status">Loading pending booking requests…</div>}
      {loadError && <div className="message error-message" role="alert">{loadError}</div>}
      {successMessage && <div className="message success-message" role="status">{successMessage}</div>}

      {!isLoading && !loadError && bookings.length === 0 && (
        <div className="empty-bookings">
          <strong>No pending booking requests</strong>
          <span>New valid requests will appear here for administrator review.</span>
        </div>
      )}

      <div className="booking-list">
        {bookings.map((booking) => (
          <article className="booking-card" key={booking.id}>
            <div className="booking-card-heading">
              <div>
                <span className="status-badge">Pending</span>
                <h3>{booking.resourceName}</h3>
              </div>
              <span className="request-time">Requested {formatDateTime(booking.createdAt)}</span>
            </div>
            <dl className="booking-details">
              <div>
                <dt>Requester</dt>
                <dd>{booking.requesterName}</dd>
                <dd className="secondary-detail">{booking.requesterEmail}</dd>
              </div>
              <div>
                <dt>Start</dt>
                <dd>{formatDateTime(booking.startTime)}</dd>
              </div>
              <div>
                <dt>End</dt>
                <dd>{formatDateTime(booking.endTime)}</dd>
              </div>
            </dl>
            <div className="booking-actions">
              <button
                className="button danger-button"
                type="button"
                aria-label={`Decline ${booking.resourceName}`}
                onClick={() => openDecision(booking, 'REJECT')}
              >
                Decline
              </button>
              <button
                className="button primary-button"
                type="button"
                aria-label={`Approve ${booking.resourceName}`}
                onClick={() => openDecision(booking, 'APPROVE')}
              >
                Approve
              </button>
            </div>
          </article>
        ))}
      </div>

      {activeDecision && (
        <form className="decision-panel" onSubmit={submitDecision}>
          <div>
            <p className="eyebrow">Confirm decision</p>
            <h3>
              {activeDecision.decision === 'APPROVE'
                ? 'Approve Booking Request'
                : 'Decline Booking Request'}
            </h3>
            <p>
              {activeDecision.decision === 'APPROVE'
                ? `The requested period for ${activeDecision.resourceName} will be reserved after a final conflict check.`
                : `Explain why the request for ${activeDecision.resourceName} is unsuitable.`}
            </p>
          </div>

          {activeDecision.decision === 'REJECT' && (
            <label className="field">
              <span>Administrator comment <em aria-hidden="true">*</em></span>
              <textarea
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                maxLength="1000"
                rows="4"
                required
              />
            </label>
          )}

          {decisionError && <div className="message error-message" role="alert">{decisionError}</div>}

          <div className="form-actions">
            <button
              className="button secondary-button"
              type="button"
              disabled={isSubmitting}
              onClick={closeDecision}
            >
              Cancel
            </button>
            <button
              className={activeDecision.decision === 'APPROVE'
                ? 'button primary-button'
                : 'button danger-button'}
              type="submit"
              disabled={isSubmitting
                || (activeDecision.decision === 'REJECT' && !rejectionReason.trim())}
            >
              {isSubmitting
                ? 'Saving…'
                : activeDecision.decision === 'APPROVE'
                  ? 'Confirm Approval'
                  : 'Confirm Decline'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
