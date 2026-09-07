#!/usr/bin/env bash
#
# db-doctor.sh — diagnose and repair the local PostgreSQL used by GoPasal.
#
# Written for exactly one symptom:
#
#   PrismaClientInitializationError: Authentication failed against database
#   server at `localhost`, the provided database credentials for `gopasal`
#   are not valid.
#
# ...in the case where apps/api/.env and docker-compose.yml ALREADY agree.
# When they agree, the fault is server-side, and there are only three plausible
# servers to blame:
#
#   (A) A stale data volume. POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB are
#       read by `initdb` ONLY when the data directory is empty. If the named
#       volume already existed from an earlier run of an earlier compose file,
#       today's password is silently ignored and yesterday's cluster — with
#       yesterday's password — is what you are talking to.
#   (B) A different PostgreSQL owns host port 5432 (Homebrew, apt, Postgres.app,
#       another compose project). Your connection never reaches the container.
#       PostgreSQL deliberately answers "password authentication failed" rather
#       than "role does not exist", so (A) and (B) look identical from Prisma.
#   (C) The container is not running, or is unhealthy / still initialising.
#
# Read-only by default. `--repair` performs ONLY additive, in-place fixes:
#   ALTER ROLE ... PASSWORD | CREATE ROLE | CREATE DATABASE | CREATE EXTENSION
# It never runs DROP, never `docker compose down -v`, never `docker volume rm`,
# and never `prisma migrate reset`. Your data is not touched.
#
# Usage:
#   ./scripts/db-doctor.sh            # diagnose only
#   ./scripts/db-doctor.sh --repair   # diagnose, then fix what it found
#
# `set -u` is deliberately omitted: this must also run under the bash 3.2 that
# ships with macOS, where expanding an empty array under -u is an error.
set -o pipefail

CONTAINER="gopasal-postgres"
REDIS_CONTAINER="gopasal-redis"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/apps/api/.env"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
REPAIR=0
[[ "${1:-}" == "--repair" ]] && REPAIR=1

# ── output helpers ───────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  B=$'\033[1m'; R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; C=$'\033[36m'; Z=$'\033[0m'
else
  B=''; R=''; G=''; Y=''; C=''; Z=''
fi
step() { printf '\n%s── %s %s\n' "$B$C" "$*" "$Z"; }
ok()   { printf '  %s✔%s %s\n' "$G" "$Z" "$*"; }
bad()  { printf '  %sx%s %s\n' "$R" "$Z" "$*"; }
warn() { printf '  %s!%s %s\n' "$Y" "$Z" "$*"; }
info() { printf '    %s\n' "$*"; }
die()  { printf '\n%sAborted:%s %s\n' "$R" "$Z" "$*" >&2; exit 1; }

FINDINGS=()
note() { FINDINGS+=("$1"); }

# ── 1. what the application believes ─────────────────────────────────────────
step "1. Credentials the application is configured with"

[[ -f "$ENV_FILE" ]] || die "apps/api/.env not found. Copy apps/api/.env.example to apps/api/.env first."

# Strip surrounding quotes (\042 = ", \047 = ') and any CR from a value.
unquote() { tr -d '\042\047\015'; }

DB_URL="$(grep -E '^[[:space:]]*DATABASE_URL=' "$ENV_FILE" | tail -1 | cut -d= -f2- | unquote)"
[[ -n "$DB_URL" ]] || die "DATABASE_URL is not set in apps/api/.env"

# postgresql://USER:PASS@HOST:PORT/DB?params
_rest="${DB_URL#*://}"
_creds="${_rest%%@*}"
_hostpart="${_rest#*@}"
APP_USER="${_creds%%:*}"
APP_PASS="${_creds#*:}"
APP_HOST="${_hostpart%%:*}"
_portdb="${_hostpart#*:}"
APP_PORT="${_portdb%%/*}"
_db="${_portdb#*/}"
APP_DB="${_db%%\?*}"

info "user     $APP_USER"
info "database $APP_DB"
info "host     $APP_HOST:$APP_PORT"
info "password ${#APP_PASS} characters (not printed)"

# Redis is read from discrete vars (see apps/api/src/config/configuration.ts), not
# a URL. It shares the port-collision hazard, so it is checked alongside.
REDIS_HOST_ENV="$(grep -E '^[[:space:]]*REDIS_HOST=' "$ENV_FILE" | tail -1 | cut -d= -f2- | unquote)"
REDIS_PORT_ENV="$(grep -E '^[[:space:]]*REDIS_PORT=' "$ENV_FILE" | tail -1 | cut -d= -f2- | unquote)"
: "${REDIS_HOST_ENV:=localhost}"
: "${REDIS_PORT_ENV:=6379}"
info "redis    $REDIS_HOST_ENV:$REDIS_PORT_ENV"

# Cross-check against docker-compose.yml so a genuine typo is caught before we
# start blaming the server.
CU="$APP_USER"; CP="$APP_PASS"; CD="$APP_DB"   # fall back to .env if compose is absent
if [[ -f "$COMPOSE_FILE" ]]; then
  CU="$(grep -E 'POSTGRES_USER:'     "$COMPOSE_FILE" | head -1 | sed 's/.*: *//' | unquote)"
  CP="$(grep -E 'POSTGRES_PASSWORD:' "$COMPOSE_FILE" | head -1 | sed 's/.*: *//' | unquote)"
  CD="$(grep -E 'POSTGRES_DB:'       "$COMPOSE_FILE" | head -1 | sed 's/.*: *//' | unquote)"

  # The HOST port compose will actually publish. Resolved by scripts/db-ports.mjs,
  # which expands ${VAR:-default} and ./.env exactly as compose does: the mapping
  # may be "port:5432", "addr:port:5432", with substitutions in either half, and a
  # sed one-liner gets that wrong — the ":-" of a default looks like an address
  # separator. The sed path is kept only as a fallback for a host without node.
  CPORT=""; RCPORT=""
  if command -v node >/dev/null 2>&1 && [[ -f "$REPO_ROOT/scripts/db-ports.mjs" ]]; then
    CPORT="$(node "$REPO_ROOT/scripts/db-ports.mjs" print postgres 2>/dev/null | awk '{print $2}')"
    RCPORT="$(node "$REPO_ROOT/scripts/db-ports.mjs" print redis 2>/dev/null | awk '{print $2}')"
  fi
  if [[ -z "$CPORT" ]]; then
    CPORT="$(grep -E '^[[:space:]]*-[[:space:]]*"?[^"[:space:]]*:5432"?[[:space:]]*$' "$COMPOSE_FILE" \
             | head -1 | unquote | sed 's/^[[:space:]]*-[[:space:]]*//; s/:5432[[:space:]]*$//')"
    case "$CPORT" in
      '${POSTGRES_HOST_PORT:-'*'}')
        # Let a genuinely exported override win over the compose default.
        CPORT="${POSTGRES_HOST_PORT:-$(printf '%s' "$CPORT" | sed 's/^.*:-//; s/}$//')}" ;;
      '${'*)   CPORT="" ;;              # some other substitution — cannot resolve, skip
      *:*)     CPORT="${CPORT##*:}" ;;  # "127.0.0.1:15432" -> "15432"
    esac
  fi
  case "$CPORT" in (*[!0-9]*) CPORT="" ;; esac
  case "$RCPORT" in (*[!0-9]*) RCPORT="" ;; esac

  mismatch=0
  [[ "$CU" == "$APP_USER" ]] || { bad "compose POSTGRES_USER ($CU) != .env user ($APP_USER)";     mismatch=1; }
  [[ "$CD" == "$APP_DB"   ]] || { bad "compose POSTGRES_DB ($CD) != .env database ($APP_DB)";     mismatch=1; }
  [[ "$CP" == "$APP_PASS" ]] || { bad "compose POSTGRES_PASSWORD differs from the .env password"; mismatch=1; }
  if [[ -n "$CPORT" && "$CPORT" != "$APP_PORT" ]]; then
    bad "compose publishes PostgreSQL on host port $CPORT but .env connects to $APP_PORT"
    note "PORT DRIFT — this is how you end up authenticating against a different PostgreSQL."
    note "  Move both sides together, so they cannot drift again:"
    note "      pnpm db:setports $CPORT $REDIS_PORT_ENV"
    mismatch=1
  fi
  if [[ -n "$RCPORT" && "$RCPORT" != "$REDIS_PORT_ENV" ]]; then
    bad "compose publishes Redis on host port $RCPORT but .env REDIS_PORT is $REDIS_PORT_ENV"
    note "Redis port drift — 'pnpm db:setports ${CPORT:-$APP_PORT} $RCPORT' sets both files at once."
    mismatch=1
  fi
  if (( mismatch )); then
    note "docker-compose.yml and apps/api/.env disagree — fix .env to match compose, then re-run."
  else
    ok "apps/api/.env matches docker-compose.yml exactly (user, password, database, both host ports)"
    info "So this is not a config typo. The credentials that matter now are the ones"
    info "baked into the running cluster, which is what the rest of this script reads."
  fi
fi

# ── 2. is the container even there ───────────────────────────────────────────
step "2. Container state"

command -v docker >/dev/null 2>&1 || die "docker is not on PATH. Start Docker Desktop / install Docker, then re-run."
docker info >/dev/null 2>&1 || die "the Docker daemon is not responding. Start Docker, then re-run."

CSTATE="$(docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null)"
if [[ -z "$CSTATE" ]]; then
  bad "container '$CONTAINER' does not exist"
  note "Container missing — run 'pnpm db:up' (docker compose up -d) and re-run this script."
  CONTAINER_UP=0
elif [[ "$CSTATE" != "running" ]]; then
  bad "container '$CONTAINER' exists but is '$CSTATE'"
  note "Container not running — 'pnpm db:up', then re-run. (Cause C.)"
  CONTAINER_UP=0
else
  CONTAINER_UP=1
  CHEALTH="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER")"
  ok "running (health: $CHEALTH)"

  # A first-ever start runs initdb, during which postgres listens on the unix
  # socket ONLY. Probing TCP before that finishes yields "Connection refused",
  # which is easy to misread as "wrong password". So wait for health rather than
  # racing it — up to 90s, which is generous for initdb + the PostGIS scripts.
  if [[ "$CHEALTH" == "starting" ]]; then
    printf '    waiting for the cluster to finish initialising'
    for _ in $(seq 1 45); do
      CHEALTH="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER")"
      [[ "$CHEALTH" != "starting" ]] && break
      printf '.'; sleep 2
    done
    printf '\n'
    if [[ "$CHEALTH" == "healthy" ]]; then
      ok "cluster finished initialising (health: healthy)"
    else
      warn "still '$CHEALTH' after 90s — the checks below may be premature"
    fi
  fi

  if [[ "$CHEALTH" == "unhealthy" ]]; then
    bad "healthcheck failing: pg_isready -U $CU -d $CD cannot connect inside the container"
    info "Last 20 log lines:"
    docker logs --tail 20 "$CONTAINER" 2>&1 | sed 's/^/      /'
    note "Container unhealthy (cause C) — read the log lines above before anything else."
  fi

  # The env the container was CREATED with may differ from today's compose file,
  # and — critically — differs from the cluster if the volume predates it.
  echo
  info "Environment this container was created with (initdb only honours these on an empty volume):"
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$CONTAINER" \
    | grep -E '^POSTGRES_(USER|DB)=' | sed 's/^/      /'
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$CONTAINER" \
    | grep -q '^POSTGRES_PASSWORD=' && info "      POSTGRES_PASSWORD=(set, not printed)"
fi

# ── 3. who actually owns port 5432 (cause B) ─────────────────────────────────
step "3. Who owns $APP_HOST:$APP_PORT"

FOREIGN_PG=0
NOT_PUBLISHED=0

# Before asking who is there, ask whether GoPasal can have the port at all. The
# bind is the only authoritative test — it is literally what the Docker daemon
# does, and a failed bind aborts the whole `docker compose up`, leaving the other
# container in 'created' state and the real cause two layers down.
PORTS_BINDABLE=1
if command -v node >/dev/null 2>&1 && [[ -f "$REPO_ROOT/scripts/db-ports.mjs" ]]; then
  PORTS_OUT="$(node "$REPO_ROOT/scripts/db-ports.mjs" check 2>&1)"
  PORTS_RC=$?
  printf '%s\n' "$PORTS_OUT" | grep -v '^[[:space:]]*$' | sed 's/^/    /'
  if (( PORTS_RC != 0 )); then
    PORTS_BINDABLE=0
    note "A configured host port cannot be bound (see 'db:portcheck' output in step 3)."
    note "  Nothing needs to be stopped — take a port this machine will give you:"
    note "      pnpm db:portfind      then      pnpm db:setports <postgres> <redis>"
    note "      pnpm db:down && pnpm db:up     (no -v anywhere; volumes are preserved)"
  fi
fi

if (( CONTAINER_UP )); then
  PUB="$(docker port "$CONTAINER" 5432/tcp 2>/dev/null | head -1)"
  if [[ -z "$PUB" ]]; then
    NOT_PUBLISHED=1
    bad "the container publishes NO host port for 5432"
    info "HostConfig.PortBindings: $(docker inspect -f '{{json .HostConfig.PortBindings}}' "$CONTAINER" 2>/dev/null)"
    info "NetworkSettings.Ports:   $(docker inspect -f '{{json .NetworkSettings.Ports}}' "$CONTAINER" 2>/dev/null)"

    # If compose declares a mapping the container does not have, the container is
    # older than the compose file: `docker compose up -d` starts an existing
    # container and only recreates it when it notices a config change, and a
    # container created before the `ports:` line was added keeps no binding.
    # The host side may be a literal (5432) or a substitution
    # (${POSTGRES_HOST_PORT:-5432}), so match anything that ends at ":5432".
    if grep -qE '^[[:space:]]*-[[:space:]]*"?[^"[:space:]]*:5432"?[[:space:]]*$' "$COMPOSE_FILE" 2>/dev/null; then
      bad "docker-compose.yml DOES declare a mapping to 5432, but this container has none"
      note "CAUSE B/C CONFIRMED: this container predates the 'ports:' mapping in"
      note "  docker-compose.yml, so nothing on the host reaches it — yet something else IS"
      note "  answering on $APP_PORT (see the probe below). Recreate the container to pick up"
      note "  the mapping; the named volume and all its data are preserved:"
      note "      pnpm db:recreate       (docker compose up -d --force-recreate postgres redis)"
      note "  If that fails with 'port is already allocated', pick a free host port instead of"
      note "  touching the other service — nothing needs to be stopped:"
      note "      pnpm db:portfind      then      pnpm db:setports <postgres> <redis>"
      note "  and set the matching ports in apps/api/.env (DATABASE_URL, REDIS_PORT)."
    else
      note "No mapping to container port 5432 in docker-compose.yml — add"
      note "  'ports: - \"127.0.0.1:15432:5432\"' to the postgres service, then 'pnpm db:up'."
    fi
  else
    ok "container publishes 5432 -> $PUB"
    HOSTPORT="${PUB##*:}"
    if [[ "$HOSTPORT" != "$APP_PORT" ]]; then
      bad "container is on host port $HOSTPORT but .env connects to $APP_PORT"
      note "Port mismatch — point DATABASE_URL at port $HOSTPORT, or fix the compose mapping."
    fi
  fi

  # Any OTHER container publishing the same host port is a direct hijack.
  OTHERS="$(docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}' 2>/dev/null \
            | grep -E "(^|[^0-9])$APP_PORT->" | grep -v "^$CONTAINER	" )"
  if [[ -n "$OTHERS" ]]; then
    FOREIGN_PG=1
    bad "another container already publishes host port $APP_PORT:"
    printf '%s\n' "$OTHERS" | sed 's/^/      /'
    note "CAUSE B CONFIRMED: the container above owns host port $APP_PORT, so your app talks"
    note "  to it instead of $CONTAINER. Leave it alone and move GoPasal to a free host port:"
    note "      pnpm db:portfind   then   pnpm db:setports <postgres> <redis>   then   pnpm db:up"
  fi
fi

# A second PostgreSQL listening on the same port is the classic false lead: your
# credentials are correct for the container, but you never reach the container.
# Track WHICH tool answered: "the tool found nothing" and "there was no tool" are
# different findings, and reporting the first as the second reads as a skipped
# check — which is how a silently skipped check gets mistaken for a passing one.
LISTENERS=""
LISTER=""
if command -v lsof >/dev/null 2>&1; then
  LISTER="lsof"
  LISTENERS="$(lsof -nP -iTCP:"$APP_PORT" -sTCP:LISTEN 2>/dev/null | tail -n +2)"
elif command -v ss >/dev/null 2>&1; then
  LISTER="ss"
  LISTENERS="$(ss -ltnp 2>/dev/null | grep ":$APP_PORT ")"
elif [[ -r /proc/net/tcp ]]; then
  # Neither lsof nor ss (common on minimal Linux images). /proc is enough: find the
  # listening socket's inode, then find which process holds that inode as an fd.
  LISTER="/proc/net/tcp"
  HEXPORT="$(printf '%04X' "$APP_PORT")"
  INODE="$(awk -v p=":$HEXPORT" '$4=="0A" && $2 ~ p"$" {print $10; exit}' /proc/net/tcp 2>/dev/null)"
  if [[ -n "$INODE" ]]; then
    for pid in $(ls /proc 2>/dev/null | grep -E '^[0-9]+$'); do
      if ls -l /proc/"$pid"/fd 2>/dev/null | grep -q "socket:\[$INODE\]"; then
        LISTENERS="pid $pid  $(tr '\0' ' ' < /proc/"$pid"/cmdline 2>/dev/null)"
        break
      fi
    done
    [[ -z "$LISTENERS" ]] && LISTENERS="socket inode $INODE is listening, but its process is not readable (owned by root?)"
  fi
fi
if [[ -n "$LISTENERS" ]]; then
  info "Listening on $APP_PORT:"
  printf '%s\n' "$LISTENERS" | sed 's/^/      /'
  if printf '%s\n' "$LISTENERS" | grep -Eqi 'postgres|pg_ctl'; then
    FOREIGN_PG=1
    bad "a native PostgreSQL process (not Docker) is listening on $APP_PORT"
    note "CAUSE B CONFIRMED: a host PostgreSQL is intercepting $APP_PORT. Your container is"
    note "  never reached, and that server has no 'gopasal' role — which PostgreSQL reports"
    note "  as 'password authentication failed', not 'role does not exist'. Do NOT stop that"
    note "  service; give GoPasal a host port of its own instead:"
    note "      pnpm db:portfind   then   pnpm db:setports <postgres> <redis>   then   pnpm db:up"
  elif printf '%s\n' "$LISTENERS" | grep -Eqi 'docker-proxy|containerd'; then
    ok "the listener on $APP_PORT is Docker's proxy"
  fi
elif [[ -n "$LISTER" ]]; then
  ok "$LISTER reports no foreign process listening on $APP_PORT"
else
  warn "could not enumerate listeners (no lsof, no ss, no readable /proc/net/tcp)"
  info "The bind test above is unaffected: it does not need to name the occupant."
fi

# Protocol-level probe from the HOST — the same path Prisma takes. Needs no psql:
# it speaks the PostgreSQL startup handshake directly over a socket.
PROBE_IS_PG=0
if command -v node >/dev/null 2>&1 && [[ -f "$REPO_ROOT/scripts/pg-probe.mjs" ]]; then
  echo
  info "Host-side probe of $APP_HOST:$APP_PORT (this is the path Prisma uses):"
  PROBE_OUT="$(node "$REPO_ROOT/scripts/pg-probe.mjs" "$APP_HOST" "$APP_PORT" "$APP_USER" "$APP_DB" 2>&1)"
  [[ $? -eq 0 ]] && PROBE_IS_PG=1
  printf '%s\n' "$PROBE_OUT" | sed 's/^/      /'

  # A PostgreSQL answering the app's host:port while OUR container is either not
  # running or not publishing that port can only be somebody else's server. This
  # is the single most misread situation, so it gets stated outright — and it is
  # decisive even when lsof/ss are unavailable to name the owner.
  if (( PROBE_IS_PG )) && ( (( NOT_PUBLISHED )) || (( ! CONTAINER_UP )) ); then
    FOREIGN_PG=1
    if (( ! CONTAINER_UP )); then
      bad "a PostgreSQL answers $APP_HOST:$APP_PORT while '$CONTAINER' is NOT running"
      note "DECISIVE: the server your app reaches on $APP_PORT is not GoPasal's — GoPasal's is"
      note "  stopped. Do not stop that server; give GoPasal its own host port instead:"
    else
      bad "a PostgreSQL answers $APP_HOST:$APP_PORT but '$CONTAINER' publishes no host port"
      note "DECISIVE: whatever Prisma authenticates against is NOT this container, so repairing"
      note "  the container's password cannot fix it. Give GoPasal its own host port:"
    fi
    note "      pnpm db:recreate      (docker compose up -d --force-recreate postgres redis)"
    note "  docker-compose.yml publishes PostgreSQL on host 127.0.0.1:15432 and Redis on"
    note "  127.0.0.1:6380 to stay clear of the servers already on 5432/5433/6379, and"
    note "  apps/api/.env is set to match. If this message names a port you did not choose,"
    note "  apps/api/.env has drifted — see step 1. If the port above is occupied, take"
    note "  another; nothing needs to be stopped:"
    note "      pnpm db:portfind      then      pnpm db:setports <postgres> <redis>"
  fi
fi

# ── 3b. Redis, which fails the same way for the same reason ──────────────────
# A Redis already on the host port does not produce an auth error — it produces
# silent success against the wrong data, or a hard bind failure that leaves the
# whole `docker compose up` half-applied (which is how the postgres container ends
# up in 'created' state). So it is checked here, not left to be discovered later.
step "3b. Redis host port"

RSTATE="$(docker inspect -f '{{.State.Status}}' "$REDIS_CONTAINER" 2>/dev/null)"
if [[ -z "$RSTATE" ]]; then
  bad "container '$REDIS_CONTAINER' does not exist — run 'pnpm db:up'"
elif [[ "$RSTATE" != "running" ]]; then
  bad "container '$REDIS_CONTAINER' exists but is '$RSTATE'"
  note "Redis container is '$RSTATE'. If it failed to bind its host port, 'docker compose up'"
  note "  aborts partway and leaves postgres in 'created' — recreate both together:"
  note "      pnpm db:recreate"
else
  RPUB="$(docker port "$REDIS_CONTAINER" 6379/tcp 2>/dev/null | head -1)"
  if [[ -z "$RPUB" ]]; then
    bad "'$REDIS_CONTAINER' publishes NO host port for 6379"
  else
    ok "container publishes 6379 -> $RPUB"
    RHOSTPORT="${RPUB##*:}"
    if [[ "$RHOSTPORT" != "$REDIS_PORT_ENV" ]]; then
      bad "Redis is on host port $RHOSTPORT but apps/api/.env REDIS_PORT is $REDIS_PORT_ENV"
      note "Set REDIS_PORT=$RHOSTPORT in apps/api/.env (or change the compose mapping)."
    fi
  fi
  # PING over the host path, then over the container, so a wrong-server situation
  # is distinguishable from a dead server.
  if (exec 3<>"/dev/tcp/$REDIS_HOST_ENV/$REDIS_PORT_ENV") 2>/dev/null; then
    ok "TCP connect to $REDIS_HOST_ENV:$REDIS_PORT_ENV succeeds"
  else
    bad "TCP connect to $REDIS_HOST_ENV:$REDIS_PORT_ENV refused"
    note "Nothing is listening on Redis port $REDIS_PORT_ENV — 'pnpm db:recreate'."
  fi
  if docker exec "$REDIS_CONTAINER" redis-cli ping 2>/dev/null | grep -q PONG; then
    ok "$REDIS_CONTAINER answers PING"
  else
    warn "$REDIS_CONTAINER did not answer PING"
  fi
fi

# ── 4. volume provenance (cause A) ───────────────────────────────────────────
step "4. Data volume provenance — was today's password ever applied?"

STALE_VOLUME=0
if (( CONTAINER_UP )); then
  # Resolve the volume name from the container rather than guessing the compose
  # project prefix (compose names it "<project>_gopasal_pgdata").
  VOL="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$CONTAINER" 2>/dev/null)"
  if [[ -z "$VOL" ]]; then
    warn "no named volume mounted at /var/lib/postgresql/data (data is in the container layer)"
  else
    ok "volume: $VOL"
    VOL_CREATED="$(docker volume inspect -f '{{.CreatedAt}}' "$VOL" 2>/dev/null)"
    CONT_CREATED="$(docker inspect -f '{{.Created}}' "$CONTAINER" 2>/dev/null)"
    info "volume created:    $VOL_CREATED"
    info "container created: $CONT_CREATED"

    # PG_VERSION is written once by initdb; its mtime is the cluster's true birthday.
    CLUSTER_BORN="$(docker exec "$CONTAINER" stat -c '%y' /var/lib/postgresql/data/PG_VERSION 2>/dev/null)"
    [[ -n "$CLUSTER_BORN" ]] && info "cluster initdb'd:  $CLUSTER_BORN"

    if [[ -n "$CLUSTER_BORN" ]]; then
      born_epoch="$(docker exec "$CONTAINER" stat -c '%Y' /var/lib/postgresql/data/PG_VERSION 2>/dev/null)"
      if [[ -r "$COMPOSE_FILE" ]]; then
        compose_epoch="$(stat -c '%Y' "$COMPOSE_FILE" 2>/dev/null || stat -f '%m' "$COMPOSE_FILE" 2>/dev/null)"
        if [[ -n "$born_epoch" && -n "$compose_epoch" ]] && (( born_epoch < compose_epoch )); then
          # A WEAK signal on its own, and deliberately not reported as a fault
          # here. Every edit to docker-compose.yml moves its mtime — changing a
          # host port, or even a comment, is enough — so this ordering is the
          # normal state of any repo whose compose file was touched after the
          # cluster was first created. It only means "the current
          # POSTGRES_PASSWORD *might* never have been applied", and step 6
          # answers that question directly by attempting the login. The finding
          # is therefore deferred to the verdict, where it is emitted only if
          # authentication actually failed.
          STALE_VOLUME=1
          warn "the cluster was initialised BEFORE docker-compose.yml was last edited"
          info "On its own this proves nothing: any edit to the compose file (a port, a"
          info "comment) moves its mtime. It matters only if the login in step 6 fails,"
          info "because initdb reads POSTGRES_PASSWORD only on an empty data directory."
        else
          ok "cluster is at least as new as docker-compose.yml"
        fi
      fi
    fi
  fi
fi

# ── 5. what the cluster actually contains ────────────────────────────────────
step "5. Roles and databases that actually exist in the cluster"

SUPER=""
ROLE_EXISTS=0
DB_EXISTS=0

if (( CONTAINER_UP )); then
  # The official entrypoint runs initdb with --auth-local=trust, so a connection
  # over the container's unix socket needs no password. That is the non-destructive
  # way in: we can read and repair the cluster without knowing its password and
  # without touching the volume.
  CONT_USER="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$CONTAINER" | sed -n 's/^POSTGRES_USER=//p' | head -1)"
  for cand in "$CONT_USER" postgres "$APP_USER"; do
    [[ -n "$cand" ]] || continue
    if docker exec "$CONTAINER" psql -U "$cand" -d postgres -tAc 'select 1' >/dev/null 2>&1; then
      SUPER="$cand"; break
    fi
  done

  if [[ -z "$SUPER" ]]; then
    bad "could not open a local socket session as any of: $CONT_USER, postgres, $APP_USER"
    note "No bootstrap role reachable over the unix socket. Inspect 'docker logs $CONTAINER'"
    note "  — the cluster may have failed to initialise."
  else
    ok "reached the cluster over the unix socket as bootstrap role '$SUPER'"
    psqll() { docker exec "$CONTAINER" psql -U "$SUPER" -d postgres -tAc "$1" 2>/dev/null; }

    echo
    info "Roles (name | superuser | createdb | login | has password):"
    docker exec "$CONTAINER" psql -U "$SUPER" -d postgres -tA -F ' | ' -c \
      "select r.rolname, r.rolsuper, r.rolcreatedb, r.rolcanlogin, (s.rolpassword is not null)
         from pg_roles r left join pg_authid s on s.oid = r.oid
        where r.rolname not like 'pg\\_%' order by 1;" 2>/dev/null | sed 's/^/      /'

    echo
    info "Databases (name | owner | encoding):"
    docker exec "$CONTAINER" psql -U "$SUPER" -d postgres -tA -F ' | ' -c \
      "select d.datname, pg_get_userbyid(d.datdba), pg_encoding_to_char(d.encoding)
         from pg_database d where not d.datistemplate order by 1;" 2>/dev/null | sed 's/^/      /'

    [[ "$(psqll "select 1 from pg_roles where rolname='$APP_USER';")" == "1" ]] && ROLE_EXISTS=1
    [[ "$(psqll "select 1 from pg_database where datname='$APP_DB';")" == "1" ]] && DB_EXISTS=1

    echo
    (( ROLE_EXISTS )) && ok "role '$APP_USER' exists" || bad "role '$APP_USER' does NOT exist"
    (( DB_EXISTS ))   && ok "database '$APP_DB' exists" || bad "database '$APP_DB' does NOT exist"

    if (( ! ROLE_EXISTS )); then
      note "CAUSE A CONFIRMED: this cluster was initialised with a different POSTGRES_USER,"
      note "  so role '$APP_USER' was never created. Prisma's 'credentials are not valid' is"
      note "  PostgreSQL declining to admit the role simply does not exist."
    fi
  fi
fi

# ── 6. reproduce the failure precisely ───────────────────────────────────────
step "6. Authentication test with the exact .env credentials"

# (a) host -> port reachable at all? bash's /dev/tcp needs no extra tooling.
# HOST_TCP is consulted again by the verdict: "nothing is listening" and "a
# different server answered" demand opposite advice, and collapsing them is the
# same mistake as collapsing 'connection refused' into 'authentication failed'.
HOST_TCP=0
if (exec 3<>"/dev/tcp/$APP_HOST/$APP_PORT") 2>/dev/null; then
  HOST_TCP=1
  ok "TCP connect to $APP_HOST:$APP_PORT succeeds (something is listening)"
else
  bad "TCP connect to $APP_HOST:$APP_PORT refused — nothing is listening there"
  note "Nothing is listening on $APP_PORT. Start the stack with 'pnpm db:up'."
fi

# (b) does the cluster accept the password? Tested over TCP from inside the
#     container, so it goes through the same scram/md5 path Prisma uses — the
#     unix-socket trust shortcut is deliberately bypassed here.
#
#     "Connection refused" and "authentication failed" are NOT the same finding and
#     must never be collapsed: during initdb the server listens on the unix socket
#     only, so a premature TCP probe is refused and looks like a bad password.
PW_OK=0
if (( CONTAINER_UP )); then
  PSQL_OUT="$(docker exec -e PGPASSWORD="$APP_PASS" "$CONTAINER" \
    psql -h 127.0.0.1 -p 5432 -U "$APP_USER" -d "$APP_DB" -tAc 'select current_user' 2>&1)"
  if [[ $? -eq 0 ]]; then
    PW_OK=1
    ok "the cluster ACCEPTS $APP_USER / this password on database $APP_DB"
    info "If Prisma still fails from the host, the host connection is not reaching this"
    info "container — see step 3 (cause B)."
  elif printf '%s' "$PSQL_OUT" | grep -qi 'connection refused\|could not connect to server\|is the server running'; then
    warn "the cluster is not accepting TCP connections yet — this is NOT an auth failure"
    printf '%s\n' "$PSQL_OUT" | head -3 | sed 's/^/      /'
    note "The cluster was not listening on TCP when tested (still initialising, or shutting"
    note "  down). Re-run the doctor once 'docker inspect' reports health=healthy. Do not read"
    note "  this as a wrong password."
  else
    bad "the cluster REJECTS $APP_USER with the password in apps/api/.env"
    info "Server's own words:"
    printf '%s\n' "$PSQL_OUT" | head -3 | sed 's/^/      /'
    note "Password/role/database rejected by the cluster itself — repairable in place."
  fi
fi

# ── 7. repair (only with --repair, only additive) ─────────────────────────────
step "7. Repair"

REPAIRED=()
if (( ! REPAIR )); then
  info "Diagnostic run — nothing was changed. Re-run with --repair to apply fixes."
elif [[ -z "$SUPER" ]]; then
  warn "cannot repair: no bootstrap role reachable over the unix socket"
elif (( FOREIGN_PG )); then
  warn "not repairing the container: a native PostgreSQL owns port $APP_PORT, so repairing"
  info "the container would not change what your app connects to. Resolve step 3 first."
else
  # Everything below is additive. No DROP, no volume removal, no data rewritten.
  if (( ! ROLE_EXISTS )); then
    if docker exec "$CONTAINER" psql -U "$SUPER" -d postgres -v ON_ERROR_STOP=1 \
         -c "create role \"$APP_USER\" with login createdb password '$APP_PASS';" >/dev/null 2>&1; then
      ok "created role '$APP_USER' (LOGIN CREATEDB)"
      REPAIRED+=("created role $APP_USER")
      ROLE_EXISTS=1
    else
      bad "failed to create role '$APP_USER'"
    fi
  else
    # The stale-volume fix. Resets only the role's password; every table, row and
    # index in the cluster is untouched. Skipped when step 6 already logged in:
    # rewriting a password that demonstrably works is a change with no purpose,
    # and --repair should be a no-op on a healthy cluster.
    if (( PW_OK )); then
      ok "role '$APP_USER' already accepts the password in apps/api/.env — nothing to repair"
    elif docker exec "$CONTAINER" psql -U "$SUPER" -d postgres -v ON_ERROR_STOP=1 \
         -c "alter role \"$APP_USER\" with login createdb password '$APP_PASS';" >/dev/null 2>&1; then
      ok "reset the password of existing role '$APP_USER' to the value in apps/api/.env"
      info "No data was touched — ALTER ROLE ... PASSWORD rewrites one row in pg_authid."
      REPAIRED+=("reset password of role $APP_USER; granted CREATEDB")
    else
      bad "failed to alter role '$APP_USER'"
    fi
  fi

  if (( ! DB_EXISTS )) && (( ROLE_EXISTS )); then
    if docker exec "$CONTAINER" psql -U "$SUPER" -d postgres -v ON_ERROR_STOP=1 \
         -c "create database \"$APP_DB\" owner \"$APP_USER\";" >/dev/null 2>&1; then
      ok "created database '$APP_DB' owned by '$APP_USER'"
      REPAIRED+=("created database $APP_DB")
      DB_EXISTS=1
    else
      bad "failed to create database '$APP_DB'"
    fi
  elif (( DB_EXISTS )); then
    docker exec "$CONTAINER" psql -U "$SUPER" -d postgres \
      -c "grant all privileges on database \"$APP_DB\" to \"$APP_USER\";" >/dev/null 2>&1 \
      && ok "confirmed '$APP_USER' has full privileges on '$APP_DB'"
  fi
fi

# ── 8. prerequisites specific to `prisma migrate dev` ────────────────────────
step "8. Can 'prisma migrate dev' actually run here?"

if [[ -n "$SUPER" ]] && (( ROLE_EXISTS )); then
  # (a) Shadow database. `migrate dev` creates and drops a throwaway database to
  #     diff the schema, so the connecting role needs CREATEDB.
  CANCREATE="$(docker exec "$CONTAINER" psql -U "$SUPER" -d postgres -tAc \
    "select rolcreatedb from pg_roles where rolname='$APP_USER';" 2>/dev/null | tr -d ' ')"
  if [[ "$CANCREATE" == "t" ]]; then
    ok "'$APP_USER' has CREATEDB — the shadow database can be created"
  else
    bad "'$APP_USER' lacks CREATEDB — 'migrate dev' will fail creating its shadow database"
    note "Grant it: ALTER ROLE $APP_USER CREATEDB;  (or run this script with --repair)"
  fi

  # (b) PostGIS. schema.prisma declares `extensions = [postgis]`, so the first
  #     migration emits CREATE EXTENSION IF NOT EXISTS "postgis" — which needs the
  #     extension present on disk AND a superuser to install it, in the target
  #     database *and* the shadow database.
  AVAIL="$(docker exec "$CONTAINER" psql -U "$SUPER" -d postgres -tAc \
    "select default_version from pg_available_extensions where name='postgis';" 2>/dev/null | tr -d ' ')"
  if [[ -n "$AVAIL" ]]; then
    ok "PostGIS $AVAIL is available in this image"
  else
    bad "PostGIS is NOT available — the image is not postgis/postgis"
    note "schema.prisma declares extensions = [postgis]; the first migration cannot apply."
    note "Use image postgis/postgis:16-3.4 (as docker-compose.yml already specifies)."
  fi

  IS_SUPER="$(docker exec "$CONTAINER" psql -U "$SUPER" -d postgres -tAc \
    "select rolsuper from pg_roles where rolname='$APP_USER';" 2>/dev/null | tr -d ' ')"
  if [[ "$IS_SUPER" == "t" ]]; then
    ok "'$APP_USER' is SUPERUSER — CREATE EXTENSION postgis will succeed"
  else
    warn "'$APP_USER' is not SUPERUSER; CREATE EXTENSION postgis may be refused"
    info "Acceptable for local development: ALTER ROLE $APP_USER SUPERUSER;"
    info "Do NOT do this in staging or production — install the extension there once,"
    info "out of band, and keep the application role unprivileged."
  fi

  # (c) The decisive test: can the app role install postgis in its own database?
  #     In the postgis image the init scripts add postgis to template1, so a
  #     database cloned from it already has the extension and CREATE EXTENSION
  #     IF NOT EXISTS is a privilege-free no-op. This proves it either way.
  if (( DB_EXISTS )) && [[ -n "$AVAIL" ]] && (( PW_OK )); then
    EXT_ERR="$(docker exec -e PGPASSWORD="$APP_PASS" "$CONTAINER" psql -h 127.0.0.1 \
      -U "$APP_USER" -d "$APP_DB" -v ON_ERROR_STOP=1 \
      -c 'create extension if not exists postgis;' 2>&1)"
    if [[ $? -eq 0 ]]; then
      ok "'$APP_USER' can run CREATE EXTENSION postgis on '$APP_DB'"
    else
      bad "'$APP_USER' cannot install postgis on '$APP_DB'"
      printf '%s\n' "$EXT_ERR" | head -2 | sed 's/^/      /'
      note "Grant superuser for local dev only:  ALTER ROLE $APP_USER SUPERUSER;"
    fi
  elif (( DB_EXISTS )) && [[ -n "$AVAIL" ]]; then
    info "skipped the CREATE EXTENSION test — the TCP login above did not succeed yet"
  fi
fi

# ── 9. verdict ───────────────────────────────────────────────────────────────
step "9. Verdict"

if (( ${#REPAIRED[@]} )); then
  printf '  %sChanges applied to the cluster:%s\n' "$B" "$Z"
  for r in "${REPAIRED[@]}"; do printf '    - %s\n' "$r"; done
  printf '  %sNo database, table, row or volume was deleted.%s\n' "$G" "$Z"
fi

# The decisive test, and it now runs on EVERY invocation — not only with
# --repair. It is read-only ('select 1'), it goes over the HOST path with
# Prisma's own client, and it is the exact path and library that produced the
# original P1000. Verifying only from inside the container proves the cluster is
# well while the app still cannot reach it, which is the trap this script exists
# to avoid; and skipping it on a diagnostic run is precisely how this verdict
# came to rank a weak timestamp signal (cause A) above direct evidence of a
# working login.
PRISMA_BIN="$REPO_ROOT/apps/api/node_modules/.bin/prisma"
E2E_OK=0
E2E_RAN=0
if [[ -x "$PRISMA_BIN" ]]; then
  E2E_RAN=1
  printf '\n  %sEnd-to-end check via Prisma over %s:%s ...%s\n' "$B" "$APP_HOST" "$APP_PORT" "$Z"
  E2E="$(cd "$REPO_ROOT/apps/api" && printf 'select 1;\n' \
    | "$PRISMA_BIN" db execute --schema prisma/schema.prisma --stdin 2>&1)"
  if [[ $? -eq 0 ]]; then
    E2E_OK=1
    printf '  %sVERIFIED: Prisma authenticates as %s@%s over %s:%s.%s\n' \
      "$G" "$APP_USER" "$APP_DB" "$APP_HOST" "$APP_PORT" "$Z"
  else
    printf '  %sSTILL FAILING from the host.%s Prisma said:\n' "$R" "$Z"
    printf '%s\n' "$E2E" | grep -v '^$' | head -6 | sed 's/^/      /'
  fi
else
  warn "skipped the end-to-end check: $PRISMA_BIN not found (run 'pnpm install')"
  info "Everything above still holds; only the app's own client path is unverified."
fi

# A weak signal is worth reporting only when the strong one has not answered the
# same question. Step 4's volume-age comparison is meaningless once a login has
# succeeded, so it becomes an explicit RULED OUT rather than a leading finding.
if (( STALE_VOLUME )); then
  if (( PW_OK || E2E_OK )); then
    printf '\n  %sCause A (stale volume, wrong password) is RULED OUT:%s the cluster accepted\n' "$G" "$Z"
    printf '  these credentials, so docker-compose.yml simply being newer than the volume is\n'
    printf '  the ordinary result of having edited that file. Nothing to repair.\n'
  else
    note "CAUSE A LIKELY: no login succeeded, AND the volume predates the current compose"
    note "  file — so the current POSTGRES_PASSWORD was probably never applied, initdb reading"
    note "  it only on an empty data directory and the cluster keeping the password it was born"
    note "  with. Fix in place with ALTER ROLE ('pnpm db:repair'). No data is lost."
  fi
fi

if (( ${#FINDINGS[@]} )); then
  printf '\n  %sFindings:%s\n' "$B" "$Z"
  for f in "${FINDINGS[@]}"; do printf '    %s\n' "$f"; done
elif (( E2E_OK )); then
  printf '\n  %sNothing wrong found — the app can reach its database.%s\n' "$G" "$Z"
else
  printf '\n  %sNo fault identified in the cluster itself.%s\n' "$Y" "$Z"
fi

if (( E2E_OK )); then
  cat <<EOF

  Next, from the repository root:

    pnpm db:migrate       # prisma migrate dev
    pnpm db:seed

  Then confirm:

    pnpm --filter @gopasal/api exec prisma migrate status
EOF
  exit 0
fi

if (( E2E_RAN )); then
  echo
  if (( ! HOST_TCP )); then
    # Nothing answered at all, so no inference about WHICH server is possible.
    # This is the 'connection refused' half of the distinction the whole script
    # is built on, and it must never be reported as a wrong-server conclusion.
    printf '  %sNothing is listening on %s:%s%s — this is a reachability failure, not an\n' \
      "$Y" "$APP_HOST" "$APP_PORT" "$Z"
    printf '  authentication one, and it says nothing about which server is which.\n'
    printf '      pnpm db:up            # or db:recreate if the container exists but is not running\n'
    printf '      pnpm db:ports         # confirm 127.0.0.1:%s->5432/tcp\n' "$APP_PORT"
  elif (( PW_OK )); then
    printf '  %sThe cluster inside %s accepts these credentials, but the host path does not.%s\n' \
      "$Y" "$CONTAINER" "$Z"
    printf '  Something IS listening on %s:%s, so that is conclusive: your app is talking to a\n' \
      "$APP_HOST" "$APP_PORT"
    printf '  DIFFERENT PostgreSQL. Fix step 3 — publish the container port, or move GoPasal:\n'
    printf '      pnpm db:portcheck && pnpm db:portfind\n'
    printf '      pnpm db:setports <postgres> <redis>\n'
    printf '  The password is fine, and nothing on this machine needs to be stopped.\n'
  else
    printf '  Re-read steps 3 and 6 above — the cluster itself has not accepted a TCP login yet.\n'
    (( REPAIR )) || printf '  If step 6 reported a REJECTION, re-run with: pnpm db:repair\n'
  fi
  exit 1
fi
exit 0
