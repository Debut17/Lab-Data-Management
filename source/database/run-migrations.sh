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
