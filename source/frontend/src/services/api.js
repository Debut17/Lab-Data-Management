async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const details = body?.error?.details;
    const detailMessage = Array.isArray(details)
      ? details.map((detail) => `${detail.field}: ${detail.message}`).join(' ')
      : '';
    throw new Error(detailMessage || body?.error?.message || 'The request could not be completed.');
  }
  return body?.data;
}

export async function getSession() {
  return request('/api/auth/session');
}

export async function devLogin(email) {
  return request('/api/auth/dev-login', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function logout() {
  await request('/api/auth/logout', { method: 'POST' });
}

export async function createResource(resource) {
  return request('/api/resources', {
    method: 'POST',
    body: JSON.stringify(resource),
  });
}
