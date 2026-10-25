import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const compose = readFileSync(new URL('../../docker-compose.yml', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../database/migrations/001_audit_changes.sql', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../../database/run-migrations.sh', import.meta.url), 'utf8');

describe('US-15 Docker migration contract', () => {
  test('runs the migration before starting the backend', () => {
    assert.match(compose, /mysql-migrate:/);
    assert.match(compose, /service_completed_successfully/);
    assert.match(compose, /\.\/database\/migrations\/001_audit_changes\.sql/);
    assert.match(compose, /\.\/database\/run-migrations\.sh/);
  });

  test('only adds the audit column when it is absent', () => {
    assert.match(migration, /information_schema\.columns/i);
    assert.match(migration, /column_name\s*=\s*'changes_json'/i);
    assert.match(migration, /ALTER TABLE audit_logs ADD COLUMN changes_json JSON NULL/i);
    assert.match(migration, /PREPARE/i);
  });

  test('runs against the configured database without printing a password', () => {
    assert.match(runner, /MYSQL_PWD/);
    assert.match(runner, /MYSQL_DATABASE/);
    assert.doesNotMatch(runner, /-p\$\{?MYSQL_PASSWORD/);
  });
});
