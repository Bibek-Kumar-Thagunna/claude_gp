# GoPasal API

The backend for **GoPasal** — a hyperlocal commerce platform for Nepal. One NestJS
service powers all three surfaces (customer `gopasal.com`, seller `seller.gopasal.com`,
admin `admin.gopasal.com`) with a custom, default‑deny RBAC engine, self‑delivery with
**live rider GPS tracking**, and swappable third‑party providers (maps, SMS/OTP,
payments, push, storage) selected entirely through environment variables.

> Engineered by **Velayon Dynamics Pvt. Ltd.** · Founder **Bibek Kumar Thagunna** · Co‑founder **Suyogya Sedhai**

---

## Tech stack

| Concern            | Choice                                                                 |
| ------------------ | ---------------------------------------------------------------------- |
| Framework          | NestJS 10 (modular, DI, guards, interceptors, WebSocket gateway)       |
| Language           | TypeScript                                                             |
| Database           | PostgreSQL 16 + **PostGIS** (radius / “within delivery zone” geo queries) |
| ORM                | Prisma 5                                                               |
| Cache / pub‑sub    | Redis 7 (sessions, OTP, socket fan‑out, BullMQ jobs)                   |
| Realtime           | Socket.IO + `@socket.io/redis-adapter` (horizontal scale)              |
| Background jobs    | BullMQ 5 (notification fan‑out, best‑effort so requests never block)   |
| Domain events      | `@nestjs/event-emitter` — orders/delivery emit; notifications, loyalty and realtime listen |
| Auth               | Phone **OTP** → short‑lived access JWT + rotating refresh session      |
| Authorization      | Custom RBAC (two scopes, editable roles, default‑deny)                 |
| Docs               | Swagger/OpenAPI at `/api/docs`                                         |

---

## Prerequisites

- **Node.js ≥ 20** and **pnpm ≥ 9** (`npm i -g pnpm`)
- **Docker** + Docker Compose (for Postgres/PostGIS + Redis) — or your own Postgres 16 with the `postgis` extension and a Redis 7 instance.

---

## Quick start (local)

All commands can be run from the **repo root** (they proxy into `apps/api`), or from
inside `apps/api` using the `pnpm <script>` names shown in parentheses.

```bash
# 1) install workspace dependencies (from repo root)
pnpm install

# 2) bring up Postgres (PostGIS) + Redis
pnpm db:up                       # bind-tests the host ports, then docker compose up -d
#   host ports default to 127.0.0.1:15432 (Postgres) and 127.0.0.1:6380 (Redis);
#   `pnpm db:portcheck` names any occupant, `pnpm db:setports <pg> <redis>` moves them.

# 3) configure the API environment
cp apps/api/.env.example apps/api/.env
#   the defaults work out of the box against docker-compose;
#   the only "__REPLACE_ME__" values are third‑party keys you add later.

# 4) create the schema + generate the Prisma client
pnpm db:migrate                  # (apps/api) prisma migrate dev

# 5) seed permissions, roles, demo shops/products/orders/riders
pnpm db:seed                     # (apps/api) ts-node prisma/seed.ts

# 6) run the API in watch mode  → http://localhost:4000
pnpm dev:api                     # (apps/api) nest start --watch
```

Then open **http://localhost:4000/api/docs** for the full interactive API.

Handy extras: `pnpm db:studio` (Prisma Studio), `pnpm db:reset` (drop → migrate → seed),
`pnpm db:down` (stop the containers).

> **OTP in dev:** `SMS_PROVIDER=log` is the default, so the code is **printed to the API
> console** instead of being texted. It is a real OTP — generated, hashed, expiring, rate
> limited and verified through exactly the production code path. Copy it from the terminal
> to complete login. Set `SMS_DEV_OUTBOX_FILE=./tmp/sms-outbox.jsonl` if you would rather
> read codes from a JSONL file (development only — production refuses to start with it set).

---

## Demo accounts (created by the seed)

Log in by phone; read the OTP from the API log.

| Role                      | Phone         | Notes                                        |
| ------------------------- | ------------- | -------------------------------------------- |
| Super Admin (platform)    | `9800000001`  | god‑mode across `admin.gopasal.com`          |
| Operations Admin          | `9800000002`  | shop approvals, orders, support              |
| Support Agent             | `9800000003`  | tickets + disputes                           |
| Shop Owner — Namaste Kirana | `9811111111` | full control of its shop                     |
| Shop Manager              | `9811111112`  | day‑to‑day ops, no RBAC/settings             |
| Rider                     | `9811111120`  | assigned to the live order below             |
| Customer — Rina           | `9840000001`  | has **live order `GP-100001`** out for delivery |
| Customer — Kiran          | `9840000002`  | has a delivered order + review + loyalty     |

There are three shops: **Namaste Kirana** (grocery, active), **Everest Pharmacy**
(pharmacy, active) and **Fresh Valley Veggies** (vegetables, **PENDING** — sitting in the
admin approvals queue on purpose).

---

## The three surfaces (route prefixes)

All routes are under the global `/api` prefix **and** URI versioning, so the live path of
every route below is `/api/v1/<path>` (`main.ts`: `setGlobalPrefix('api')` +
`enableVersioning({ type: URI, defaultVersion: '1' })`). Swagger itself sits outside the
version segment, at `/api/docs` with the document at `/api/docs-json`. RBAC is
**default‑deny**: three global guards run in order — rate‑limit → JWT auth (unless
`@Public`) → permissions.

**Customer** (`gopasal.com`)
`/auth` · `/me` + `/me/addresses` · `/shops`, `/products`, `/discovery` (public browse) ·
`/cart` · `/coupons/validate` · `/orders` (checkout, track, cancel) ·
`/orders/:id/review`, `/shops/:id/reviews` · `/notifications` ·
`/loyalty`, `/referrals`, `/gold` · `/group-orders` · `/support`, `/policies`.

**Seller** (`seller.gopasal.com`, prefix `/seller`)
shop profile & settings · catalog + CSV import · inventory · order queue & fulfilment ·
self‑delivery board & rider assignment · promotions (coupons/sponsored) · analytics ·
reviews (`/seller/shops/:shopId/reviews`) · **roles** (`/seller/shops/:shopId/roles`) ·
**team** (`/seller/shops/:shopId/staff`).

**Admin** (`admin.gopasal.com`, prefix `/admin`)
dashboard & platform analytics · shop approvals/suspension · user management ·
catalog moderation · disputes · fraud · policy versioning & publishing ·
support inbox · **audit log** · **platform roles** (`/admin/roles`) · **platform staff**
(`/admin/staff`). Sensitive admin mutations are written to a tamper‑evident audit trail.

---

## Custom RBAC (how permissions actually work)

Two scopes, one catalogue (`src/rbac/permissions.catalog.ts`) that seeds the database
**and** drives the guard — they can never drift.

- **PLATFORM** grants come from a user’s single `PlatformMembership → Role`.
- **SHOP** grants come from a `ShopMembership → Role`, scoped to one shop.
- A privileged **Owner** (shop) or **Super Admin** (platform) role short‑circuits every
  granular check for its scope.
- **System roles** are read‑only templates; an owner **clones** one to make an editable,
  shop‑specific role and tweaks its permissions. Nothing is granted by default.

`GET /api/v1/auth/me` returns the caller’s fully‑resolved permission set so the seller/admin
UIs can hide what a user can’t do.

---

## Live rider tracking (the headline feature)

Customers see the **rider’s live position on a map** while an order is out for delivery —
not just status text. It runs over Socket.IO on the **`/realtime`** namespace (JWT is
passed on connect):

| Direction        | Event              | Payload                                             |
| ---------------- | ------------------ | --------------------------------------------------- |
| client → server  | `order:subscribe`  | `{ orderId }` — join that order’s room; replies with the last known `rider:location` |
| client → server  | `order:unsubscribe`| `{ orderId }`                                       |
| rider → server   | `rider:ping`       | `{ lat, lng, heading, speed, accuracy }` (server‑throttled) |
| server → clients  | `rider:location`  | `{ orderId, lat, lng, heading, speed, accuracy, ts }` |
| server → clients  | `order:status`    | `{ orderId, status }`                               |
| server → clients  | `delivery:status` | `{ orderId, status }`                               |

Pings are throttled and locations expire (see the `RIDER_*` env vars); the Redis adapter
fans emits out across every API instance. Seeded order `GP-100001` is already
`OUT_FOR_DELIVERY` with rider **Hari** mid‑route, so you can watch it immediately.

---

## Third‑party providers & where to add professional keys

Every external vendor sits behind a **provider abstraction** chosen by env var, so the
app never hard‑codes a vendor and you can swap one in without touching feature code.
Development runs on real local implementations — not mocks, and not bypasses. Add
production keys in `apps/api/.env`:

| Provider     | Env selector       | Development default                        | Production key(s)                              |
| ------------ | ------------------ | ------------------------------------------ | ---------------------------------------------- |
| SMS / OTP    | `SMS_PROVIDER`     | `log` — real OTP, printed to the API log    | `SPARROW_SMS_TOKEN` + `SPARROW_SMS_FROM`, or `TWILIO_*` |
| File storage | `STORAGE_PROVIDER` | `local` — real bytes under `./uploads`      | `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` (+ `S3_ENDPOINT`, `S3_REGION`) |
| Maps / geo   | `MAP_PROVIDER`     | `osm` — real great‑circle distance, key‑free | `MAPBOX_ACCESS_TOKEN`                        |
| Push         | `PUSH_PROVIDER`    | `log` — in‑app notifications are unaffected  | not implemented yet (needs a device‑token registry) |
| Payments     | COD is always on   | eSewa/Khalti point at the vendor sandboxes  | `ESEWA_MERCHANT_CODE` + `ESEWA_SECRET`, `KHALTI_SECRET_KEY` |

Two rules hold everywhere. **Nothing silently downgrades:** selecting a provider without
its credential fails at boot naming the exact variable, rather than logging the vendor's
name while quietly using the local path. And **no local adapter fakes success:** the log
SMS transport reports `delivers === false`, the OSM router marks every result `degraded`,
and reverse geocoding returns `null` instead of inventing a street name.

The OTP itself is identical in both modes — same length, hashing, expiry, attempt ceiling
and per‑phone rate limit, verified through the same code path. There is no universal code
and no "any OTP is accepted" switch in any environment.

`validateConfig` runs in every environment and additionally refuses, in production only:
`SMS_PROVIDER=log`, `SMS_DEV_OUTBOX_FILE`, the development JWT secrets, two identical JWT
secrets, and a missing `PUBLIC_URL` or `DATABASE_URL`.

The browser‑exposed map token is `NEXT_PUBLIC_MAPBOX_TOKEN` (frontends read this); with the
default `osm` provider the frontends need no token at all.

### Optional: S3 locally, via MinIO

`STORAGE_PROVIDER=local` is the default and needs nothing. To exercise the *S3* code path
before you have a bucket, the compose file ships MinIO behind a profile so it never starts
by accident:

```bash
docker compose --profile s3 up -d minio      # API: 127.0.0.1:19000 · console: 127.0.0.1:19001
```

Then set `STORAGE_PROVIDER=s3` plus the MinIO block documented in `.env.example`
(`S3_ENDPOINT=http://localhost:19000`, `S3_FORCE_PATH_STYLE=true`). The signer is
hand‑rolled AWS SigV4 on `node:crypto`, so the same code signs MinIO, AWS, Cloudflare R2
and DigitalOcean Spaces.

---

## Seller onboarding & KYC documents (uploads)

A seller applies, attaches scans, submits; a reviewer reads the scans and decides. Both
halves work locally with no credential — `STORAGE_PROVIDER=local` writes real bytes under
`apps/api/uploads` and reads them back.

| Method + path (under `/api/v1`)                                            | Who                     |
| ------------------------------------------------------------------------- | ----------------------- |
| `POST   seller/onboarding/applications/:id/documents`                     | the applicant           |
| `GET    seller/onboarding/applications/:id/documents/:docId/file`          | the applicant           |
| `DELETE seller/onboarding/applications/:id/documents/:docId`               | the applicant           |
| `GET    admin/onboarding/applications/:id/documents/:docId/file`           | `shops.view`            |
| `POST   admin/onboarding/applications/:id/documents/:docId/review`         | `shops.approve`         |

Upload is `multipart/form-data` with a `file` part and a `kind` field. JPEG, PNG, WebP or
PDF only, and the type is decided by **reading the bytes**: the declared `Content-Type`, the
filename extension and the sniffed magic number must all agree, or the request is refused.
The client's filename never becomes a path — the object key is
`private/shop-applications/<applicationId>/<32 hex>.<ext>` with the extension taken from
the sniffed type, so `../../etc/cron.d/evil.jpg` is stored under a random name and survives
only as a display label. Two ceilings apply: the multer limit stops an oversized body before
it is buffered, and `UploadsService` then enforces the configured
`UPLOAD_MAX_IMAGE_BYTES` / `UPLOAD_MAX_DOCUMENT_BYTES`.

KYC scans are **private**: they live under the `private/` prefix, which is outside the
statically served tree, have no URL at all, and are streamed only through the two routes
above — as `attachment`, `no-store`, `nosniff`, under a `default-src 'none'; sandbox` CSP.
`storageKey` never appears in any API response. A document belonging to another applicant
answers **404, not 403**, so the endpoint cannot be used to discover that a document exists.
Uploads and deletions are allowed only while the application is `DRAFT` or
`CHANGES_REQUESTED`; once it is in the queue the attachments are part of the record.

Bytes go through `StorageProvider`; PostgreSQL holds only metadata (`kind`, `storageKey`,
`fileName`, `mimeType`, `sizeBytes`, review state and note). Uploading a kind that is
already attached replaces it — one row, one object, the old bytes deleted — except `OTHER`,
which accumulates up to `MAX_DOCUMENTS_PER_APPLICATION`. If the database insert fails the
just‑written object is removed, and if a *replacement* fails the original row and its bytes
are kept, so there is never an unreferenced scan and never a lost one. Every upload,
replacement, removal, reviewer view and accept/reject writes an audit entry and an
application timeline event; the reviewer's view is recorded *before* the bytes are read.

Submission requires the KYC set — both sides of the citizenship card and a shopfront photo,
plus proof of account for a `BANK` payout. A **rejected** scan does not count as present, so
"changes requested" cannot be cleared by resubmitting the same file. Business registration
(PAN, VAT, licence) stays optional: most Nepali shops are unregistered.

---

## Tests

```bash
pnpm --filter @gopasal/api test    # node:test, offline, no database required
```

343 unit tests cover configuration validation and refusals, the SigV4 signer (against
AWS's published PutObject vector, with the signature re‑derived in‑test), every provider
family, the onboarding state machine cell by cell, the whole upload path, the error envelope
and the bounded Redis close. They are
hermetic: `fetch` is stubbed and restored, config is passed in rather than read from
`process.env`. Storage is deliberately *not* mocked in the upload and document tests — a
real `LocalStorageProvider` writes into a real temp directory, because "the bytes are on
disk", "the old object is gone" and "nothing escaped the upload root" are claims about a
filesystem that a stubbed provider would let pass while nothing had happened.

### The error envelope carries machine-readable detail

Every failure leaves through `AllExceptionsFilter` as
`{ statusCode, error, message, path, timestamp }` — plus **any extra fields the handler
attached**. A service that throws
`new BadRequestException({ message, missing, missingDocuments })` means those lists for the
client: they are what lets the seller wizard highlight the two empty fields and name the
missing citizenship scan instead of showing one flat sentence. The filter used to rebuild the
body from `message` alone and silently drop the rest, which passed every unit test — they
asserted on `exception.getResponse()`, the shape *before* the filter — and failed the first
time a real HTTP client looked. Two rules follow: extra fields travel only below 500 (a
5xx's internals are not the caller's business) and only after `sanitize()`, since
interceptors do not run on the error path. **When a field is meant to be parsed rather than
displayed, assert on the serialised body** (`all-exceptions.filter.spec.ts`,
`submit-refusal.wire.spec.ts`), not on the exception.

### Shutdown

`SIGINT`/`SIGTERM` are handled in `main.ts`: drop idle connections, `app.close()`, then exit
explicitly, with an 8-second watchdog that logs and exits anyway if a hook wedges. Nest's
`enableShutdownHooks()` alone only *starts* the close and leaves the process to end by
itself; `app.close()` from a `beforeExit` listener is worse than useless, because `beforeExit`
is re-emitted whenever the loop drains and the handler always schedules more async work. Each
Redis `quit()` is bounded at two seconds and falls back to `disconnect()`, and BullMQ is given
connection *options* it owns rather than a shared `duplicate()` it will never close. The E2E
harness fails the run if the API has to be SIGKILLed.

### Runtime verification of the upload path

Unit tests cannot tell you that the routes are actually mounted, that multer and the global
`ValidationPipe` agree about a multipart body, or that the storage directory the running
process writes to is the one you configured. `scripts/verify-uploads-e2e.mjs` answers those
questions against a real running stack — real Postgres, real Redis, a real `nest build`
artifact, real `multipart/form-data` over the loopback interface, and the developer's own
filesystem read directly:

```bash
pnpm db:portcheck        # name any host-port conflict before starting
pnpm db:up               # PostgreSQL + Redis
pnpm db:doctor           # confirm the database answers and is migrated
pnpm verify:uploads      # boot the API, drive the whole document path, stop it
```

It signs its test users in the way a person does — asks for a one-time code and reads it out
of the `SMS_PROVIDER=log` development outbox — so no authentication or authorisation is
bypassed anywhere. Useful flags: `--verbose` (stream the API log), `--no-db` (containers
already running), `--no-build` (reuse `dist/`), and `--use-running` (verify an API you
started yourself, which needs `SMS_DEV_OUTBOX_FILE` set on that process). It refuses to run
with `NODE_ENV=production` or `STORAGE_PROVIDER` other than `local`, deletes no database row
and no volume, and leaves its application, shop and users behind under names beginning
`E2E Verify` so you can find them.

---

## Project structure

```
apps/api/
├── prisma/
│   ├── schema.prisma        # full data model (identity, RBAC, catalog, orders,
│   │                        #   delivery, payments, engagement, support, policy, audit)
│   └── seed.ts              # idempotent seed (permissions, roles, demo data)
├── src/
│   ├── common/              # Prisma, Redis, config, guards, filters, event registry
│   ├── config/              # typed configuration loader
│   ├── providers/           # swappable map/SMS/payment/push/storage abstractions
│   ├── rbac/                # catalogue, guard, roles + memberships services & controllers
│   ├── auth/                # OTP + JWT sessions, JwtAuthGuard, @Public, @CurrentUser
│   ├── realtime/            # Socket.IO gateway (live tracking) + ws auth
│   └── modules/             # users, catalog, discovery, cart, coupons, orders, delivery,
│                            #   reviews, notifications, support, engagement, group-orders,
│                            #   policy, admin, audit, onboarding (KYC), uploads
│                            #   (uploads/ = MIME sniffing, size ceilings, safe object keys)
├── docker-compose.yml       # (repo root) Postgres/PostGIS + Redis
└── .env.example             # every setting, with provider key placeholders
```

---

## A note on the authoring sandbox

The authoring environment has a **network‑blocked package registry** and **no Docker**, so
anything needing a running container has to be verified on your machine. What *has* been
executed here, against the installed dependency tree: `prisma validate`, `prisma generate`,
`tsc --noEmit` (0 errors), `eslint --max-warnings 0` (0 problems), `nest build` (emits
`dist/main.js`) and the 343‑test unit suite (all passing). `pnpm db:migrate` and `pnpm db:seed`
have been run **on the developer machine** (migration `20260822193823_init`, full seed) — not
here. What has **not** been executed here: any database migration or seed, an actual API boot,
and MinIO — validated only as compose YAML. Not a single `any`, `!`, `@ts-ignore` or relaxed
compiler flag was used to reach zero.

## License

Proprietary — © Velayon Dynamics Pvt. Ltd. All rights reserved.
