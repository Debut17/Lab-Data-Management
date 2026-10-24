import { useEffect, useState } from 'react';

const PAGE_SIZE = 20;

function readableAction(action) {
  const words = action.replaceAll('_', ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function readableField(field) {
  return field.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}

function readableValue(value) {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export default function AuditHistory({ loadAuditLogs }) {
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [auditLogs, setAuditLogs] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError('');
    loadAuditLogs(page, PAGE_SIZE)
      .then((result) => {
        if (!isCurrent) return;
        setAuditLogs(result.auditLogs ?? []);
        setHasMore(Boolean(result.hasMore));
      })
      .catch((error) => {
        if (!isCurrent) return;
        setAuditLogs([]);
        setHasMore(false);
        setLoadError(error instanceof Error ? error.message : 'Change history could not be loaded.');
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, [loadAuditLogs, page, reloadKey]);

  return (
    <section className="form-card audit-history" aria-labelledby="audit-history-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Audit trail</p>
          <h2 id="audit-history-title">Change History</h2>
          <p>Review who changed a record and when. Older events may not have field details.</p>
        </div>
        <span className="manual-badge">Administrator only</span>
      </div>

      {isLoading && <div className="message info-message" role="status">Loading change history…</div>}
      {loadError && (
        <div className="message error-message" role="alert">
          <span>{loadError}</span>
          <button className="inline-button" type="button" onClick={() => setReloadKey((key) => key + 1)}>
            Try again
          </button>
        </div>
      )}
      {!isLoading && !loadError && auditLogs.length === 0 && (
        <div className="empty-bookings"><strong>No change history yet</strong></div>
      )}

      {!isLoading && !loadError && auditLogs.length > 0 && (
        <ol className="audit-list">
          {auditLogs.map((entry) => {
            const changes = Object.entries(entry.changes ?? {});
            return (
              <li className="audit-entry" key={entry.id}>
                <div className="audit-entry-heading">
                  <div>
                    <span className="audit-action">{readableAction(entry.action)}</span>
                    <h3>{entry.actorName}</h3>
                    <p>{entry.entityType} · {entry.affectedRecordId}</p>
                  </div>
                  <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time>
                </div>
                {changes.length > 0 ? (
                  <details className="audit-details">
                    <summary>View changes</summary>
                    <dl>
                      {changes.map(([field, change]) => (
                        <div className="audit-change" key={field}>
                          <dt>{readableField(field)}</dt>
                          <dd><span>Before</span> {readableValue(change.before)}</dd>
                          <dd><span>After</span> {readableValue(change.after)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ) : (
                  <p className="audit-legacy">Field details were not recorded for this older event.</p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {!loadError && (
        <div className="audit-pagination" aria-label="Change history pages">
          <button
            className="button secondary-button"
            type="button"
            disabled={isLoading || page === 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous page
          </button>
          <span>Page {page}</span>
          <button
            className="button secondary-button"
            type="button"
            disabled={isLoading || !hasMore || page >= 10000}
            onClick={() => setPage((current) => current + 1)}
          >
            Next page
          </button>
        </div>
      )}
    </section>
  );
}
