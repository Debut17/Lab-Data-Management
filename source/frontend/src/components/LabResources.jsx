import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { bookingStatus, canBook } from './BookingForm.jsx';

function humanise(value) {
  const text = value.replaceAll('_', ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function orNotProvided(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : 'Not provided';
}

function ResourceDetails({ resource, onClose, onRequestBooking }) {
  const closeButtonRef = useRef(null);
  const titleId = `resource-details-${resource.id}-title`;
  const bookable = canBook(resource);

  useEffect(() => {
    closeButtonRef.current?.focus();
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="resource-details-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="resource-details" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="resource-details-header">
          <div>
            <p className="eyebrow">{resource.category}</p>
            <h2 id={titleId}>{resource.name}</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="resource-details-close"
            type="button"
            aria-label="Close resource details"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <dl className="resource-details-list">
          <div className="resource-details-wide">
            <dt>Description</dt>
            <dd>{orNotProvided(resource.description)}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{orNotProvided(resource.location)}</dd>
          </div>
          <div>
            <dt>Responsible person</dt>
            <dd>{orNotProvided(resource.responsiblePerson)}</dd>
          </div>
          <div>
            <dt>Availability</dt>
            <dd>
              <span className={`status-badge ${bookable ? 'status-approved' : 'status-cancelled'}`}>
                {resource.availabilityStatus === 'AVAILABLE' ? 'Available' : 'Unavailable'}
              </span>
              <span className="resource-details-note">{bookingStatus(resource)}</span>
            </dd>
          </div>
          <div>
            <dt>Current status</dt>
            <dd>{humanise(resource.currentStatus)}</dd>
          </div>
        </dl>
        <div className="resource-details-actions">
          <button className="button secondary-button" type="button" onClick={onClose}>
            Close
          </button>
          {bookable && (
            <button className="button primary-button" type="button" onClick={onRequestBooking}>
              Request a booking
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LabResources({ loadResources, onRequestBooking }) {
  const [resources, setResources] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [nameQuery, setNameQuery] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const detailsTriggerRef = useRef(null);

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
  // Keep the loaded order intact when the user returns to Default order.
  if (sort) {
    const [field, direction] = sort.split('-');
    visibleResources.sort((a, b) => {
      const comparison = field === 'availabilityStatus'
        ? Number(a.availabilityStatus !== 'AVAILABLE') - Number(b.availabilityStatus !== 'AVAILABLE')
        : a[field].localeCompare(b[field], undefined, { sensitivity: 'base' });
      return direction === 'desc' ? -comparison : comparison;
    });
  }
  const bookableCount = visibleResources.filter(canBook).length;

  // Look the resource up by id so a refresh shows its latest details or closes a removed one.
  const selectedResource = resources.find((resource) => resource.id === selectedId) ?? null;

  function clearFilters() {
    setNameQuery('');
    setCategory('');
    setSort('');
  }

  function openDetails(event, id) {
    detailsTriggerRef.current = event.currentTarget;
    setSelectedId(id);
  }

  const closeDetails = useCallback(() => {
    setSelectedId(null);
    detailsTriggerRef.current?.focus();
  }, []);

  return (
    <section className="form-card" aria-label="Lab Resources">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Lab member</p>
          <h2>Lab Resources</h2>
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
            <label className="field lab-resources-sort">
              <span>Sort by</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="">Default order</option>
                <option value="name-asc">Name (A–Z)</option>
                <option value="name-desc">Name (Z–A)</option>
                <option value="category-asc">Category (A–Z)</option>
                <option value="category-desc">Category (Z–A)</option>
                <option value="availabilityStatus-asc">Availability: Available first</option>
                <option value="availabilityStatus-desc">Availability: Unavailable first</option>
              </select>
            </label>
            {(isFiltering || sort !== '') && (
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
                  <button
                    className="button secondary-button"
                    type="button"
                    aria-label={`View details for ${resource.name}`}
                    onClick={(event) => openDetails(event, resource.id)}
                  >
                    View details
                  </button>
                </article>
              );
            })}
          </div>
        </>
      )}

      {selectedResource && (
        <ResourceDetails
          resource={selectedResource}
          onClose={closeDetails}
          onRequestBooking={onRequestBooking}
        />
      )}
    </section>
  );
}
