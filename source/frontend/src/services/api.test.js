import { afterEach, describe, expect, it, vi } from 'vitest';
import { archiveResource, listAdminResources, updateResourceAvailability } from './api.js';

import {
  cancelBooking,
  createBooking,
  createResource,
  devLogin,
  extractResourceFromPdf,
  getMyBookings,
  getPendingBookings,
  getSession,
  getAuditLogs,
  listResources,
  listUsers,
  logout,
  reviewBooking,
  updateUserRole,
} from './api.js';

function response({ ok = true, body = { data: {} } } = {}) {
  return { ok, json: vi.fn().mockResolvedValue(body) };
}

describe('API client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists admin resources and patches only availability with an encoded identifier', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetchMock);
    await listAdminResources();
    await updateResourceAvailability('resource/1', 'UNAVAILABLE');
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/admin/resources', expect.objectContaining({ credentials: 'same-origin' }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/admin/resources/resource%2F1/availability', expect.objectContaining({
      method: 'PATCH', credentials: 'same-origin', body: JSON.stringify({ availabilityStatus: 'UNAVAILABLE' }),
    }));
  });

  it('archives one resource by its encoded identifier', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetchMock);
    await archiveResource('resource/1');
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/resources/resource%2F1/archive', expect.objectContaining({
      method: 'POST', credentials: 'same-origin',
    }));
  });

  it('creates a resource with same-origin credentials', async () => {
    const saved = { id: 'resource-1', name: 'Microscope' };
    const fetchMock = vi.fn().mockResolvedValue(response({ body: { data: saved } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createResource({ name: 'Microscope' })).resolves.toEqual(saved);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/resources',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
    );
  });

  it('lists resources and creates a booking with same-origin credentials', async () => {
    const resources = [{ id: 'resource-1', name: 'Microscope' }];
    const booking = { id: 'booking-1', status: 'PENDING' };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ body: { data: resources } }))
      .mockResolvedValueOnce(response({ body: { data: booking } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listResources()).resolves.toEqual(resources);
    await expect(createBooking({ resourceId: 'resource-1' })).resolves.toEqual(booking);

    expect(fetchMock.mock.calls[0][0]).toBe('/api/resources');
    expect(fetchMock.mock.calls[1]).toEqual([
      '/api/bookings',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
    ]);
  });

  it('uses the local-login, session, and logout endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetchMock);

    await devLogin('admin@local.test');
    await getSession();
    await logout();

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      '/api/auth/dev-login',
      '/api/auth/session',
      '/api/auth/logout',
    ]);
  });

  it('loads the signed-in member own bookings', async () => {
    const bookings = { bookings: [{ id: 'booking-1', status: 'PENDING' }] };
    const fetchMock = vi.fn().mockResolvedValue(response({ body: { data: bookings } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getMyBookings()).resolves.toEqual(bookings);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/bookings',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('cancels one booking by its encoded identifier', async () => {
    const cancelled = { id: 'booking/1', status: 'CANCELLED' };
    const fetchMock = vi.fn().mockResolvedValue(response({ body: { data: cancelled } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(cancelBooking('booking/1')).resolves.toEqual(cancelled);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/bookings/booking%2F1',
      expect.objectContaining({ method: 'DELETE', credentials: 'same-origin' }),
    );
  });

  it('lists users and saves a role change for one user', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetchMock);

    await listUsers();
    await updateUserRole('user/1', 'LAB_STAFF');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/users');
    expect(fetchMock.mock.calls[1]).toEqual([
      '/api/admin/users/user%2F1/role',
      expect.objectContaining({
        method: 'PATCH',
        credentials: 'same-origin',
        body: JSON.stringify({ role: 'LAB_STAFF' }),
      }),
    ]);
  });

  it('loads a bounded audit history page with same-origin credentials', async () => {
    const payload = { auditLogs: [], hasMore: false };
    const fetchMock = vi.fn().mockResolvedValue(response({ body: { data: payload } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getAuditLogs(2, 20)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/audit-logs?page=2&limit=20',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('loads pending bookings and submits administrator decisions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetchMock);

    await getPendingBookings();
    await reviewBooking('booking-1', { decision: 'APPROVE' });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/admin/bookings?status=PENDING',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/admin/bookings/booking-1',
      expect.objectContaining({
        method: 'PATCH',
        credentials: 'same-origin',
        body: JSON.stringify({ decision: 'APPROVE' }),
      }),
    );
  });

  it('uploads a PDF as multipart form data without overriding its boundary', async () => {
    const suggestions = { name: 'Microscope', category: 'Equipment' };
    const fetchMock = vi.fn().mockResolvedValue(response({
      body: { data: suggestions },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['%PDF-1.7'], 'resource.pdf', {
      type: 'application/pdf',
    });

    await expect(extractResourceFromPdf(file)).resolves.toEqual(suggestions);

    const [path, options] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/resources/extract');
    expect(options.method).toBe('POST');
    expect(options.credentials).toBe('same-origin');
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get('file')).toBe(file);
    expect(options.headers['Content-Type']).toBeUndefined();
  });

  it('surfaces structured validation details and generic invalid responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          ok: false,
          body: {
            error: {
              message: 'Invalid resource.',
              details: [{ field: 'name', message: 'This field is required.' }],
            },
          },
        }),
      )
      .mockResolvedValueOnce({ ok: false, json: vi.fn().mockRejectedValue(new Error('bad json')) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(createResource({})).rejects.toThrow('name: This field is required.');
    await expect(getSession()).rejects.toThrow('The request could not be completed.');
  });
});
