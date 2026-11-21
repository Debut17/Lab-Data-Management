import { useEffect, useMemo, useState } from 'react';

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
  const [nameQuery, setNameQuery] = useState('');
  const [category, setCategory] = useState('');

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

  const categories = useMemo(() => {
    const names = new Set(resources.map((resource) => resource.category).filter(Boolean));
    if (category) names.add(category);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [resources, category]);

  const normalisedQuery = nameQuery.trim().toLowerCase();
  const isFiltering = normalisedQuery !== '' || category !== '';
  const visibleResources = resources.filter(
    (resource) =>
      (normalisedQuery === '' || resource.name.toLowerCase().includes(normalisedQuery)) &&
      (category === '' || resource.category === category),
  );
  const bookableCount = visibleResources.filter(canBook).length;

  function clearFilters() {
    setNameQuery('');
    setCategory('');
  }

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
          <div className="lab-resources-filters" role="search">
            <label className="field lab-resources-search">
              <span>Search by name</span>
              <input
                type="search"
                value={nameQuery}
                placeholder="e.g. Microscope"
                onChange={(event) => setNameQuery(event.target.value)}
              />
            </label>
            <label className="field lab-resources-category">
              <span>Category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">All categories</option>
                {categories.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
            {isFiltering && (
              <button className="button secondary-button" type="button" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
          <p className="lab-resources-count" role="status">
            {isFiltering
              ? `${visibleResources.length} of ${resources.length} resources`
              : `${resources.length} resource${resources.length === 1 ? '' : 's'}`}{' '}
            · {bookableCount} can be booked now
          </p>
          {visibleResources.length === 0 && (
            <div className="empty-bookings">
              <strong>No resources match your search</strong>
              <span>Try a different name or category.</span>
            </div>
          )}
          <div className="booking-list">
            {visibleResources.map((resource) => {
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
