async function request(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined'
    && options.body instanceof FormData;
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
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

export async function getPendingBookings() {
  return request('/api/admin/bookings?status=PENDING');
}

export async function reviewBooking(id, decision) {
  return request(`/api/admin/bookings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(decision),
  });
}

export async function listUsers() {
  return request('/api/admin/users');
}

export async function updateUserRole(id, role) {
  return request(`/api/admin/users/${encodeURIComponent(id)}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export async function createResource(resource) {
  return request('/api/resources', {
    method: 'POST',
    body: JSON.stringify(resource),
  });
}

export async function listBookableResources() {
  return request('/api/resources');
}

export async function createBooking(booking) {
  return request('/api/bookings', {
    method: 'POST',
    body: JSON.stringify(booking),
  });
}

export async function extractResourceFromPdf(file) {
  const form = new FormData();
  form.append('file', file);
  return request('/api/resources/extract', {
    method: 'POST',
    body: form,
  });
}
