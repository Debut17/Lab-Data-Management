import { useEffect, useState } from 'react';

const FILTERS = {
  ACTIVE: 'Active',
  ARCHIVED: 'Archived',
  ALL: 'All',
};

export default function ResourceArchive({ loadResources, onArchive }) {
  const [resources, setResources] = useState([]);
  const [filter, setFilter] = useState('ACTIVE');
  const [reloadKey, setReloadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState(null);
  const [archivingId, setArchivingId] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [archiveError, setArchiveError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError('');
    loadResources()
      .then(({ resources: loaded }) => {
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

  function openConfirmation(resource) {
    setConfirmingId(resource.id);
    setArchiveError('');
    setSuccessMessage('');
  }

  async function confirmArchive(resource) {
    setArchivingId(resource.id);
    setArchiveError('');
    setSuccessMessage('');
    try {
      const saved = await onArchive(resource.id);
      setResources((current) => current.map((item) => (
        item.id === saved.id ? { ...item, ...saved, archived: true } : item
      )));
      setSuccessMessage(`${resource.name} was archived. Lab members can no longer see or book it.`);
      setConfirmingId(null);
    } catch (error) {
      setArchiveError(error instanceof Error ? error.message : 'The resource could not be archived.');
    } finally {
      setArchivingId(null);
    }
  }

  const counts = {
    ACTIVE: resources.filter((resource) => !resource.archived).length,
    ARCHIVED: resources.filter((resource) => resource.archived).length,
    ALL: resources.length,
  };
  const visibleResources = resources.filter((resource) => (
    filter === 'ALL' || (filter === 'ARCHIVED' ? resource.archived : !resource.archived)
  ));

  return (
    <section className="form-card" aria-labelledby="resource-archive-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">US-10 · System administrator</p>
          <h2 id="resource-archive-title">Archive Resources</h2>
          <p>
            Archive retired resources to hide them from lab members. Archived records stay visible
            here for administrators.
          </p>
        </div>
        <button
          className="button secondary-button"
          type="button"
          disabled={isLoading || Boolean(archivingId)}
          onClick={() => setReloadKey((key) => key + 1)}
        >
          Refresh
        </button>
      </div>

      <div className="status-filters" role="group" aria-label="Filter resources">
        {Object.entries(FILTERS).map(([value, label]) => (
          <button
            key={value}
            className={filter === value ? 'active' : ''}
            type="button"
            aria-label={`${label} (${counts[value]})`}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
            <span className="filter-count" aria-hidden="true">{counts[value]}</span>
          </button>
        ))}
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
      {archiveError && <div className="message error-message" role="alert">{archiveError}</div>}
      {successMessage && <div className="message success-message" role="status">{successMessage}</div>}

      {!isLoading && !loadError && visibleResources.length === 0 && (
        <div className="empty-bookings">
          <strong>
            {filter === 'ARCHIVED' ? 'No archived resources' : 'No resources to show'}
          </strong>
        </div>
      )}

      {!isLoading && !loadError && (
        <div className="booking-list">
          {visibleResources.map((resource) => {
            const titleId = `archive-${resource.id}-title`;
            const isConfirming = confirmingId === resource.id;
            const isArchiving = archivingId === resource.id;
            return (
              <article
                className={`booking-card${isConfirming ? ' is-reviewing' : ''}`}
                key={resource.id}
                aria-labelledby={titleId}
              >
                <div className="booking-card-heading">
                  <div>
                    <span className={`status-badge ${resource.archived ? 'status-cancelled' : 'status-approved'}`}>
                      {resource.archived ? 'Archived' : 'Active'}
                    </span>
                    <h3 id={titleId}>{resource.name}</h3>
                  </div>
                  <span className="request-time">{resource.category} · {resource.location}</span>
                </div>

                {!resource.archived && !isConfirming && (
                  <div className="booking-actions">
                    <button
                      className="button decline-button"
                      type="button"
                      aria-label={`Archive ${resource.name}`}
                      disabled={Boolean(archivingId)}
                      onClick={() => openConfirmation(resource)}
                    >
                      Archive
                    </button>
                  </div>
                )}

                {isConfirming && (
                  <div className="decision-panel decline-decision">
                    <div>
                      <p className="eyebrow">Confirm archive</p>
                      <h4>Archive {resource.name}?</h4>
                      <p>
                        Lab members will no longer see or book this resource. Resources with pending
                        or upcoming bookings cannot be archived.
                      </p>
                    </div>
                    <div className="form-actions">
                      <button
                        className="button secondary-button"
                        type="button"
                        disabled={isArchiving}
                        onClick={() => setConfirmingId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        className="button danger-button"
                        type="button"
                        disabled={isArchiving}
                        onClick={() => confirmArchive(resource)}
                      >
                        {isArchiving ? 'Archiving…' : 'Confirm Archive'}
                      </button>
                    </div>
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
