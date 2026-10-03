#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  printf 'Usage: %s BACKUP.dump\n' "$0" >&2
  exit 2
fi

backup=$1
: "${RESTORE_DATABASE_URL:?set RESTORE_DATABASE_URL to the destination database}"
: "${TARGET_ENVIRONMENT:?set TARGET_ENVIRONMENT}"
: "${EXPECTED_DATABASE:?set EXPECTED_DATABASE to the destination database name}"
: "${CONFIRM_TARGET:?set CONFIRM_TARGET exactly as instructed below}"

expected="RESTORE ${TARGET_ENVIRONMENT}/${EXPECTED_DATABASE}"
if [[ "$CONFIRM_TARGET" != "$expected" ]]; then
  printf 'Destructive restore refused. Set CONFIRM_TARGET=%q after change approval.\n' "$expected" >&2
  exit 2
fi

for command in psql pg_restore sha256sum; do
  command -v "$command" >/dev/null || { printf 'Missing required command: %s\n' "$command" >&2; exit 1; }
done
[[ -f "$backup" ]] || { printf 'Backup not found: %s\n' "$backup" >&2; exit 1; }
[[ -f "${backup}.sha256" ]] || { printf 'Checksum not found: %s.sha256\n' "$backup" >&2; exit 1; }
(cd "$(dirname "$backup")" && sha256sum --check "$(basename "$backup").sha256")

actual_database="$(psql "$RESTORE_DATABASE_URL" -XAtqc 'select current_database()')"
if [[ "$actual_database" != "$EXPECTED_DATABASE" ]]; then
  printf 'Destructive restore refused: connected to %s, expected %s.\n' "$actual_database" "$EXPECTED_DATABASE" >&2
  exit 2
fi

pg_restore --dbname="$RESTORE_DATABASE_URL" --clean --if-exists --no-owner --no-privileges --exit-on-error "$backup"
psql "$RESTORE_DATABASE_URL" -Xv ON_ERROR_STOP=1 -c 'ANALYZE;'
printf 'Restore complete. Run application smoke tests before opening traffic.\n'
