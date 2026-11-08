import { useEffect, useState } from 'react';

import { ReportStatusBadge } from './IssueReportReview.jsx';
import { PROBLEM_TYPE_LABELS } from './ResourceProblemForm.jsx';

function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(value));
}

export default function MyResourceReports({ loadReports, refreshKey = 0 }) {
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
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
          setLoadError(error instanceof Error ? error.message : 'Your reports could not be loaded.');
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, [loadReports, refreshKey, reloadKey]);

  return (
    <section className="form-card my-reports" aria-label="My Problem Reports">
      <div className="section-heading">
        <div>
          <p className="eyebrow">My problem reports</p>
          <p>See the status of reports you submitted and the administrator&apos;s outcome.</p>
        </div>
        <button className="button secondary-button" type="button" disabled={isLoading}
          onClick={() => setReloadKey((key) => key + 1)}>Refresh my reports</button>
      </div>

      {isLoading && <div className="message info-message" role="status">Loading your reports…</div>}
      {loadError && <div className="message error-message" role="alert">{loadError}</div>}
      {!isLoading && !loadError && reports.length === 0 && (
        <div className="empty-bookings"><strong>You have not reported any problems yet</strong></div>
      )}

      <div className="booking-list">
        {reports.map((report) => (
          <article className="booking-card" key={report.id} aria-labelledby={`my-report-${report.id}`}>
            <div className="booking-card-heading">
              <div>
                <ReportStatusBadge status={report.status} />
                <h3 id={`my-report-${report.id}`}>{report.resourceName}</h3>
              </div>
              <span className="request-time">Reported {formatDateTime(report.submittedAt)}</span>
            </div>
            <p className="secondary-detail">{PROBLEM_TYPE_LABELS[report.problemType] ?? report.problemType}</p>
            <p className="report-description">{report.description}</p>
            {report.resolutionNote && (
              <div className="resolution-note">
                <strong>Administrator&apos;s note</strong>
                <p>{report.resolutionNote}</p>
              </div>
            )}
            {report.statusUpdatedAt && (
              <p className="request-time">
                Updated {formatDateTime(report.statusUpdatedAt)}
                {report.statusUpdatedByName ? ` by ${report.statusUpdatedByName}` : ''}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
