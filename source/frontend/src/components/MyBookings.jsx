import { useEffect, useState } from 'react';

export default function MyBookings({ onLoadBookings, onCancel, refreshKey = 0 }) {
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState(null);

  async function loadBookings() {
    setError('');
    try {
      const result = await onLoadBookings();
      setBookings(result.bookings ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Bookings could not be loaded.');
    }
  }

  useEffect(() => {
    loadBookings();
  }, [refreshKey]);

  async function handleCancel(id) {
    if (!window.confirm('Are you sure you want to cancel this booking?')) return;

    setError('');
    setCancellingId(id);
    try {
      await onCancel(id);
      await loadBookings();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Booking could not be cancelled.');
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <section className="form-card my-bookings-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Lab member</p>
          <h2>My Booking Requests</h2>
          <p>Pending requests can be cancelled before they are reviewed.</p>
        </div>
      </div>

      {error && <div role="alert" className="message error-message">{error}</div>}

      {bookings.length === 0 ? (
        <p className="empty-bookings">You have no booking requests.</p>
      ) : (
        <div className="booking-list">
          {bookings.map((booking) => (
            <article className="booking-item" key={booking.id}>
              <div className="booking-details">
                <strong>{booking.resourceName}</strong>
                <span>{new Date(booking.startTime).toLocaleString()} → {new Date(booking.endTime).toLocaleString()}</span>
                <span>Status: <strong>{booking.status}</strong></span>
              </div>

              {booking.status === 'PENDING' && (
                <button
                  className="button danger-button"
                  type="button"
                  disabled={cancellingId === booking.id}
                  onClick={() => handleCancel(booking.id)}
                >
                  {cancellingId === booking.id ? 'Cancelling…' : 'Cancel Booking'}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
