# GoPasal

**Hyperlocal commerce for Nepal.** Neighbourhood shops register, list their products, and deliver within their own radius. Customers discover nearby stores, order, and pay (Cash on Delivery first). Built for real Nepali retail — Kirana stores, pharmacies, vegetable vendors, and multi-branch merchants.

> **Founder:** Bibek Kumar Thagunna &nbsp;·&nbsp; **Co-founder:** Suyogya Sedhai
> **Engineered & designed by:** Velayon Dynamics Pvt. Ltd. (Nepal)

---

## What's in this repo

This is a **Turborepo monorepo** using **pnpm workspaces**.

```
gopasal/
├── apps/
│   ├── api/              # api.gopasal.com         — NestJS 10 + Prisma + Postgres + Redis ✅ built
│   ├── web-customer/     # gopasal.com            — Next.js 15 (App Router) ✅ built
│   ├── web-seller/       # seller.gopasal.com     — Next.js 15 (App Router) ✅ built
│   ├── web-admin/        # admin.gopasal.com      — Next.js 15 (App Router) ✅ built
│   ├── web-rider/        # rider.gopasal.com      — Next.js 15 (App Router) ✅ built
│   ├── app-customer/     # Customer mobile app    — Expo / React Native (planned)
│   └── app-seller/       # Seller mobile app      — Expo / React Native (planned)
└── packages/
    ├── tokens/           # Design tokens (crimson system) — shared by web + native
    ├── ui/               # Shared React components (web)
    └── config/           # Shared tsconfig / tailwind preset / eslint
```

### Surfaces and ports

| Surface                | Package                 | Dev URL                 | Script              |
| ---------------------- | ----------------------- | ----------------------- | ------------------- |
| API + realtime gateway | `@gopasal/api`          | `http://localhost:4000` | `pnpm dev:api`      |
| Customer website       | `@gopasal/web-customer` | `http://localhost:3000` | `pnpm dev:customer` |
| Seller console         | `@gopasal/web-seller`   | `http://localhost:3001` | `pnpm dev:seller`   |
| Platform admin console | `@gopasal/web-admin`    | `http://localhost:3002` | `pnpm dev:admin`    |
| Rider delivery console | `@gopasal/web-rider`    | `http://localhost:3003` | `pnpm dev:rider`    |

## Tech stack

| Layer          | Choice                                                           |
| -------------- | ---------------------------------------------------------------- |
| Web            | Next.js 15 (App Router, RSC), React 19, TypeScript               |
| API            | NestJS 10, Prisma, PostgreSQL 16, Redis 7, Socket.IO             |
| Auth           | Phone + one-time code (OTP), JWT access/refresh sessions         |
| Access control | Custom RBAC, default-deny, one permission catalog for API + UI   |
| Styling        | Tailwind CSS v3 + a shared design-token preset                   |
| Animation      | Framer Motion (splash, scroll reveals, micro-interactions)       |
| Icons          | lucide-react                                                     |
| Native apps    | Expo (React Native), sharing `@gopasal/tokens`                   |
| Monorepo       | Turborepo + pnpm workspaces                                      |
| i18n           | English + Nepali (Devanagari), Romanized-Nepali search tolerance |

## Prerequisites

- **Node.js ≥ 22** (Node 20 is end-of-life and is refused for production builds)
- **pnpm ≥ 9** — `npm install -g pnpm`
- **Docker** (for PostgreSQL + Redis via `docker-compose.yml`)

## Getting started

```bash
# from the gopasal/ directory
pnpm install

# 1. bring up Postgres + Redis (host ports 15432 and 6380 — see "Host ports" below)
pnpm db:portcheck   # can Docker bind them on this machine? (binds, exactly as Docker does)
pnpm db:up
pnpm db:ports       # confirm 127.0.0.1:15432->5432 and 127.0.0.1:6380->6379

# 2. copy the API environment file and fill in the placeholders you have keys for
cp apps/api/.env.example apps/api/.env

# 3. create the schema and seed roles, permissions, shops and demo orders
pnpm db:migrate
pnpm db:seed

# 4. run a surface (or `pnpm dev` for everything Turbo knows about)
pnpm dev:api        # http://localhost:4000
pnpm dev:customer   # http://localhost:3000
pnpm dev:seller     # http://localhost:3001
pnpm dev:admin      # http://localhost:3002
pnpm dev:rider      # http://localhost:3003
```

### Testing seller location capture with a real phone

Phone browsers require a secure HTTPS page before they expose precise GPS, and a
phone cannot open the laptop's `localhost` address. The seller console therefore
uses `NEXT_PUBLIC_SELLER_PUBLIC_URL` when it builds the one-use QR link. For a
temporary local test, a Cloudflare Quick Tunnel works without an account or card:

```bash
npx wrangler tunnel quick-start http://localhost:3001
```

Copy the generated `https://…trycloudflare.com` URL into
`apps/web-seller/.env.development` as both `NEXT_PUBLIC_SELLER_PUBLIC_URL` and
`NEXT_PUBLIC_API_URL`, then restart the seller console. Its fixed same-origin
development bridge forwards `/api/v1/*` to
`API_INTERNAL_URL=http://localhost:4000`, so login, onboarding and the phone
capture all work through one tunnel. Quick tunnels are development-only;
production must use the real HTTPS seller and API domains.

### Giving a Windows tester the complete platform

`deploy/windows-tester` is a no-Git, no-Node.js package for a non-technical
tester. After installing Docker Desktop once, they use the included Start, Stop,
Update, Reset and Export shortcuts. The launcher downloads the latest CI-approved
images, applies database migrations, seeds the first local database, waits for
all five GoPasal services, and opens a small testing hub. PostgreSQL, Redis,
uploads and application state remain in Docker volumes across updates.

The `Publish Windows tester images` workflow runs only after `CI` succeeds on
`main` (or when deliberately dispatched), publishes the five `linux/amd64`
images to GHCR, and produces `GoPasal-Tester-Windows.zip` as a workflow artifact.
The tester never clones this repository or runs `git pull`.

The GHCR packages must be public for anonymous one-click downloads. This
repository is public, but GitHub may create the first package version as private;
after the first successful workflow run, set each `gopasal-tester-*` package to
Public once in GitHub package settings. Do not give the tester a repository or
registry token.

### If the database connection fails

The one error worth having a plan for is this, usually on the very first migration:

```
PrismaClientInitializationError: Authentication failed against database server at
`localhost`, the provided database credentials for `gopasal` are not valid.
```

`apps/api/.env` and `docker-compose.yml` are kept deliberately in sync, so when this
appears the credentials in the repo are almost never the problem — the running cluster
is. Run the doctor:

```bash
pnpm db:doctor        # read-only diagnosis, changes nothing
pnpm db:repair        # applies only additive fixes (ALTER ROLE / CREATE ROLE / CREATE DATABASE)
```

It distinguishes the three real causes. A **stale data volume** is the most common:
`POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` are read by `initdb` _only when
the data directory is empty_, so a `gopasal_pgdata` volume left over from an earlier
compose file keeps its original password and silently ignores the current one. A
**second PostgreSQL on port 5432** (Homebrew, apt, Postgres.app) is the sneakiest,
because your connection never reaches the container and PostgreSQL answers "password
authentication failed" rather than "role does not exist" — the two are indistinguishable
from the client. Third, the **container may simply not be running or still initialising**.

`db:repair` never runs `DROP`, never `docker compose down -v`, never `docker volume rm`
and never `prisma migrate reset`; it fixes the cluster in place and your data survives.
For the stale-volume case the entire fix is `ALTER ROLE gopasal WITH PASSWORD …`, which
rewrites one row in `pg_authid`.

Two things `prisma migrate dev` needs beyond a working login, both checked by the doctor:
the role must hold **CREATEDB** (Prisma creates and drops a shadow database to diff the
schema), and **PostGIS must be installable**, because `schema.prisma` declares
`extensions = [postgis]` and the first migration emits `CREATE EXTENSION IF NOT EXISTS
"postgis"`. Both hold in `postgis/postgis:16-3.4`; neither is safe to assume against a
host-installed or managed PostgreSQL.

#### Host ports are deliberately not the defaults

GoPasal publishes PostgreSQL on **127.0.0.1:15432** and Redis on **127.0.0.1:6380**.
Inside the containers they are the ordinary 5432 and 6379 — only the host side moved.

| service                         | host              | container port |
| ------------------------------- | ----------------- | -------------- |
| PostgreSQL (`gopasal-postgres`) | `127.0.0.1:15432` | 5432           |
| Redis (`gopasal-redis`)         | `127.0.0.1:6380`  | 6379           |

Two separate decisions there. **The port** avoids 5432 because a machine that already
runs PostgreSQL there gives you one of two bad outcomes: `docker compose up` fails with
`port is already allocated` and leaves the other container half-started, or — much worse
— the binding succeeds somewhere unexpected and your app authenticates against the
_other_ server, which reports the absent `gopasal` role as `password authentication
failed`. It avoids **5433 and 5434** too, because those are precisely the ports Debian
and Ubuntu hand to a second and third native cluster, so "the next port along" is the
most likely one to be occupied. **The address** is `127.0.0.1` rather than the `0.0.0.0`
Docker would use by default, so a development database holding a development password —
and a Redis with no password at all — is not reachable from the rest of the network.

Nothing on your machine needs to be stopped to make room. Check, or move both sides at
once:

```bash
pnpm db:portcheck                 # binds each configured port, names any occupant
pnpm db:portfind                  # suggests the first pair this machine will allow
pnpm db:setports 15533 6480       # writes ./.env AND apps/api/.env together
pnpm db:down && pnpm db:up        # no -v anywhere: volumes are preserved
```

`db:setports` is the only supported way to move a port, because a port lives in two
files — the compose mapping and `DATABASE_URL`/`REDIS_PORT` — and editing one without
the other is exactly how you end up debugging a password that was never wrong. It writes
`POSTGRES_HOST_PORT`/`REDIS_HOST_PORT` into `./.env` (which `docker compose` reads by
itself) and rewrites the two values in `apps/api/.env`, touching nothing else: no
credentials, no database name, no Prisma schema. `pnpm db:up` runs the bind check first
and refuses rather than leaving containers half-applied, and `pnpm db:doctor` fails loudly
on drift between the two files.

```bash
pnpm db:ports         # docker compose ps postgres redis — confirm the host mappings
pnpm db:probe         # what answers at the address DATABASE_URL actually dials
```

#### When the container is healthy but the app still cannot log in

This is the case that wastes the most time, because every credential check passes. The
signature in `pnpm db:doctor` output is a contradiction:

```
x  the container publishes NO host port for 5432
✔  TCP connect to localhost:15432 succeeds (something is listening)
✔  the cluster ACCEPTS gopasal / this password on database gopasal
```

Read together, those three lines say the cluster you just verified is not the cluster
Prisma is reaching. `docker compose up -d` prints `Started`, not `Recreated`, when it
reuses an existing container, so a container created before the `ports:` mapping existed
keeps no host binding — and some _other_ PostgreSQL answers instead. Recreating the
container picks up the mapping and **preserves the named volume and all its data**:

```bash
pnpm db:recreate      # docker compose up -d --force-recreate postgres redis
pnpm db:ports         # expect: 127.0.0.1:15432->5432/tcp and 127.0.0.1:6380->6379/tcp
pnpm db:doctor
```

If `db:recreate` reports `port is already allocated`, one of GoPasal's host ports is taken.
`pnpm db:portcheck` says so before Docker does — it binds the port itself, which is the
only authoritative test — and names the occupant over the PostgreSQL or Redis handshake,
needing no credentials, no `psql` and no `lsof`. Then take a port that is free; stopping
the other service is never necessary:

```bash
pnpm db:portcheck
pnpm db:portfind
pnpm db:setports <postgres> <redis>
pnpm db:down && pnpm db:up
```

`pnpm db:probe` remains useful for the other half of the question — _what_ is answering
at the address `DATABASE_URL` dials:

```bash
pnpm db:probe                       # the address DATABASE_URL dials (15432)
pnpm db:probe localhost 5432        # inspect whatever owns the default port
```

If a failed bind has left containers in a half-applied state (`docker compose ps` showing
`created` rather than `running`), clear and rebuild them:

```bash
pnpm db:down          # docker compose down — NO -v, volumes are untouched
pnpm db:up
```

The doctor's final check deliberately runs `prisma db execute` from `apps/api` over the
host path — the exact client and route that produced the original error — so a pass means
the app can connect, not merely that the container is well.

> `pnpm db:reset` is destructive — it drops and recreates the schema. `pnpm db:down`
> is not: it stops the containers and leaves the volumes intact.

Build for production:

```bash
pnpm build            # all apps
pnpm --filter @gopasal/web-admin build
```

## API keys and secrets

No provider credential is hardcoded anywhere in this repo, and no console screen ever
accepts one. Every integration reads an **environment variable on the server**, and
`apps/api/.env.example` documents all of them with a development block and a production
block side by side. The admin console's **Settings → Connected services** panel shows only
the variable _name_ for each one, so an operator can see what is wired without a secret
ever reaching a browser.

Local development needs **no external credential at all**, and not because anything is
stubbed out: `SMS_PROVIDER=log` prints a real OTP to the API log, `STORAGE_PROVIDER=local`
writes real bytes under `apps/api/uploads`, `MAP_PROVIDER=osm` returns a real great-circle
distance, the support assistant answers from release-reviewed local knowledge, and
PostgreSQL/PostGIS and Redis run in Docker. Production switches the same code to
Sparrow/Twilio, S3-compatible storage, Baato Maps and OpenAI purely through env values.

The one rule that makes this safe is that **nothing silently downgrades**. Selecting a
provider without its credential fails at boot naming the exact variable, and
`validateConfig` additionally refuses, in production only, `SMS_PROVIDER=log`, the
development JWT secrets, two identical JWT secrets, and a missing `PUBLIC_URL` or
`DATABASE_URL`. There is no universal OTP and no "accept any code" switch in any
environment. See `apps/api/README.md` for the full provider table.

For support, `SUPPORT_ASSISTANT_PROVIDER=knowledge` is the key-free, source-grounded
production-safe provider. When a managed AI key is available, set it to `openai` and add
`OPENAI_API_KEY`; startup refuses that selection when the key is missing. Both paths use the
same approved GoPasal knowledge and the same human-escalation workflow.

## Live delivery tracking

When an order is `OUT_FOR_DELIVERY`, the customer site shows the runner **moving on a map**,
not a status line. MapLibre renders the front-end-safe style returned by the API's configured map
provider. Production uses Baato's Nepal-focused map, search, place resolution, reverse-geocoding
and bike routing. The Baato server token never reaches a browser; its separate browser token must
be restricted to the deployed customer origins. Visible Baato and OpenStreetMap attribution is
kept on every Baato-rendered map.

Customer address search is debounced and provider calls are cached for 12 hours, below Baato's
free-account 48-hour cache limit. A customer searches once, adjusts the pin to the exact gate and
saves the confirmed address. Future checkouts reuse that GoPasal-owned saved address without
repeating a geocoder request. Orders snapshot the chosen coordinates so later address edits cannot
move an in-progress delivery.

The position feed uses the `/realtime` Socket.IO namespace (`order:subscribe` →
`rider:location`, `order:status`, `delivery:status`) and falls back to polling the authenticated
`GET /orders/:id` endpoint when realtime is interrupted. It never starts a browser simulator.
A ping older than `RIDER_LOCATION_STALE_MS` renders as "last known position"; older than
`RIDER_OFFLINE_MS` as "runner's phone is offline". Missing verified pins produce an explicit
map-unavailable state. The key-free routing provider reports straight-line distance as degraded;
configured Baato or Mapbox routing supplies road geometry and distance.

The map reports **road distance remaining only when road geometry exists** and labels degraded
results as direct/straight-line distance. It never fabricates an arrival time or route.

## Verification status

The workspace is exercised on Node.js 22 LTS. Repository-wide type checks, lint, automated
tests, production builds and the five production container builds are release gates in CI.
The API, PostgreSQL, Redis, object storage and malware scanner have also been booted together
for lifecycle verification. Provider-backed behavior still requires the production credentials
listed in the environment examples; startup fails closed when a real provider is selected
without its required configuration.

## Design system

All brand values live in `packages/tokens`:

- **Crimson** brand scale (`--gp-crimson: #E11945`) + ink, blue, green, marigold, paper.
- Consumed on web via a Tailwind preset (`packages/tokens/tailwind-preset.ts`) and CSS variables (`packages/tokens/src/tokens.css`), and on native by importing the TS tokens directly.

## Access control

There is **one permission catalog**, defined in `apps/api/src/rbac/permissions.catalog.ts` and
mirrored key-for-key in each console's `lib/rbac.ts`. A screen may only offer an action whose
permission the API guard also enforces, so the UI can never promise something the server would
refuse. Access is **default-deny**: a signed-in operator with no matching permission sees an
explanatory empty state rather than a broken page.

The admin console covers dashboard, shop approvals, shop directory and detail, customers,
listing moderation, disputes, fraud signals, support tickets, policy versioning, analytics,
finance and payouts, platform coupons, roles and permissions, platform staff, the append-only
audit log, and platform settings. Roles are editable per permission, system roles can be
duplicated but never deleted, Super Admin implicitly holds every permission, and an operator
cannot suspend their own account. Every mutating action asks for a written reason and is
recorded in the audit log against the operator's name.

## Delivery model

Shops can self-deliver or assign an eligible rider. The dedicated rider web console covers
availability, claiming, pickup, live consent-based location, handover, COD confirmation,
proof of delivery and return-to-shop exceptions. We deliberately **do not promise delivery
speed** when routing data is unavailable; the customer sees a road ETA only when the configured
map provider returned road geometry, otherwise the UI clearly labels the degraded distance.

## License

Proprietary — © Velayon Dynamics Pvt. Ltd. All rights reserved.
