import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('production Nginx configuration', () => {
  it('serves the Vite build from the directory populated by the Dockerfile', () => {
    const config = readFileSync(path.join(process.cwd(), 'nginx.conf'), 'utf8');

    expect(config).toContain('root /usr/share/nginx/html;');
    expect(config).toContain('try_files $uri /index.html;');
  });
});
