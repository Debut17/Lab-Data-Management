import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createResource,
  devLogin,
  extractResourceFromPdf,
  getSession,
  logout,
} from './api.js';

function response({ ok = true, body = { data: {} } } = {}) {
  return { ok, json: vi.fn().mockResolvedValue(body) };
}

describe('API client', () => {
  afterEach(() => vi.unstubAllGlobals());

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
