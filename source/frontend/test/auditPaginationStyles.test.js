import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

describe('Change History pagination styles', () => {
  it('does not show a loading cursor for disabled page-boundary buttons', () => {
    expect(styles).toMatch(/\.audit-pagination\s+\.button:disabled\s*\{[^}]*cursor:\s*not-allowed\s*;/);
  });
});
