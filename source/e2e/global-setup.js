import { BASE_URL, compose } from './stack.js';

async function waitForApi(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // 401 means nginx reached the backend and the backend reached MySQL.
      const response = await fetch(`${BASE_URL}/api/auth/session`);
      if (response.status === 401) return;
    } catch {
      // The stack is still starting.
    }
    await new Promise((done) => setTimeout(done, 1_000));
  }
  throw new Error(`The app at ${BASE_URL} did not become ready in time.`);
}

export default async function globalSetup() {
  if (process.env.E2E_BASE_URL) {
    await waitForApi(10_000);
    return;
  }
  // Start from an empty database every run so the seed data is predictable.
  compose('down', '-v', '--remove-orphans');
  compose('up', '-d', '--build', 'frontend');
  await waitForApi();
}
