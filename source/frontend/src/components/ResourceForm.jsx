import { useState } from 'react';

const initialForm = {
  name: '',
  category: '',
  location: '',
  description: '',
  responsiblePerson: '',
  availabilityStatus: 'AVAILABLE',
  currentStatus: 'OPERATIONAL',
  specifications: '',
};

const requiredFields = ['name', 'category', 'location'];

export default function ResourceForm({ onCreate }) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [createdResource, setCreatedResource] = useState(null);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
    setSubmitError('');
    setCreatedResource(null);
  }

  function validate() {
    const nextErrors = Object.fromEntries(
      requiredFields
        .filter((field) => !form[field].trim())
        .map((field) => [field, 'This field is required.']),
    );
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    setCreatedResource(null);
    try {
      const payload = Object.fromEntries(
        Object.entries(form).map(([key, value]) => [key, value.trim()]),
      );
      const savedResource = await onCreate(payload);
      setCreatedResource(savedResource);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Resource could not be saved.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetForm() {
    setForm(initialForm);
    setErrors({});
    setSubmitError('');
    setCreatedResource(null);
  }

  return (
    <section className="form-card" aria-labelledby="create-resource-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Resource management</p>
          <h2 id="create-resource-title">Create Resource</h2>
          <p>Add a new laboratory resource to the managed inventory.</p>
        </div>
        <span className="manual-badge">Manual entry</span>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <Field
            label="Resource name"
            name="name"
            value={form.name}
            error={errors.name}
            onChange={updateField}
            maxLength={150}
            required
          />
          <Field
            label="Category"
            name="category"
            value={form.category}
            error={errors.category}
            onChange={updateField}
            maxLength={100}
            required
          />
          <Field
            label="Location"
            name="location"
            value={form.location}
            error={errors.location}
            onChange={updateField}
            maxLength={255}
            required
          />
          <Field
            label="Responsible person"
            name="responsiblePerson"
            value={form.responsiblePerson}
            onChange={updateField}
            maxLength={150}
          />

          <label className="field">
            <span>Availability</span>
            <select
              name="availabilityStatus"
              value={form.availabilityStatus}
              onChange={updateField}
            >
              <option value="AVAILABLE">Available</option>
              <option value="UNAVAILABLE">Unavailable</option>
            </select>
          </label>

          <label className="field">
            <span>Current status</span>
            <select name="currentStatus" value={form.currentStatus} onChange={updateField}>
              <option value="OPERATIONAL">Operational</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="OUT_OF_SERVICE">Out of service</option>
            </select>
          </label>

          <TextArea
            label="Description"
            name="description"
            value={form.description}
            onChange={updateField}
            maxLength={2000}
          />
          <TextArea
            label="Specifications"
            name="specifications"
            value={form.specifications}
            onChange={updateField}
            maxLength={4000}
          />
        </div>

        {submitError && <div role="alert" className="message error-message">{submitError}</div>}

        {createdResource && (
          <div role="status" className="message success-message">
            <strong>Resource created successfully.</strong>
            <span>
              {createdResource.name} · {createdResource.id}
            </span>
          </div>
        )}

        <div className="form-actions">
          <button className="button secondary-button" type="button" onClick={resetForm}>
            Cancel
          </button>
          <button className="button primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create Resource'}
          </button>
        </div>
      </form>
    </section>
  );
}

function Field({ label, name, value, error, onChange, required = false, maxLength }) {
  const errorId = `${name}-error`;
  return (
    <label className="field">
      <span>
        {label} {required && <em aria-hidden="true">*</em>}
      </span>
      <input
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        maxLength={maxLength}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
      {error && <small id={errorId} className="field-error">{error}</small>}
    </label>
  );
}

function TextArea({ label, name, value, onChange, maxLength }) {
  return (
    <label className="field full-width">
      <span>{label}</span>
      <textarea name={name} value={value} onChange={onChange} maxLength={maxLength} rows="4" />
    </label>
  );
}
