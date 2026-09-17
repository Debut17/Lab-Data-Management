import { useRef, useState } from 'react';

import ResourcePdfUpload from './ResourcePdfUpload.jsx';

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
const suggestionFields = Object.keys(initialForm);
const statusValues = {
  availabilityStatus: new Set(['AVAILABLE', 'UNAVAILABLE']),
  currentStatus: new Set(['OPERATIONAL', 'MAINTENANCE', 'OUT_OF_SERVICE']),
};

function normalizeSuggestion(field, value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const allowedValues = statusValues[field];
  return allowedValues && !allowedValues.has(normalized) ? null : normalized;
}

export default function ResourceForm({ onCreate, onExtract }) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [createdResource, setCreatedResource] = useState(null);
  const [suggestedFields, setSuggestedFields] = useState(new Set());
  const [uploadVersion, setUploadVersion] = useState(0);
  const dirtyFields = useRef(new Set());
  const suggestedFieldsRef = useRef(new Set());

  function updateField(event) {
    const { name, value } = event.target;
    dirtyFields.current.add(name);
    const nextSuggestedFields = new Set(suggestedFieldsRef.current);
    nextSuggestedFields.delete(name);
    suggestedFieldsRef.current = nextSuggestedFields;
    setSuggestedFields(nextSuggestedFields);
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
    setSubmitError('');
    setCreatedResource(null);
  }

  function applySuggestions(suggestions) {
    if (!suggestions || typeof suggestions !== 'object') {
      return;
    }

    const previousSuggestedFields = suggestedFieldsRef.current;
    const nextSuggestedFields = new Set(
      suggestionFields.filter((field) => (
        !dirtyFields.current.has(field)
        && normalizeSuggestion(field, suggestions[field]) !== null
      )),
    );

    setForm((current) => {
      const nextForm = { ...current };

      for (const field of suggestionFields) {
        if (dirtyFields.current.has(field)) {
          continue;
        }

        const suggestion = normalizeSuggestion(field, suggestions[field]);
        if (suggestion !== null) {
          nextForm[field] = suggestion;
        } else if (previousSuggestedFields.has(field)) {
          nextForm[field] = initialForm[field];
        }
      }

      return nextForm;
    });

    suggestedFieldsRef.current = nextSuggestedFields;
    setSuggestedFields(nextSuggestedFields);
    setErrors({});
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
    dirtyFields.current = new Set();
    suggestedFieldsRef.current = new Set();
    setSuggestedFields(new Set());
    setUploadVersion((current) => current + 1);
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

      <ResourcePdfUpload
        key={uploadVersion}
        onExtract={onExtract}
        onSuggestions={applySuggestions}
      />

      {suggestedFields.size > 0 && (
        <div className="ai-review-notice">
          <strong>AI suggestions applied.</strong>
          <span>Review every suggested value before saving. Editing a field marks it as reviewed.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <Field
            label="Resource name"
            name="name"
            value={form.name}
            error={errors.name}
            onChange={updateField}
            maxLength={150}
            suggested={suggestedFields.has('name')}
            required
          />
          <Field
            label="Category"
            name="category"
            value={form.category}
            error={errors.category}
            onChange={updateField}
            maxLength={100}
            suggested={suggestedFields.has('category')}
            required
          />
          <Field
            label="Location"
            name="location"
            value={form.location}
            error={errors.location}
            onChange={updateField}
            maxLength={255}
            suggested={suggestedFields.has('location')}
            required
          />
          <Field
            label="Responsible person"
            name="responsiblePerson"
            value={form.responsiblePerson}
            onChange={updateField}
            maxLength={150}
            suggested={suggestedFields.has('responsiblePerson')}
          />

          <label className="field">
            <FieldLabel
              label="Availability"
              suggested={suggestedFields.has('availabilityStatus')}
            />
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
            <FieldLabel
              label="Current status"
              suggested={suggestedFields.has('currentStatus')}
            />
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
            suggested={suggestedFields.has('description')}
          />
          <TextArea
            label="Specifications"
            name="specifications"
            value={form.specifications}
            onChange={updateField}
            maxLength={4000}
            suggested={suggestedFields.has('specifications')}
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

function Field({
  label,
  name,
  value,
  error,
  onChange,
  required = false,
  maxLength,
  suggested = false,
}) {
  const errorId = `${name}-error`;
  return (
    <label className="field">
      <FieldLabel label={label} required={required} suggested={suggested} />
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

function TextArea({ label, name, value, onChange, maxLength, suggested = false }) {
  return (
    <label className="field full-width">
      <FieldLabel label={label} suggested={suggested} />
      <textarea name={name} value={value} onChange={onChange} maxLength={maxLength} rows="4" />
    </label>
  );
}

function FieldLabel({ label, required = false, suggested = false }) {
  return (
    <span className="field-label">
      <span>
        {label} {required && <em aria-hidden="true">*</em>}
      </span>
      {suggested && <small className="suggestion-badge">AI suggested</small>}
    </span>
  );
}
