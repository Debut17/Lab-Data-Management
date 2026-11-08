import { useCallback, useEffect, useState } from 'react';

import { PROBLEM_TYPE_LABELS } from './ResourceProblemForm.jsx';

export const REPORT_STATUS_LABELS = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
};

const FILTERS = [
  { id: 'open', label: 'Open', matches: (report) => report.status !== 'RESOLVED' },
  { id: 'resolved', label: 'Resolved', matches: (report) => report.status === 'RESOLVED' },
  { id: 'all', label: 'All', matches: () => true },
];

export function ReportStatusBadge({ status }) {
  return (
    <span className={`status-badge status-${status.toLowerCase().replace('_', '-')}`}>
      {REPORT_STATUS_LABELS[status] ?? status}
    </span>
  );
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(value));
}

export default function IssueReportReview({ loadReports, onResolve }) {
  const [reports, setReports] = useState([]);
  const [filter, setFilter] = useState('open');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const refresh = useCallback(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError('');
    loadReports()
      .then((result) => {
        if (isCurrent) setReports(result.reports ?? []);
      })
      .catch((error) => {
        if (isCurrent) {
          setReports([]);
          setLoadError(error instanceof Error ? error.message : 'Issue reports could not be loaded.');
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, [loadReports]);

  useEffect(() => refresh(), [refresh]);

  function openEditor(report) {
    setEditing({
      id: report.id,
      status: report.status === 'PENDING' ? 'IN_PROGRESS' : report.status,
      resolutionNote: report.resolutionNote ?? '',
    });
    setSaveError('');
    setSuccessMessage('');
  }

  function closeEditor() {
    if (isSaving) return;
    setEditing(null);
    setSaveError('');
  }

  async function saveUpdate(event, report) {
    event.preventDefault();
    const resolutionNote = editing.resolutionNote.trim();
    if (editing.status === 'RESOLVED' && !resolutionNote) {
      setSaveError('Add a resolution note describing the outcome.');
      return;
    }
    setIsSaving(true);
    setSaveError('');
    try {
      const updated = await onResolve(report.id, { status: editing.status, resolutionNote });
      setReports((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      setSuccessMessage(updated.reporterNotified
        ? `${report.resourceName} is now ${REPORT_STATUS_LABELS[updated.status]}. ${report.reporterName} was notified.`
        : `The resolution note for ${report.resourceName} was saved.`);
      setEditing(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The issue report could not be updated.');
    } finally {
      setIsSaving(false);
    }
  }

  const activeFilter = FILTERS.find((item) => item.id === filter);
  const visibleReports = reports.filter(activeFilter.matches);

  return (
    <section className="form-card issue-report-review" aria-label="Issue Reports">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Issue report resolution</p>
          <p>Update each report&apos;s status and record the outcome. The reporter is notified when the status changes.</p>
        </div>
        <button className="button secondary-button" type="button" onClick={refresh}
          disabled={isLoading || isSaving}>Refresh reports</button>
      </div>

      <div className="report-filters" role="group" aria-label="Filter issue reports">
        {FILTERS.map((item) => (
          <button
            aria-pressed={filter === item.id}
            className={filter === item.id ? 'active' : ''}
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
          >
            {item.label} <span className="report-filter-count">{reports.filter(item.matches).length}</span>
          </button>
        ))}
      </div>

      {isLoading && <div className="message info-message" role="status">Loading issue reports…</div>}
      {loadError && <div className="message error-message" role="alert">{loadError}</div>}
      {successMessage && <div className="message success-message" role="status">{successMessage}</div>}

      {!isLoading && !loadError && visibleReports.length === 0 && (
        <div className="empty-bookings">
          <strong>{filter === 'open' ? 'No open issue reports' : 'No issue reports here'}</strong>
          <span>Reports submitted by Lab Staff appear here.</span>
        </div>
      )}

      <div className="booking-list">
        {visibleReports.map((report) => {
          const isEditing = editing?.id === report.id;
          const titleId = `issue-${report.id}-title`;
          const panelId = `issue-${report.id}-panel`;
          return (
            <article className={`booking-card${isEditing ? ' is-reviewing' : ''}`} key={report.id}
              aria-labelledby={titleId}>
              <div className="booking-card-heading">
                <div>
                  <ReportStatusBadge status={report.status} />
                  <h3 id={titleId}>{report.resourceName}</h3>
                </div>
                <span className="request-time">Reported {formatDateTime(report.submittedAt)}</span>
              </div>
              <dl className="booking-details">
                <div>
                  <dt>Problem type</dt>
                  <dd>{PROBLEM_TYPE_LABELS[report.problemType] ?? report.problemType}</dd>
                </div>
                <div>
                  <dt>Reporter</dt>
                  <dd>{report.reporterName}</dd>
                  <dd className="secondary-detail">{report.reporterEmail}</dd>
                </div>
                <div>
                  <dt>Last update</dt>
                  <dd>{report.statusUpdatedAt ? formatDateTime(report.statusUpdatedAt) : 'Not yet reviewed'}</dd>
                  {report.statusUpdatedByName && (
                    <dd className="secondary-detail">by {report.statusUpdatedByName}</dd>
                  )}
                </div>
              </dl>
              <p className="report-description">{report.description}</p>
              {report.resolutionNote && (
                <div className="resolution-note">
                  <strong>Resolution note</strong>
                  <p>{report.resolutionNote}</p>
                </div>
              )}

              {!isEditing && (
                <div className="booking-actions">
                  <button className="button primary-button" type="button"
                    aria-label={`Update ${report.resourceName} report`}
                    aria-controls={panelId} aria-expanded={false}
                    disabled={isSaving} onClick={() => openEditor(report)}>
                    Update status
                  </button>
                </div>
              )}

              {isEditing && (
                <form className="decision-panel" id={panelId} aria-label={`Update ${report.resourceName} report`}
                  onSubmit={(event) => saveUpdate(event, report)}>
                  <label className="field">
                    <span>Status <em aria-hidden="true">*</em></span>
                    <select value={editing.status} disabled={isSaving}
                      onChange={(event) => setEditing((current) => ({ ...current, status: event.target.value }))}>
                      {Object.entries(REPORT_STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>
                      Resolution note {editing.status === 'RESOLVED' && <em aria-hidden="true">*</em>}
                    </span>
                    <textarea value={editing.resolutionNote} rows="4" maxLength={2000} disabled={isSaving}
                      required={editing.status === 'RESOLVED'}
                      placeholder="What was done, or what happens next?"
                      onChange={(event) => setEditing((current) => ({ ...current, resolutionNote: event.target.value }))} />
                  </label>
                  {saveError && <div className="message error-message" role="alert">{saveError}</div>}
                  <div className="form-actions">
                    <button className="button secondary-button" type="button" disabled={isSaving}
                      onClick={closeEditor}>Cancel</button>
                    <button className="button primary-button" type="submit" disabled={isSaving}>
                      {isSaving ? 'Saving…' : 'Save update'}
                    </button>
                  </div>
                </form>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
