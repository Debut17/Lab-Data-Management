import { useCallback, useEffect, useRef, useState } from 'react';

import { PROBLEM_TYPE_LABELS } from './ResourceProblemForm.jsx';

export default function AdminNotifications({ onLoadNotifications, onMarkRead }) {
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [readingId, setReadingId] = useState(null);
  const mounted = useRef(false);
  const requestId = useRef(0);
  const reading = useRef(false);

  const loadNotifications = useCallback(async ({ background = false } = {}) => {
    if (reading.current) return;
    const currentRequest = ++requestId.current;
    if (!background) setIsLoading(true);
    setError('');
    try {
      const result = await onLoadNotifications();
      if (mounted.current && currentRequest === requestId.current) {
        setNotifications(result.notifications);
      }
    } catch (loadError) {
      if (mounted.current && currentRequest === requestId.current) {
        setError(loadError instanceof Error ? loadError.message : 'Notifications could not be loaded.');
      }
    } finally {
      if (mounted.current && currentRequest === requestId.current) setIsLoading(false);
    }
  }, [onLoadNotifications]);

  useEffect(() => {
    mounted.current = true;
    loadNotifications();
    const interval = window.setInterval(() => loadNotifications({ background: true }), 30000);
    return () => {
      mounted.current = false;
      requestId.current++;
      window.clearInterval(interval);
    };
  }, [loadNotifications]);

  async function markRead(id) {
    if (reading.current) return;
    reading.current = true;
    requestId.current++;
    setReadingId(id);
    setError('');
    try {
      await onMarkRead(id);
      if (mounted.current) {
        setNotifications((current) => current.map((notification) => (
          notification.id === id ? { ...notification, isRead: true } : notification
        )));
      }
    } catch (readError) {
      if (mounted.current) {
        setError(readError instanceof Error ? readError.message : 'The notification could not be marked as read.');
      }
    } finally {
      reading.current = false;
      if (mounted.current) setReadingId(null);
    }
  }

  return (
    <section className="form-card" aria-label="Resource Problem Notifications">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Reported resource problems</p>
          <p>Review reports from Lab Staff to correct resource records or arrange maintenance.</p>
          <p>Unread reports appear first. This view refreshes automatically every 30 seconds.</p>
        </div>
        <button className="button secondary-button" type="button" onClick={() => loadNotifications()}
          disabled={isLoading || readingId !== null}>Refresh notifications</button>
      </div>

      {isLoading && <p role="status">Loading notifications…</p>}
      {error && <div className="message error-message" role="alert">{error}</div>}
      {!isLoading && !error && notifications.length === 0 && (
        <p className="message info-message">No resource problem notifications yet.</p>
      )}

      <div className="booking-list" aria-live="polite">
        {notifications.map((notification) => (
          <article className="booking-card" key={notification.id}
            aria-labelledby={`report-${notification.id}`}>
            <div className="booking-card-heading">
              <div>
                <p className="eyebrow">{notification.isRead ? 'Read' : 'New notification'}</p>
                <h3 id={`report-${notification.id}`}>{notification.resourceName}</h3>
              </div>
              <span className="status-badge">{notification.status === 'PENDING' ? 'Pending' : notification.status}</span>
            </div>
            <p>{notification.message}</p>
            <dl className="booking-details">
              <div><dt>Problem type</dt><dd>{PROBLEM_TYPE_LABELS[notification.problemType] ?? notification.problemType}</dd></div>
              <div>
                <dt>Reporter</dt><dd>{notification.reporterName}</dd>
                <dd className="secondary-detail">{notification.reporterEmail}</dd>
              </div>
              <div><dt>Submitted</dt><dd><time dateTime={notification.submittedAt}>
                {new Date(notification.submittedAt).toLocaleString()}
              </time></dd></div>
            </dl>
            <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{notification.description}</p>
            {!notification.isRead && (
              <button className="button secondary-button" type="button"
                onClick={() => markRead(notification.id)} disabled={isLoading || readingId !== null}>
                {readingId === notification.id ? 'Saving…' : 'Mark as read'}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
