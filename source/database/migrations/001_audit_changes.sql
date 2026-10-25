-- Safe to run on every Docker Compose startup. Fresh databases already have
-- this column; existing rows are preserved and remain NULL until new events.
SET @audit_changes_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'audit_logs'
    AND column_name = 'changes_json'
);
SET @audit_changes_sql = IF(
  @audit_changes_exists = 0,
  'ALTER TABLE audit_logs ADD COLUMN changes_json JSON NULL AFTER affected_record_id',
  'SELECT 1'
);
PREPARE audit_changes_statement FROM @audit_changes_sql;
EXECUTE audit_changes_statement;
DEALLOCATE PREPARE audit_changes_statement;
