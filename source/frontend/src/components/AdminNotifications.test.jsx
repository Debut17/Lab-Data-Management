import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import AdminNotifications from './AdminNotifications.jsx';

const notification = {
  id: '10',
  message: 'A resource problem was reported for Microscope.',
  isRead: false,
  createdAt: '2026-11-07T08:00:00.000Z',
  reportId: 'report-1',
  resourceId: 'resource-1',
  resourceName: 'Microscope',
  problemType: 'MALFUNCTION',
  description: 'The focus control slips.',
  reporterId: 'staff-1',
  reporterName: 'Local Lab Staff',
  reporterEmail: 'staff@local.test',
  submittedAt: '2026-11-07T08:00:00.000Z',
  status: 'PENDING',
};

function setup({
  notifications = [notification],
  onLoadNotifications = vi.fn().mockResolvedValue({ notifications }),
  onMarkRead = vi.fn().mockResolvedValue({ id: notification.id, isRead: true }),
} = {}) {
  render(
    <AdminNotifications
      onLoadNotifications={onLoadNotifications}
      onMarkRead={onMarkRead}
    />,
  );
  return { user: userEvent.setup(), onLoadNotifications, onMarkRead };
}

describe('US-7 administrator problem notifications', () => {
  it('loads report details and marks a notification as read', async () => {
    const { user, onMarkRead } = setup();

    expect(screen.getByRole('status')).toHaveTextContent('Loading notifications');
    const report = await screen.findByRole('article', { name: 'Microscope' });
    expect(report).toHaveTextContent('New notification');
    expect(report).toHaveTextContent('Equipment malfunction');
    expect(report).toHaveTextContent('Local Lab Staff');
    expect(report).toHaveTextContent('staff@local.test');
    expect(report).toHaveTextContent('The focus control slips.');

    await user.click(screen.getByRole('button', { name: /mark as read/i }));
    await waitFor(() => expect(onMarkRead).toHaveBeenCalledWith(notification.id));
    expect(report).toHaveTextContent('Read');
    expect(screen.queryByRole('button', { name: /mark as read/i })).not.toBeInTheDocument();
  });

  it('shows an empty state and refreshes the inbox', async () => {
    const onLoadNotifications = vi.fn()
      .mockResolvedValueOnce({ notifications: [] })
      .mockResolvedValueOnce({ notifications: [notification] });
    const { user } = setup({ onLoadNotifications });

    expect(await screen.findByText('No resource problem notifications yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /refresh notifications/i }));

    expect(await screen.findByRole('article', { name: 'Microscope' })).toBeInTheDocument();
    expect(onLoadNotifications).toHaveBeenCalledTimes(2);
  });

  it('reports load errors and can retry', async () => {
    const onLoadNotifications = vi.fn()
      .mockRejectedValueOnce(new Error('Inbox is unavailable.'))
      .mockResolvedValueOnce({ notifications: [notification] });
    const { user } = setup({ onLoadNotifications });

    expect(await screen.findByRole('alert')).toHaveTextContent('Inbox is unavailable.');
    await user.click(screen.getByRole('button', { name: /refresh notifications/i }));
    expect(await screen.findByRole('article', { name: 'Microscope' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps an unread notification available when saving fails', async () => {
    const onMarkRead = vi.fn()
      .mockRejectedValueOnce(new Error('Read state could not be saved.'))
      .mockResolvedValueOnce({ id: notification.id, isRead: true });
    const { user } = setup({ onMarkRead });

    const markRead = await screen.findByRole('button', { name: /mark as read/i });
    await user.click(markRead);
    expect(await screen.findByRole('alert')).toHaveTextContent('Read state could not be saved.');
    expect(screen.getByText('New notification')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /mark as read/i }));
    expect(await screen.findByText('Read')).toBeInTheDocument();
    expect(onMarkRead).toHaveBeenCalledTimes(2);
  });

  it('renders already-read and forward-compatible report values', async () => {
    setup({
      notifications: [{
        ...notification,
        id: '11',
        isRead: true,
        problemType: 'FUTURE_TYPE',
        status: 'RESOLVED',
      }],
    });

    const report = await screen.findByRole('article', { name: 'Microscope' });
    expect(report).toHaveTextContent('Read');
    expect(report).toHaveTextContent('FUTURE_TYPE');
    expect(report).toHaveTextContent('RESOLVED');
    expect(screen.queryByRole('button', { name: /mark as read/i })).not.toBeInTheDocument();
  });

  it('ignores a notification response after unmounting', async () => {
    let finish;
    const onLoadNotifications = vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { unmount } = render(
      <AdminNotifications
        onLoadNotifications={onLoadNotifications}
        onMarkRead={vi.fn()}
      />,
    );

    unmount();
    finish({ notifications: [notification] });
    await waitFor(() => expect(screen.queryByText('Microscope')).not.toBeInTheDocument());
  });
});
