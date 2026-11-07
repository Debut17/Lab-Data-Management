#!/bin/sh
set -eu

: "${MYSQL_USER:?MYSQL_USER is required}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE is required}"

export MYSQL_PWD="$MYSQL_PASSWORD"

attempt=0
until mysql --protocol=tcp --host=mysql --user="$MYSQL_USER" "$MYSQL_DATABASE" \
  --execute='SELECT 1' >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo 'Database was not ready for migration.' >&2
    exit 1
  fi
  sleep 2
done

mysql --protocol=tcp --host=mysql --user="$MYSQL_USER" "$MYSQL_DATABASE" \
  < /migrations/001_audit_changes.sql >/dev/null
echo 'Audit migration complete.'

# US-7: Add resource problem reporting to existing databases without deleting data.
mysql --protocol=tcp --host=mysql --user="$MYSQL_USER" "$MYSQL_DATABASE" \
  < /migrations/002_resource_reports.sql >/dev/null
echo 'Resource reports migration complete.'
# US-7: Add resource problem reporting to existing databases without deleting data.

# Restore the local Staff demo account on older development databases without reseeding other data.
if [ "${ALLOW_DEV_LOGIN:-false}" = 'true' ]; then
  mysql --protocol=tcp --host=mysql --user="$MYSQL_USER" "$MYSQL_DATABASE" <<'SQL'
INSERT INTO users (id, email, display_name, role, is_active)
VALUES (UUID(), 'staff@local.test', 'Local Lab Staff', 'LAB_STAFF', TRUE)
ON DUPLICATE KEY UPDATE is_active = TRUE;
SQL
  echo 'Local Staff review account initialization complete.'
fi
