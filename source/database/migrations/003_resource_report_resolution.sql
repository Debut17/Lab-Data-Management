SET @resolution_note_sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE resource_reports ADD COLUMN resolution_note VARCHAR(2000) NULL AFTER status',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'resource_reports'
    AND column_name = 'resolution_note'
);
PREPARE resolution_note_statement FROM @resolution_note_sql;
EXECUTE resolution_note_statement;
DEALLOCATE PREPARE resolution_note_statement;

SET @updated_by_sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE resource_reports ADD COLUMN status_updated_by CHAR(36) NULL AFTER resolution_note',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'resource_reports'
    AND column_name = 'status_updated_by'
);
PREPARE updated_by_statement FROM @updated_by_sql;
EXECUTE updated_by_statement;
DEALLOCATE PREPARE updated_by_statement;

SET @updated_at_sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE resource_reports ADD COLUMN status_updated_at DATETIME(3) NULL AFTER status_updated_by',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'resource_reports'
    AND column_name = 'status_updated_at'
);
PREPARE updated_at_statement FROM @updated_at_sql;
EXECUTE updated_at_statement;
DEALLOCATE PREPARE updated_at_statement;

SET @updated_by_fk_sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE resource_reports ADD CONSTRAINT fk_resource_reports_status_updated_by FOREIGN KEY (status_updated_by) REFERENCES users(id)',
    'SELECT 1')
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'resource_reports'
    AND constraint_name = 'fk_resource_reports_status_updated_by'
);
PREPARE updated_by_fk_statement FROM @updated_by_fk_sql;
EXECUTE updated_by_fk_statement;
DEALLOCATE PREPARE updated_by_fk_statement;
