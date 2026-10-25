import { useEffect, useState } from "react";

const emptyForm = {
  name: "",
  category: "",
  location: "",
  description: "",
  responsiblePerson: "",
  availabilityStatus: "AVAILABLE",
  currentStatus: "OPERATIONAL",
  specifications: "",
};

export default function ResourceEditor({ loadResources, onUpdate }) {
  const [resources, setResources] = useState([]);
  const [selectedResource, setSelectedResource] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;

    async function fetchResources() {
      setLoading(true);
      setError("");

      try {
        const result = await loadResources();

        if (active) {
          setResources(
            Array.isArray(result)
              ? result
              : Array.isArray(result?.resources)
                ? result.resources
                : [],
          );
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Failed to load resources.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchResources();

    return () => {
      active = false;
    };
  }, [loadResources]);

  function handleEdit(resource) {
    if (resource.archived) {
      return;
    }

    setSelectedResource(resource);

    setForm({
      name: resource.name ?? "",
      category: resource.category ?? "",
      location: resource.location ?? "",
      description: resource.description ?? "",
      responsiblePerson: resource.responsiblePerson ?? "",
      availabilityStatus: resource.availabilityStatus ?? "AVAILABLE",
      currentStatus: resource.currentStatus ?? "OPERATIONAL",
      specifications: resource.specifications ?? "",
    });

    setError("");
    setSuccess("");
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function handleCancel() {
    setSelectedResource(null);
    setForm(emptyForm);
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!selectedResource || saving) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const updatedResource = await onUpdate(selectedResource.id, form);

      setResources((previous) =>
        previous.map((resource) =>
          resource.id === selectedResource.id
            ? { ...resource, ...updatedResource }
            : resource,
        ),
      );

      setSelectedResource(null);
      setForm(emptyForm);
      setSuccess("Resource updated successfully.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update resource.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="form-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Resource Management</p>
          <h2>Edit Resource Records</h2>
          <p>Select a resource to update its information.</p>
        </div>
      </div>

      {error && (
        <div className="message error-message" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="message success-message" role="status">
          {success}
        </div>
      )}

      {loading ? (
        <p>Loading resources...</p>
      ) : resources.length === 0 ? (
        <div className="empty-bookings">
          <strong>No resources found.</strong>
          <p>There are currently no resources to edit.</p>
        </div>
      ) : (
        <div className="resource-editor-list">
          {resources.map((resource) => (
            <div
              key={resource.id}
              className={`resource-editor-card ${
                resource.archived ? "archived" : ""
              }`}
            >
              <div>
                <h3>{resource.name}</h3>

                <p>
                  <strong>Category:</strong> {resource.category}
                </p>

                <p>
                  <strong>Location:</strong> {resource.location}
                </p>

                <p>
                  <strong>Availability:</strong> {resource.availabilityStatus}
                </p>

                <p>
                  <strong>Current Status:</strong> {resource.currentStatus}
                </p>

                {resource.archived && (
                  <span className="inactive-badge">Archived</span>
                )}
              </div>

              <button
                type="button"
                className="button secondary-button"
                onClick={() => handleEdit(resource)}
                disabled={resource.archived || saving}
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedResource && (
        <div className="resource-editor-form">
          <h3>Edit: {selectedResource.name}</h3>

          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <label className="field">
                Resource Name <em>*</em>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  maxLength={150}
                  required
                  disabled={saving}
                />
              </label>

              <label className="field">
                Category <em>*</em>
                <input
                  type="text"
                  name="category"
                  value={form.category}
                  onChange={handleChange}
                  maxLength={100}
                  required
                  disabled={saving}
                />
              </label>

              <label className="field">
                Location <em>*</em>
                <input
                  type="text"
                  name="location"
                  value={form.location}
                  onChange={handleChange}
                  maxLength={255}
                  required
                  disabled={saving}
                />
              </label>

              <label className="field">
                Responsible Person
                <input
                  type="text"
                  name="responsiblePerson"
                  value={form.responsiblePerson}
                  onChange={handleChange}
                  maxLength={150}
                  disabled={saving}
                />
              </label>

              <label className="field">
                Availability Status
                <select
                  name="availabilityStatus"
                  value={form.availabilityStatus}
                  onChange={handleChange}
                  disabled={saving}
                >
                  <option value="AVAILABLE">Available</option>
                  <option value="UNAVAILABLE">Unavailable</option>
                </select>
              </label>

              <label className="field">
                Current Status
                <select
                  name="currentStatus"
                  value={form.currentStatus}
                  onChange={handleChange}
                  disabled={saving}
                >
                  <option value="OPERATIONAL">Operational</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="OUT_OF_SERVICE">Out of Service</option>
                </select>
              </label>

              <label className="field full-width">
                Description
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  maxLength={2000}
                  rows={4}
                  disabled={saving}
                />
              </label>

              <label className="field full-width">
                Specifications
                <textarea
                  name="specifications"
                  value={form.specifications}
                  onChange={handleChange}
                  maxLength={4000}
                  rows={4}
                  disabled={saving}
                />
              </label>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="button secondary-button"
                onClick={handleCancel}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="button primary-button"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
