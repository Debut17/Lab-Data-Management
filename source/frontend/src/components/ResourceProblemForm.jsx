import { useCallback, useEffect, useRef, useState } from 'react';

export const PROBLEM_TYPE_LABELS = {
  INCORRECT_RECORD: 'Incorrect resource record',
  DAMAGE: 'Physical damage',
  MALFUNCTION: 'Equipment malfunction',
  OTHER: 'Other problem',
};

const emptyForm = { resourceId: '', problemType: '', description: '' };

export default function ResourceProblemForm({ onLoadResources, onCreate, reporterName }) {
  const [resources, setResources] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedReport, setSavedReport] = useState(null);
  const mounted = useRef(false);
  const requestId = useRef(0);
  const submitting = useRef(false);

  const loadResources = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setLoadError('');
    try {
      const result = await onLoadResources();
      if (!mounted.current || currentRequest !== requestId.current) return;
      setResources(result);
      setForm((current) => ({
        ...current,
        resourceId: result.some((resource) => resource.id === current.resourceId)
          ? current.resourceId : '',
      }));
    } catch (error) {
      if (!mounted.current || currentRequest !== requestId.current) return;
      setResources([]);
      setLoadError(error instanceof Error ? error.message : 'Resources could not be loaded.');
    } finally {
      if (mounted.current && currentRequest === requestId.current) setIsLoading(false);
    }
  }, [onLoadResources]);

  useEffect(() => {
    mounted.current = true;
    loadResources();
    return () => {
      mounted.current = false;
      requestId.current++;
    };
  }, [loadResources]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setSubmitError('');
    setSavedReport(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting.current || isLoading || loadError || resources.length === 0) return;
    if (!resources.some((resource) => resource.id === form.resourceId)
      || !Object.hasOwn(PROBLEM_TYPE_LABELS, form.problemType) || !form.description.trim()) {
      setSubmitError('Select a resource and problem type, and describe the problem.');
      return;
    }
    submitting.current = true;
    setIsSubmitting(true);
    setSubmitError('');
    setSavedReport(null);
    try {
      const report = await onCreate({ ...form, description: form.description.trim() });
      if (!mounted.current) return;
      setSavedReport(report);
      setForm(emptyForm);
    } catch (error) {
      if (mounted.current) {
        setSubmitError(error instanceof Error ? error.message : 'The problem report could not be submitted.');
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setIsSubmitting(false);
    }
  }

  return (
    <section className="form-card" aria-label="Report a Resource Problem">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Resource problem reporting</p>
          <p>Tell an administrator about incorrect records, damage, or equipment problems.</p>
        </div>
        <button className="button secondary-button" type="button" onClick={loadResources}
          disabled={isLoading || isSubmitting}>Refresh resources</button>
      </div>

      {isLoading && <p role="status">Loading resources…</p>}
      {loadError && <div role="alert" className="message error-message">{loadError}</div>}
      {!isLoading && !loadError && resources.length === 0 && (
        <p className="message info-message">There are no resources to report a problem for.</p>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <label className="field full-width">
            <span>Affected resource <em aria-hidden="true">*</em></span>
            <select name="resourceId" value={form.resourceId} onChange={updateField} required
              disabled={isLoading || isSubmitting || Boolean(loadError) || resources.length === 0}>
              <option value="">Select a resource</option>
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name} · {resource.location}
                </option>
              ))}
            </select>
          </label>

          <label className="field full-width">
            <span>Problem type <em aria-hidden="true">*</em></span>
            <select name="problemType" value={form.problemType} onChange={updateField}
              required disabled={isSubmitting}>
              <option value="">Select a problem type</option>
              {Object.entries(PROBLEM_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label className="field full-width">
            <span>Description <em aria-hidden="true">*</em></span>
            <textarea name="description" value={form.description} onChange={updateField}
              rows="5" maxLength={2000} required disabled={isSubmitting}
              placeholder="Describe what is wrong and where the administrator can find the problem." />
          </label>
        </div>
        <p>Reporting as <strong>{reporterName}</strong>. New reports are submitted as Pending.</p>
        {submitError && <div role="alert" className="message error-message">{submitError}</div>}
        <div className="form-actions">
          <button className="button primary-button" type="submit"
            disabled={isLoading || isSubmitting || Boolean(loadError) || resources.length === 0}>
            {isSubmitting ? 'Submitting…' : 'Submit problem report'}
          </button>
        </div>
      </form>

      {savedReport && (
        <div role="status" className="message success-message">
          <strong>Problem report submitted. Administrators have been notified.</strong>
          <span>{savedReport.resourceName} · {PROBLEM_TYPE_LABELS[savedReport.problemType]} · Pending</span>
          <span>Reported by {savedReport.reporterName} on {new Date(savedReport.submittedAt).toLocaleString()}.</span>
        </div>
      )}
    </section>
  );
}
