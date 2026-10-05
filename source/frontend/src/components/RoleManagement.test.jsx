import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import RoleManagement from './RoleManagement.jsx';

const admin = {
  id: 'user-admin',
  email: 'admin@example.test',
  displayName: 'Local Admin',
  role: 'SYSTEM_ADMIN',
  isActive: true,
};
const member = {
  id: 'user-member',
  email: 'member@example.test',
  displayName: 'Lab Member',
  role: 'LAB_MEMBER',
  isActive: true,
};
const staff = {
  id: 'user-staff',
  email: 'staff@example.test',
  displayName: 'Lab Staff User',
  role: 'LAB_STAFF',
  isActive: false,
};

function renderRoles({ users = [admin, member, staff], onUpdateRole = vi.fn() } = {}) {
  const loadUsers = vi.fn().mockResolvedValue({ users });
  render(
    <RoleManagement
      currentUserId={admin.id}
      loadUsers={loadUsers}
      onUpdateRole={onUpdateRole}
    />,
  );
  return { loadUsers, onUpdateRole };
}

describe('RoleManagement', () => {
  it('loads users with their current roles', async () => {
    const { loadUsers } = renderRoles();

    expect(screen.getByRole('status')).toHaveTextContent(/loading users/i);
    const memberRow = await screen.findByRole('article', { name: 'Lab Member' });
    expect(within(memberRow).getByText('member@example.test')).toBeInTheDocument();
    expect(within(memberRow).getByLabelText(/role for lab member/i)).toHaveValue('LAB_MEMBER');
    expect(within(screen.getByRole('article', { name: /lab staff user/i })).getByText('Inactive'))
      .toBeInTheDocument();
    expect(loadUsers).toHaveBeenCalledOnce();
  });

  it('prevents the signed-in administrator from changing their own role', async () => {
    renderRoles();

    const ownRow = await screen.findByRole('article', { name: /local admin/i });

    expect(within(ownRow).getByText('You')).toBeInTheDocument();
    expect(within(ownRow).getByLabelText(/role for local admin/i)).toBeDisabled();
    expect(within(ownRow).getByRole('button', { name: /^save/i })).toBeDisabled();
    expect(within(ownRow).getByRole('button', { name: /^revoke/i })).toBeDisabled();
    expect(within(ownRow).getByText(/cannot change your own role/i)).toBeInTheDocument();
  });

  it('assigns a selected role and shows the saved role', async () => {
    const user = userEvent.setup();
    const onUpdateRole = vi.fn().mockResolvedValue({ ...member, role: 'LAB_STAFF' });
    renderRoles({ onUpdateRole });

    const memberRow = await screen.findByRole('article', { name: 'Lab Member' });
    const saveButton = within(memberRow).getByRole('button', { name: /^save/i });
    expect(saveButton).toBeDisabled();
    expect(within(memberRow).getByRole('button', { name: /^revoke/i })).toBeDisabled();

    await user.selectOptions(within(memberRow).getByLabelText(/role for lab member/i), 'LAB_STAFF');
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    await waitFor(() => expect(onUpdateRole).toHaveBeenCalledWith('user-member', 'LAB_STAFF'));
    expect(await screen.findByRole('status')).toHaveTextContent('Lab Member is now Lab Staff.');
    expect(within(memberRow).getByLabelText(/role for lab member/i)).toHaveValue('LAB_STAFF');
    expect(saveButton).toBeDisabled();
  });

  it('revokes a role by returning the user to Lab Member', async () => {
    const user = userEvent.setup();
    const onUpdateRole = vi.fn().mockResolvedValue({ ...staff, role: 'LAB_MEMBER' });
    renderRoles({ onUpdateRole });

    const staffRow = await screen.findByRole('article', { name: /lab staff user/i });
    await user.click(within(staffRow).getByRole('button', { name: /^revoke/i }));

    await waitFor(() => expect(onUpdateRole).toHaveBeenCalledWith('user-staff', 'LAB_MEMBER'));
    expect(await screen.findByRole('status'))
      .toHaveTextContent('Lab Staff role was revoked from Lab Staff User.');
    expect(within(staffRow).getByLabelText(/role for lab staff user/i)).toHaveValue('LAB_MEMBER');
  });

  it('keeps the current role and reports a failed change', async () => {
    const user = userEvent.setup();
    const onUpdateRole = vi.fn().mockRejectedValue(new Error('You cannot change your own role.'));
    renderRoles({ onUpdateRole });

    const memberRow = await screen.findByRole('article', { name: 'Lab Member' });
    await user.selectOptions(within(memberRow).getByLabelText(/role for lab member/i), 'SYSTEM_ADMIN');
    await user.click(within(memberRow).getByRole('button', { name: /^save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You cannot change your own role.');
    expect(within(memberRow).getByText('Lab Member', { selector: '.role-badge' })).toBeInTheDocument();
  });

  it('reports load failures and an empty user list', async () => {
    const loadUsers = vi.fn().mockRejectedValue(new Error('Users could not be loaded.'));
    const { unmount } = render(
      <RoleManagement currentUserId="x" loadUsers={loadUsers} onUpdateRole={vi.fn()} />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Users could not be loaded.');
    unmount();

    renderRoles({ users: [] });
    expect(await screen.findByText(/no users found/i)).toBeInTheDocument();
  });
});
