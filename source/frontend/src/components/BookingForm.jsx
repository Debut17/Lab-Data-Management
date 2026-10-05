import { useEffect, useState } from 'react';

const emptyForm = {
  resourceId: '',
  startTime: '',
  endTime: '',
};

function validate(form) {
  const errors = {};
  if (!form.resourceId) errors.resourceId = 'Select a resource.';
  if (!form.startTime) errors.startTime = 'Enter a start time.';
  if (!form.endTime) errors.endTime = 'Enter an end time.';
  if (
    form.startTime
    && form.endTime
    && new Date(form.endTime).getTime() <= new Date(form.startTime).getTime()
  ) {
    errors.endTime = 'End time must be after start time.';
  }
  return errors;
}

export default function BookingForm({ onLoadResources, onCreate, onCreated }) {
  const [resources, setResources] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [createdBooking, setCreatedBooking] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadResources() {
    setIsLoading(true);
    setLoadError('');
    try {
      setResources(await onLoadResources());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Resources could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadResources();
  }, []);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
    setSubmitError('');
    setCreatedBooking(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    setSubmitError('');
    setCreatedBooking(null);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const booking = await onCreate({
        resourceId: form.resourceId,
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
      });
      setCreatedBooking(booking);
      setForm(emptyForm);
      onCreated?.(booking);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Booking request could not be submitted.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const hasResources = resources.length > 0;

  return (
    <section className="form-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">US-4 · Lab member</p>
          <h2>Request a Resource Booking</h2>
          <p>Select an available resource and the time period needed.</p>
        </div>
        <span className="manual-badge">Status starts as Pending</span>
      </div>

      {loadError && (
        <div role="alert" className="message error-message">
          <span>{loadError}</span>
          <button className="inline-button" type="button" onClick={loadResources}>Try again</button>
        </div>
      )}

      <form noValidate onSubmit={handleSubmit}>
        <div className="form-grid booking-grid">
          <label className="field full-width">
            <span>Resource <em aria-hidden="true">*</em></span>
            <select
              name="resourceId"
              value={form.resourceId}
              onChange={updateField}
              disabled={isLoading || !hasResources}
              aria-invalid={Boolean(errors.resourceId)}
              aria-describedby={errors.resourceId ? 'resourceId-error' : undefined}
            >
              <option value="">
                {isLoading ? 'Loading resources…' : 'Select an available resource'}
              </option>
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name} · {resource.location}
                </option>
              ))}
            </select>
            {errors.resourceId && (
              <small id="resourceId-error" className="field-error">{errors.resourceId}</small>
            )}
            {!isLoading && !loadError && !hasResources && (
              <small className="field-hint">No available resources can be booked right now.</small>
            )}
          </label>

          <DateTimeField
            label="Start time"
            name="startTime"
            value={form.startTime}
            error={errors.startTime}
            onChange={updateField}
          />
          <DateTimeField
            label="End time"
            name="endTime"
            value={form.endTime}
            error={errors.endTime}
            onChange={updateField}
          />
        </div>

        {submitError && <div role="alert" className="message error-message">{submitError}</div>}

        {createdBooking && (
          <div role="status" className="message success-message">
            <strong>Booking request submitted.</strong>
            <span>{createdBooking.resourceName} · Status: Pending</span>
          </div>
        )}

        <div className="form-actions">
          <button
            className="button secondary-button"
            type="button"
            onClick={() => {
              setForm(emptyForm);
              setErrors({});
              setSubmitError('');
              setCreatedBooking(null);
            }}
          >
            Clear
          </button>
          <button
            className="button primary-button"
            type="submit"
            disabled={isSubmitting || isLoading || !hasResources}
          >
            {isSubmitting ? 'Submitting…' : 'Submit Booking Request'}
          </button>
        </div>
      </form>
    </section>
  );
}

function DateTimeField({ label, name, value, error, onChange }) {
  const errorId = `${name}-error`;
  return (
    <label className="field">
      <span>{label} <em aria-hidden="true">*</em></span>
      <input
        type="datetime-local"
        name={name}
        value={value}
        onChange={onChange}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
      {error && <small id={errorId} className="field-error">{error}</small>}
    </label>
  );
}
