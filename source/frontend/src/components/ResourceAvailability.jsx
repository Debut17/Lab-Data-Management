import { useEffect, useState } from 'react';

const AVAILABILITY_LABELS = { AVAILABLE: 'Available', UNAVAILABLE: 'Unavailable' };

export default function ResourceAvailability({ loadResources, onUpdateAvailability }) {
  const [resources, setResources] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [reloadKey, setReloadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError('');
    setSaveError('');
    setSuccessMessage('');
    loadResources()
      .then(({ resources: loaded }) => {
        if (!isCurrent) return;
        setResources(loaded);
        setDrafts({});
      })
      .catch((error) => {
        if (isCurrent) setLoadError(error instanceof Error ? error.message : 'Resources could not be loaded.');
      })
      .finally(() => { if (isCurrent) setIsLoading(false); });
    return () => { isCurrent = false; };
  }, [loadResources, reloadKey]);

  async function saveAvailability(event, resource) {
    event.preventDefault();
    if (savingId || !drafts[resource.id] || drafts[resource.id] === resource.availabilityStatus) return;
    setSavingId(resource.id);
    setSaveError('');
    setSuccessMessage('');
    try {
      const saved = await onUpdateAvailability(resource.id, drafts[resource.id]);
      setResources((current) => current.map((item) => item.id === saved.id ? saved : item));
      setDrafts((current) => ({ ...current, [saved.id]: saved.availabilityStatus }));
      setSuccessMessage(`${saved.name} is now ${AVAILABILITY_LABELS[saved.availabilityStatus].toLowerCase()}.`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Availability could not be saved.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="form-card" aria-labelledby="resource-availability-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">US-11 · System administrator</p>
          <h2 id="resource-availability-title">Resource Availability</h2>
          <p>Choose whether each resource can accept booking requests. Existing bookings are kept.</p>
        </div>
        <button className="button secondary-button" type="button" disabled={isLoading || Boolean(savingId)}
          onClick={() => setReloadKey((key) => key + 1)}>Refresh</button>
      </div>

      {isLoading && <div className="message info-message" role="status">Loading resources…</div>}
      {loadError && <div className="message error-message" role="alert">
        <span>{loadError}</span>
        <button className="inline-button" type="button" onClick={() => setReloadKey((key) => key + 1)}>Try again</button>
      </div>}
      {saveError && <div className="message error-message" role="alert">{saveError}</div>}
      {successMessage && <div className="message success-message" role="status">{successMessage}</div>}
      {!isLoading && !loadError && resources.length === 0 && (
        <div className="empty-bookings"><strong>No resources yet</strong><span>Create a resource to manage its availability.</span></div>
      )}
      {!isLoading && !loadError && <div className="availability-list">
        {resources.map((resource) => (
          <form key={resource.id} className="availability-row" aria-label={`Availability for ${resource.name}`}
            onSubmit={(event) => saveAvailability(event, resource)}>
            <div className="user-identity">
              <h3>{resource.name}</h3>
              <span>{resource.category} · {resource.location}</span>
              <span>Current availability: {AVAILABILITY_LABELS[resource.availabilityStatus]}</span>
              <span>Operational status: {resource.currentStatus.replaceAll('_', ' ').toLowerCase()}</span>
              {resource.archived && <span className="inactive-badge">Archived · availability cannot be changed</span>}
            </div>
            <label className="field">
              <span>Availability for {resource.name}</span>
              <select value={drafts[resource.id] ?? resource.availabilityStatus}
                disabled={resource.archived || Boolean(savingId)}
                onChange={(event) => {
                  setDrafts((current) => ({ ...current, [resource.id]: event.target.value }));
                  setSaveError('');
                  setSuccessMessage('');
                }}>
                <option value="AVAILABLE">Available</option>
                <option value="UNAVAILABLE">Unavailable</option>
              </select>
            </label>
            <button className="button primary-button" type="submit" aria-label={`Save availability for ${resource.name}`}
              disabled={resource.archived || Boolean(savingId) || !drafts[resource.id] || drafts[resource.id] === resource.availabilityStatus}>
              {savingId === resource.id ? 'Saving…' : 'Save'}
            </button>
          </form>
        ))}
      </div>}
    </section>
  );
}
