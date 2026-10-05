import { useEffect, useState } from 'react';

export const ROLE_LABELS = {
  SYSTEM_ADMIN: 'System Administrator',
  LAB_STAFF: 'Lab Staff',
  LAB_MEMBER: 'Lab Member',
};

const BASE_ROLE = 'LAB_MEMBER';

export default function RoleManagement({ currentUserId, loadUsers, onUpdateRole }) {
  const [users, setUsers] = useState([]);
  const [selectedRoles, setSelectedRoles] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [savingUserId, setSavingUserId] = useState(null);

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError('');

    loadUsers()
      .then((result) => {
        if (isCurrent) setUsers(result.users ?? []);
      })
      .catch((error) => {
        if (isCurrent) {
          setLoadError(error instanceof Error ? error.message : 'Users could not be loaded.');
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [loadUsers]);

  async function saveRole(user, role) {
    setSavingUserId(user.id);
    setUpdateError('');
    setSuccessMessage('');
    try {
      const updated = await onUpdateRole(user.id, role);
      setUsers((current) => current.map(
        (candidate) => (candidate.id === updated.id ? { ...candidate, role: updated.role } : candidate),
      ));
      setSelectedRoles(({ [user.id]: _saved, ...rest }) => rest);
      setSuccessMessage(role === BASE_ROLE && user.role !== BASE_ROLE
        ? `${ROLE_LABELS[user.role]} role was revoked from ${user.displayName}.`
        : `${user.displayName} is now ${ROLE_LABELS[updated.role]}.`);
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : 'The role change could not be saved.');
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <section className="form-card role-management" aria-labelledby="role-management-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Access control</p>
          <h2 id="role-management-title">User Roles</h2>
          <p>Assign or revoke roles. Permissions change as soon as a role is saved.</p>
        </div>
        <span className="manual-badge">Administrator only</span>
      </div>

      {isLoading && <div className="message info-message" role="status">Loading users…</div>}
      {loadError && <div className="message error-message" role="alert">{loadError}</div>}
      {updateError && <div className="message error-message" role="alert">{updateError}</div>}
      {successMessage && <div className="message success-message" role="status">{successMessage}</div>}

      {!isLoading && !loadError && users.length === 0 && (
        <div className="empty-bookings">
          <strong>No users found</strong>
        </div>
      )}

      <div className="user-list">
        {users.map((user) => {
          const isSelf = user.id === currentUserId;
          const isSaving = savingUserId === user.id;
          const selectedRole = selectedRoles[user.id] ?? user.role;
          const nameId = `user-${user.id}-name`;

          return (
            <article className="user-row" key={user.id} aria-labelledby={nameId}>
              <div className="user-identity">
                <h3 id={nameId}>
                  {user.displayName}
                  {isSelf && <span className="self-badge">You</span>}
                </h3>
                <span>{user.email}</span>
                {!user.isActive && <span className="inactive-badge">Inactive</span>}
              </div>
              <span className={`role-badge role-${user.role.toLowerCase().replace('_', '-')}`}>
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
              <div className="role-actions">
                <label className="field role-select">
                  <span className="visually-hidden">Role for {user.displayName}</span>
                  <select
                    value={selectedRole}
                    disabled={isSelf || savingUserId !== null}
                    onChange={(event) => setSelectedRoles((current) => ({
                      ...current,
                      [user.id]: event.target.value,
                    }))}
                  >
                    {Object.entries(ROLE_LABELS).map(([role, label]) => (
                      <option key={role} value={role}>{label}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="button primary-button"
                  type="button"
                  aria-label={`Save ${user.displayName} role`}
                  disabled={isSelf || savingUserId !== null || selectedRole === user.role}
                  onClick={() => saveRole(user, selectedRole)}
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  className="button decline-button"
                  type="button"
                  aria-label={`Revoke ${user.displayName} role`}
                  disabled={isSelf || savingUserId !== null || user.role === BASE_ROLE}
                  onClick={() => saveRole(user, BASE_ROLE)}
                >
                  Revoke
                </button>
              </div>
              {isSelf && (
                <p className="field-hint self-hint">You cannot change your own role.</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
