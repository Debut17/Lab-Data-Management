-- Apply once to an existing database before deploying the US-15 audit writers.
-- Fresh installations already include this column in schema.sql.
-- Historical rows intentionally remain NULL: their before/after values cannot be recovered.
ALTER TABLE audit_logs
  ADD COLUMN changes_json JSON NULL AFTER affected_record_id;
