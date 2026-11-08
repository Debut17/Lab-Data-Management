-- US-7: Preserve existing records; safe to run again on every startup.
-- US-7: Upgrade older user role enums so Lab Staff accounts can be stored.
SET @staff_role_sql = (
  SELECT IF(
    data_type = 'enum' AND LOCATE('''LAB_STAFF''', column_type) = 0,
    CONCAT(
      'ALTER TABLE users MODIFY COLUMN role ',
      LEFT(column_type, CHAR_LENGTH(column_type) - 1), ',''LAB_STAFF'')',
      IF(is_nullable = 'YES', ' NULL', ' NOT NULL'),
      IF(column_default IS NULL, '', CONCAT(' DEFAULT ', QUOTE(column_default)))
    ),
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'role'
);
PREPARE staff_role_statement FROM @staff_role_sql;
EXECUTE staff_role_statement;
DEALLOCATE PREPARE staff_role_statement;

CREATE TABLE IF NOT EXISTS resource_reports (
  id CHAR(36) PRIMARY KEY,
  resource_id CHAR(36) NOT NULL,
  problem_type ENUM('INCORRECT_RECORD', 'DAMAGE', 'MALFUNCTION', 'OTHER') NOT NULL,
  description VARCHAR(2000) NOT NULL,
  reporter_id CHAR(36) NOT NULL,
  submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  status ENUM('PENDING', 'IN_PROGRESS', 'RESOLVED') NOT NULL DEFAULT 'PENDING',
  CONSTRAINT fk_resource_reports_resource FOREIGN KEY (resource_id) REFERENCES resources(id),
  CONSTRAINT fk_resource_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users(id),
  INDEX idx_resource_reports_status (status, submitted_at),
  INDEX idx_resource_reports_resource (resource_id, submitted_at),
  INDEX idx_resource_reports_reporter (reporter_id, submitted_at)
);
