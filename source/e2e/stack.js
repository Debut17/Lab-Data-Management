import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const PROJECT = 'lab-e2e';
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';

export function compose(...args) {
  execFileSync(
    'docker',
    [
      'compose',
      '-p', PROJECT,
      '-f', resolve(here, '../docker-compose.yml'),
      '-f', resolve(here, 'docker-compose.e2e.yml'),
      ...args,
    ],
    { stdio: 'inherit' },
  );
}
