import { compose } from './stack.js';

export default async function globalTeardown() {
  if (process.env.E2E_BASE_URL || process.env.E2E_KEEP_STACK) return;
  compose('down', '-v', '--remove-orphans');
}
