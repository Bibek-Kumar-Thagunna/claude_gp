#!/usr/bin/env bash
set -Eeuo pipefail

for command in docker pnpm; do
  command -v "$command" >/dev/null || { printf 'Missing required command: %s\n' "$command" >&2; exit 1; }
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
container="gopasal-migration-test-${RANDOM}-$$"
workdir="$(mktemp -d)"
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf "$workdir"
}
trap cleanup EXIT

docker run -d --name "$container" -e POSTGRES_USER=gopasal -e POSTGRES_PASSWORD=test-only -e POSTGRES_DB=clean_install -P postgis/postgis:16-3.4 >/dev/null
for _ in {1..60}; do
  # The PostGIS image briefly accepts connections before its initialization
  # scripts restart PostgreSQL. Wait for the target database *and* extension,
  # otherwise Prisma can connect during that restart and only reports an opaque
  # schema-engine error.
  if docker logs "$container" 2>&1 | grep -q \
      "PostgreSQL init process complete; ready for start up" && \
    docker exec "$container" psql -U gopasal -d clean_install -Atqc \
      "SELECT 1 FROM pg_extension WHERE extname = 'postgis'" 2>/dev/null | grep -qx 1; then
    break
  fi
  sleep 1
done
docker exec "$container" pg_isready -U gopasal -d clean_install >/dev/null
docker exec "$container" psql -U gopasal -d clean_install -Atqc \
  "SELECT 1 FROM pg_extension WHERE extname = 'postgis'" | grep -qx 1
docker exec "$container" createdb -U gopasal upgrade_test
port="$(docker port "$container" 5432/tcp | awk -F: '/^0[.]0[.]0[.]0:/ { print $2; exit }')"
[[ "$port" =~ ^[0-9]+$ ]] || { printf 'Could not determine published PostgreSQL port.\n' >&2; exit 1; }

clean_url="postgresql://gopasal:test-only@127.0.0.1:${port}/clean_install?schema=public"
upgrade_url="postgresql://gopasal:test-only@127.0.0.1:${port}/upgrade_test?schema=public"
(cd "$repo_root" && DATABASE_URL="$clean_url" pnpm --filter @gopasal/api exec prisma migrate deploy)

mkdir -p "$workdir/prisma/migrations"
cp "$repo_root/apps/api/prisma/schema.prisma" "$workdir/prisma/schema.prisma"
cp "$repo_root/apps/api/prisma/migrations/migration_lock.toml" "$workdir/prisma/migrations/migration_lock.toml"
mapfile -t migrations < <(printf '%s\n' "$repo_root"/apps/api/prisma/migrations/*/ | sort)
if (( ${#migrations[@]} < 2 )); then
  printf 'Upgrade test requires at least two migrations.\n' >&2
  exit 1
fi
for migration in "${migrations[@]:0:${#migrations[@]}-1}"; do cp -R "$migration" "$workdir/prisma/migrations/"; done
(cd "$repo_root" && DATABASE_URL="$upgrade_url" pnpm --filter @gopasal/api exec prisma migrate deploy --schema "$workdir/prisma/schema.prisma")
(cd "$repo_root" && DATABASE_URL="$upgrade_url" pnpm --filter @gopasal/api exec prisma migrate deploy)

printf 'Migration clean-install and previous-to-current upgrade checks passed.\n'
