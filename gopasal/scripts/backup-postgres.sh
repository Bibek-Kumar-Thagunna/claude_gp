#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${DATABASE_URL:?set DATABASE_URL to the source database}"
: "${TARGET_ENVIRONMENT:?set TARGET_ENVIRONMENT (for example production)}"
: "${EXPECTED_DATABASE:?set EXPECTED_DATABASE to the database name}"
: "${CONFIRM_TARGET:?set CONFIRM_TARGET exactly as instructed below}"

expected="BACKUP ${TARGET_ENVIRONMENT}/${EXPECTED_DATABASE}"
if [[ "$CONFIRM_TARGET" != "$expected" ]]; then
  printf 'Refusing backup. Set CONFIRM_TARGET=%q after verifying the source.\n' "$expected" >&2
  exit 2
fi

for command in psql pg_dump sha256sum; do
  command -v "$command" >/dev/null || { printf 'Missing required command: %s\n' "$command" >&2; exit 1; }
done

actual_database="$(psql "$DATABASE_URL" -XAtqc 'select current_database()')"
if [[ "$actual_database" != "$EXPECTED_DATABASE" ]]; then
  printf 'Refusing backup: connected to %s, expected %s.\n' "$actual_database" "$EXPECTED_DATABASE" >&2
  exit 2
fi

output="${1:-backup-${TARGET_ENVIRONMENT}-${EXPECTED_DATABASE}-$(date -u +%Y%m%dT%H%M%SZ).dump}"
if [[ -e "$output" || -e "${output}.sha256" ]]; then
  printf 'Refusing to overwrite %s or its checksum.\n' "$output" >&2
  exit 2
fi

pg_dump "$DATABASE_URL" --format=custom --compress=9 --no-owner --no-privileges --file="$output"
sha256sum "$output" > "${output}.sha256"
printf 'Backup complete: %s (verify restore in an isolated environment).\n' "$output"
