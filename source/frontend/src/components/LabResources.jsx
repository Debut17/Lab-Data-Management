import { useEffect, useState } from 'react';

import { bookingStatus, canBook } from './BookingForm.jsx';

function humanise(value) {
  const text = value.replaceAll('_', ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function LabResources({ loadResources, onRequestBooking }) {
  const [resources, setResources] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError('');
    loadResources()
      .then((loaded) => {
        if (isCurrent) setResources(loaded ?? []);
      })
      .catch((error) => {
        if (isCurrent) setLoadError(error instanceof Error ? error.message : 'Resources could not be loaded.');
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [loadResources, reloadKey]);

  const bookableCount = resources.filter(canBook).length;

  return (
    <section className="form-card" aria-label="Lab Resources">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Lab member</p>
          {/* The page heading is already shown in the top bar. */}
          <p>
            Every resource currently managed by the lab, with whether it can be booked right now.
          </p>
        </div>
        <div className="lab-resources-actions">
          <button
            className="button secondary-button"
            type="button"
            disabled={isLoading}
            onClick={() => setReloadKey((key) => key + 1)}
          >
            Refresh
          </button>
          <button className="button primary-button" type="button" onClick={onRequestBooking}>
            Request a booking
          </button>
        </div>
      </div>

      {isLoading && <div className="message info-message" role="status">Loading resources…</div>}
      {loadError && (
        <div className="message error-message" role="alert">
          <span>{loadError}</span>
          <button className="inline-button" type="button" onClick={() => setReloadKey((key) => key + 1)}>
            Try again
          </button>
        </div>
      )}

      {!isLoading && !loadError && resources.length === 0 && (
        <div className="empty-bookings">
          <strong>No lab resources yet</strong>
          <span>Resources appear here once an administrator adds them.</span>
        </div>
      )}

      {!isLoading && !loadError && resources.length > 0 && (
        <>
          <p className="lab-resources-count" role="status">
            {resources.length} resource{resources.length === 1 ? '' : 's'} · {bookableCount} can be booked now
          </p>
          <div className="booking-list">
            {resources.map((resource) => {
              const titleId = `lab-resource-${resource.id}-title`;
              const bookable = canBook(resource);
              return (
                <article className="booking-card" key={resource.id} aria-labelledby={titleId}>
                  <div className="booking-card-heading">
                    <div>
                      <span className={`status-badge ${bookable ? 'status-approved' : 'status-cancelled'}`}>
                        {resource.availabilityStatus === 'AVAILABLE' ? 'Available' : 'Unavailable'}
                      </span>
                      <h3 id={titleId}>{resource.name}</h3>
                    </div>
                    <span className="request-time">{bookingStatus(resource)}</span>
                  </div>
                  <dl className="booking-details">
                    <div>
                      <dt>Category</dt>
                      <dd>{resource.category}</dd>
                    </div>
                    <div>
                      <dt>Location</dt>
                      <dd>{resource.location}</dd>
                    </div>
                    <div>
                      <dt>Operational status</dt>
                      <dd>{humanise(resource.currentStatus)}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
