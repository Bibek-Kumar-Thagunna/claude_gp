# GoPasal — Build Status, Gap Analysis & Division of Labour

**Audited:** 22 August 2026 · against `GoPasal SRS v3 — Ultra Detailed` (86 pp., Phases 1–10)
**Auditor's stance:** every claim below is backed by a file, a line, or a count taken from the
repository on the date above. Where I could not verify something — because this machine has no
network and cannot install, build or run anything — I say so rather than implying it works.

---

## 1. The verdict, without softening

The backend is real. The three websites are not yet — they are exceptionally faithful,
fully-navigable **prototypes** rendering fixture data, and nothing joins them to the API.

Concretely: `apps/api` has 135 TypeScript files and 171 HTTP routes across 30 controllers, a
44-model Prisma schema, a working custom RBAC engine and a real credential-provisioning
subsystem. Meanwhile `apps/web-seller` makes **zero** network calls of any kind across its 34
components, has **no** `middleware.ts`, and its login page advances on a regex and then
`router.push("/dashboard")` — anyone who types the URL is inside. `web-admin` makes zero real
calls. `web-customer` makes exactly one (live order tracking).

So the honest number is not a percentage of features. It is this: **the platform is roughly 70%
built and 0% connected.** The remaining work is less about inventing things and more about
wiring, plus two whole SRS phases that were never started.

Two SRS phases are effectively absent:

- **Phase 8 — Finance core (ledger, escrow, settlement, refunds).** The schema contains
  `PaymentIntent` and nothing else. There is no `Ledger`, `Escrow`, `Settlement`, `Payout`,
  `Refund`, `Invoice` or `Commission` model. The SRS requires escrow holding until DELIVERED
  plus dispute window (ESC-8.2), a settlement engine (SET-8.1) and a double-entry ledger
  (§8.9). None of it exists. The admin console has a `finance` page; it renders fixtures.
- **Phase 9 — Privacy & compliance (retention, deletion, export).** Zero matches in the API for
  data export, account deletion, retention or anonymisation. Consent is not captured anywhere.

Also: `ScheduleModule.forRoot()` is registered in `app.module.ts` but there is **not a single
`@Cron` handler in the codebase.** Every time-driven obligation in the SRS — escrow release,
settlement runs, subscription renewal, retention deletion, dispute-window expiry — currently has
no runner.

---

## 2. Phase-by-phase scoreboard

| SRS Phase | Backend | Frontend | Evidence / what's short |
|---|---|---|---|
| 1 · Foundation, core patterns, baseline services | ~90% | n/a | Config, Prisma, Redis, filters, providers, health all present. Providers are interface-complete but three are stubs (§5). |
| 2 · Customer flows (browse, cart, checkout, tracking) | ~85% | ~60% | API complete incl. cart, checkout, coupon preview, cancel, tracking. Customer site has no addresses screen, no returns/refunds, no group-order UI, no loyalty/Gold UI, no policy-acceptance gate; `signup` still duplicates `login`. |
| 3 · Seller & staff flows | ~88% | ~50% (unwired) | Catalog/inventory/orders/promotions/staff/roles APIs exist, and onboarding (apply → review → approve) is now a real module (§8). Console renders all of it from fixtures. **Still no registration or onboarding UI at all.** |
| 4 · Delivery operations (tasks, rider lifecycle, COD capture) | ~75% | ~40% | Self-delivery (Model 4A) board, realtime rider GPS gateway and customer live map all real. Rider app deferred by you. COD reconciliation has no ledger to post to. |
| 5 · Admin governance (approvals, controls, auditing) | ~78% | ~55% (unwired) | Admin module, fraud, audit log, policy versioning present, and the shop-application review queue now has a service and a controller (§8) with audit entries on every decision. The approvals page is still fixtures over it. |
| 6 · UX guarantees & resilience | ~60% | ~45% | Offline pages + manifests exist. Accessibility (§6.7) not systematically audited. Bilingual EN/NP is the big miss: `lib/i18n.ts` exists in all three apps but is referenced by only 5/49, 1/34 and 2/41 components — the UI is effectively English-only. |
| 7 · Security core (auth, RBAC, tenant isolation) | ~85% | ~5% | Strong on the server: OTP-only auth, argon2, rotating refresh bound to a `Session` row, default-deny RBAC over one catalogue, shop-lifecycle gating, tenancy checks. Client side has no session, no guards, no logout. |
| 8 · Finance core (ledger, escrow, settlement, refunds) | **~10%** | ~20% (fixtures) | `PaymentIntent` only. No escrow, no ledger, no settlement, no refunds, no payouts. eSewa/Khalti `verify()` exists as an interface with no callback route to invoke it. |
| 9 · Privacy & compliance (retention, deletion, export) | **0%** | 0% | No DSR endpoints, no consent record, no retention job, no anonymisation. |
| 10 · Legal safety & production readiness | ~55% | ~75% | Policy documents + versioned acceptance modelled and served; the five legal pages are written and substantive. Enforcement due-process flow (EN-10.3) and production-readiness checklist not done. |

---

## 3. What is genuinely built and can be trusted (modulo never having been run)

**API — 30 controllers, 171 routes.** Auth (phone OTP, no passwords), users + addresses, catalog
(public + seller), discovery, cart, coupons, orders (customer + seller), delivery + rider
self-service, realtime GPS gateway, reviews, notifications, support tickets + disputes,
engagement (loyalty, referrals, Gold), group orders, policy versioning + acceptance, admin
platform + fraud, audit logging, RBAC roles/staff for both scopes, and the invite subsystem.

**RBAC, and I want to be specific because this was your question.** One permission catalogue,
two scopes (SHOP, PLATFORM), 49 keys, default-deny enforced by a global guard: a route with no
`@RequirePermissions` is reachable by any authenticated user, so the guard order in
`app.module.ts` is throttle → authenticate → authorise. Privileged roles (shop Owner, platform
Super Admin) short-circuit granular checks. On top of RBAC sits `shop-status.policy.ts`, which
answers the separate question "may this *shop* trade yet?" — preparation always allowed, trading
requires approval, suspension is read-only, each refusal carrying a sentence the owner can act on.

**Provisioning — the answer to "how does the owner distribute account details".** Nobody
distributes account details, because there are no passwords to distribute. The owner names a
phone number and a role; GoPasal texts *that number* a link plus a 6-digit code; the teammate
signs in with their own OTP. Two secrets per invite: a 32-byte token stored as a plain SHA-256
digest (so it is index-lookupable but not recoverable from a database dump) and a short code
stored salted by phone, never used to *find* an invite, compared in constant time, capped at 8
attempts. The real authenticating factor is the third one — accepting requires an OTP-verified
session on the exact invited number, so a forwarded link is worthless. Invites are visible,
resendable and revocable while pending, and SMS failure is recorded rather than thrown, because
a gateway blip must not destroy a credential the owner can still read aloud.

**Three consoles, visually.** 23 customer routes, 16 seller routes, 20 admin routes. Shared
crimson design system in `packages/tokens`, hydration-safe fixed-instant formatting, a
no-SDK map built on one Web-Mercator projection with Mapbox → OSM → canvas degradation.

---

## 4. What is missing, ranked by whether it stops you launching

### Tier 0 — the platform cannot go live without these

**1. Seller registration and onboarding — API DONE 2026-08-23, UI still missing.** The three
models (`ShopApplication`, `ShopApplicationEvent`, `ShopDocument`) now have a real service and two
controllers behind them: `apps/api/src/modules/onboarding/`. An applicant can start, save, submit,
resubmit and withdraw an application; a reviewer holding `shops.view` / `shops.approve` /
`shops.reject` can queue, open, claim, request changes, approve or reject one; approval provisions
the Shop and the Owner `ShopMembership` in one transaction and back-links the application. See §8.
What is still missing is the **UI**: there is no `/register` route in `web-seller` (the app
directory contains only `(app)`, `login`, `offline`, `page.tsx`, `globals.css`, `manifest.ts`), and
the admin approvals page is still fixtures over a queue endpoint that now exists. Document upload
is **done** (Tier-0 item 4 below), so the KYC set is now hard-required at submit *and* re-checked at
approve — a rejected scan does not count as present.

**2. Nothing is connected.** `web-seller`: 0 files containing `fetch`/`axios`/`useSWR`.
`web-admin`: 0. `web-customer`: 1. Every list, every form, every counter is a fixture. Every
mutation — create a role, suspend a teammate, approve a shop, publish a policy version — is React
state that vanishes on refresh.

**3. No authentication or route guards on the consoles.** No `middleware.ts` in any of the three
apps. `web-seller/app/login/page.tsx` validates the phone shape, sets `step: "otp"`, then pushes
to `/dashboard` without ever calling the API. Permissions in the seller console come from a
dropdown you pick yourself. There is no token store, no refresh, no logout that revokes anything.
As it stands the admin console is a public website.

**4. ~~No file upload endpoint.~~ DONE (2026-08-23).** `apps/api/src/modules/uploads/` now sits
between HTTP and `StorageProvider`: `upload-rules.ts` cross-checks the declared `Content-Type`, the
filename extension and the sniffed magic bytes and refuses on any disagreement, generates
`private/…/<32 hex>.<ext>` keys from the *sniffed* type (so a client filename can never become a
path), and enforces `UPLOAD_MAX_IMAGE_BYTES` / `UPLOAD_MAX_DOCUMENT_BYTES` under a 32 MiB multipart
hard bound. Onboarding consumes it through `documents.service.ts` — five endpoints (applicant
upload / download / delete, reviewer download / accept-reject), private prefix outside the static
tree, `attachment` + `no-store` + `nosniff` + `default-src 'none'; sandbox` on the way out, 404
rather than 403 on someone else's document, audit entry and timeline event on every action.
Remaining for **catalog images** and **proof-of-delivery photos**: those two call sites are not
wired yet, but the provider, the validator and the key builder they need are done and tested
(113 focused tests).

**5. Payments cannot settle.** `PaymentProvider.verify()` is defined and implemented for eSewa and
Khalti, but there is no callback/webhook route anywhere for the gateway to hit, so a digital
payment can be initiated and never confirmed. SRS PM-8.2 explicitly requires webhook-or-callback
verification. COD works end to end; nothing else does.

**6. Finance core (whole of Phase 8).** Needs, at minimum: `LedgerEntry` (double-entry),
`EscrowHold`, `Settlement` + `SettlementLine`, `Payout`, `Refund`, and a commission
configuration. Then the event handlers that post to them and the cron that releases escrow after
DELIVERED + dispute window. Without this you cannot pay a single seller, refund a single customer,
or answer "how much do we owe whom" — and you cannot reconcile COD cash.

### Tier 1 — launch is possible but the platform is not defensible

- **Privacy (whole of Phase 9).** Export-my-data, delete-my-account, retention windows,
  anonymisation on deletion, consent capture with purpose limitation. Currently zero.
- **No scheduled jobs at all.** `ScheduleModule` is registered; no `@Cron` exists. Escrow release,
  settlement runs, Gold renewal, dispute-window expiry, retention deletion, OTP/session cleanup
  all need runners.
- **Seven permission keys are declared but never enforced:** `analytics.view`, `catalog.import`,
  `coupons.manage`, `finance.view`, `inventory.view`, `orders.complete`, `settings.view`. A role
  can be granted them and it changes nothing — that is a silent authorisation lie, and it is
  exactly the kind of thing an auditor fails you on.
- **`POST /seller/shops` is reachable by any authenticated user** with no permission, no rate
  limit and no cap (`catalog.seller.controller.ts:28`). It must be deleted in favour of the
  onboarding flow.
- **Bilingual EN/NP is nominal.** The i18n module is imported by 5 of 49 customer components,
  1 of 34 seller, 2 of 41 admin. Nepali is not actually available.
- **`SponsoredListing` has a model and a seller UI and no code path.** Same for the `Permission`
  model, which suggests permissions live only in code — fine, but then seeding must be verified.
- **No session management surface.** SRS §7.8 wants session visibility and revocation; there is no
  list-my-sessions or revoke-all route, so a stolen device cannot be cut off.
- **Enforcement due process (EN-10.3).** Suspensions and bans need a notice → appeal → decision
  trail. Fraud flags exist; the due-process flow does not.

### Tier 2 — quality and completeness

- Customer site: no addresses manager, no returns/refunds journey, no group-order UI (API is
  there), no loyalty/referral/Gold screens (API is there), no notifications centre, no
  policy-acceptance gate at checkout, and `app/signup/page.tsx` still exists beside `login`
  despite the decision to unify on one OTP entry.
- Seller console: no payouts/earnings screen, no shop switcher for multi-shop owners, no
  notifications centre, no help/support surface.
- Admin console: no refunds or payout runs, no rider management, no notifications.
- Accessibility (SRS §6.7) has never been audited — icon-only buttons, focus visibility, semantics
  of clickable containers, colour-only state signalling all need a pass.
- Test suite: `apps/api` has 197 passing `node:test` unit tests (`pnpm --filter @gopasal/api test`)
  covering config validation, the SigV4 signer, and the SMS/storage/map/push/geo providers. There
  are still no integration or e2e tests, and none of the three web apps has any test at all.
- Observability: audit logging is good; there is no error tracking, no metrics, no structured
  request logging, no alerting.

---

## 5. Security ledger

**Closed in the last two sessions.** Cross-tenant role editing (a shop could edit another shop's
roles); platform privilege escalation via role assignment; unapproved and suspended shops able to
trade (fixed by `shop-status.policy.ts`); a development OTP shortcut and default dev JWT secrets
reachable in production (both now refused at boot by `validateConfig`, which runs in every
environment and names the offending variable); and the largest one — access being
granted to people who were never told, since `MembershipsService.invite()` used to create an
**ACTIVE** membership from a bare phone number with no notification, and `assignPlatform()`
silently created `User` rows. Both paths are gone; provisioning now flows only through invites.

**Open, and I will close them.** No console-side authentication (Tier 0 #3) is the standing
critical issue. `POST /seller/shops` unguarded. Seven unenforced permissions. No session
revocation. Rider routes carry no `@RequirePermissions` — I checked the service layer and identity
is taken from the JWT with ownership enforced inside `myRider`/`riderUpdateStatus`, so this is
ownership-scoped rather than open, but it deserves an explicit rider guard so the property is
declared rather than incidental.

**Standing rules I am holding to.** No secret is ever hardcoded; every provider credential is an
env var. No console screen accepts or displays a secret value — admin Settings shows variable
*names* and whether they are set, never contents. Invite secrets are shown exactly once at
creation and are not recoverable afterwards, including from the audit log (I verified
`AuditInterceptor.slim()` picks `{id, status, code}` off the response *root*, and invite creation
returns `{invite, shareOnce}`, so `shareOnce.code` is not captured).

**Compilation status — verified, 22 August 2026.** The API now compiles and lints clean. `tsc
--noEmit` exits 0 across `apps/api` (135 files, `src/**` plus `prisma/seed.ts`) and all three web
apps; `nest build` exits 0 and emits `dist/main.js`; `eslint --max-warnings 0` exits 0 for
`apps/api` and for all three web apps. Getting there took two rounds: the API's ESLint suite went
166 errors → 0, and a reported 87 TypeScript errors turned out to be one root cause — the Prisma
Client had never been generated on the target machine, which reduces `@prisma/client` to a stub
and erases every enum and `Prisma.*Input` type. Generation is now enforced by
`postinstall`/`predev`/`prebuild`/`prelint`/`pretypecheck` in `apps/api/package.json`, with
`prisma` and `@prisma/client` pinned to the same exact version, so an install can no longer leave
a placeholder client behind. Not a single `any`, `!`, `@ts-ignore` or relaxed compiler flag was
used to reach zero.

**What still cannot be verified from here.** This machine has no npm registry access, so nothing
has been *migrated* or *executed*, and `next build` cannot run at all because all three web apps
use `next/font/google`, which fetches at build time. There is also still no `prisma/migrations`
directory. Structural validation continues to report 44 models / 23 enums / 134 consistent
relation edges and no unresolved imports. **The first `pnpm install && prisma migrate dev` on your
machine is where runtime verification begins** — compile-time verification is done.

### 5b. The first migration: PostgreSQL authentication (RESOLVED 2026-08-23)

The first `prisma migrate dev` failed with `Authentication failed against database server at
localhost … credentials for "gopasal" are not valid`. Diagnosis: **`apps/api/.env` line 16 and
`docker-compose.yml` already agree byte-for-byte** — user `gopasal`, password `gopasal_dev_pw`,
database `gopasal`, `localhost:5432`, no stray quotes, no trailing CR, and no shadowing
`prisma/.env`. So this is not a configuration typo, and the application password must not be
changed. The credential that matters lives inside the running cluster, and there are only three
candidates: a **stale `gopasal_pgdata` volume** (`POSTGRES_PASSWORD` is honoured by `initdb` only
on an empty data directory, so a volume left over from an earlier compose file keeps its original
password), a **second PostgreSQL occupying port 5432** (the connection never reaches the container;
PostgreSQL reports "password authentication failed" rather than "role does not exist", so the two
symptoms are identical from the client), or a **container that is stopped or still initialising**.

`scripts/db-doctor.sh` (`pnpm db:doctor`, `pnpm db:repair`) discriminates between them and repairs
in place. It reaches the cluster over the container's unix socket, which the official entrypoint
initialises with `--auth-local=trust`, so no password is needed to read and fix the role. Repairs
are additive only — `ALTER ROLE … PASSWORD`, `CREATE ROLE`, `CREATE DATABASE`, `CREATE EXTENSION` —
never `DROP`, never `docker compose down -v`, never `docker volume rm`, never `migrate reset`. It
also checks the two prerequisites `migrate dev` needs beyond a working login: **CREATEDB** for the
shadow database, and **PostGIS installable**, since the datasource declares `extensions = [postgis]`.

Two latent defects on the path to a seeded database were fixed at the same time. `db:seed` ran
`ts-node --transpile-only prisma/seed.ts` directly, but `new PrismaClient()` does not read `.env` —
only the Prisma CLI does — so the seed would have failed with "Environment variable not found:
DATABASE_URL" even after the connection was fixed; it now runs `prisma db seed`, which loads `.env`
and reuses the existing `prisma.seed` entry. And the API's lint glob was `src/**/*.ts` only, so
`prisma/seed.ts` was never linted; the glob now includes `prisma/*.ts`, which immediately surfaced
one unnecessary non-null assertion (`role!.id`) that has been removed.

**Not verified:** this environment has no Docker, no PostgreSQL client and no network, so
reachability, `migrate dev --name init` and the seed have *not* been run here. Those four steps run
on your machine.

**What the first run on your machine actually proved.** Cause A is **ruled out** and cause B is
**confirmed**. The volume provenance settles A: the doctor reported the volume created at
`2026-08-22T19:35:28+05:30` and the cluster `initdb`'d at `2026-08-22 18:34:09` UTC — the data
directory was empty and the cluster was built during that very run, so no stale password ever
existed and nothing needs to be reset. B is confirmed by a contradiction in the same output:
`the container publishes NO host port for 5432` alongside `TCP connect to localhost:5432 succeeds`
and `the cluster ACCEPTS gopasal / this password on database gopasal`, after which `pnpm db:migrate`
still failed with `P1000`. A cluster nothing can reach cannot be the cluster that rejected the
password, so **Prisma is authenticating against a different PostgreSQL**. The fix is
`pnpm db:recreate` (`docker compose up -d --force-recreate postgres redis`), which rebuilds the
container so it picks up the `ports:` mapping and **preserves `gopasal_pgdata` and everything in
it**; if the configured host port is genuinely owned by another server, `pnpm db:portcheck` names it
and `pnpm db:setports <postgres> <redis>` moves GoPasal aside, updating both files at once.

Three real defects in the doctor were exposed by that run and are fixed. It reported "the cluster
REJECTS gopasal" when `psql` had actually said *connection refused* — the cluster was still running
`initdb`, during which PostgreSQL listens on the unix socket only; it now waits up to 90s for health
to leave `starting` and classifies refusal separately from rejection, because conflating the two is
what sends you looking for a password problem you do not have. Its "VERIFIED" claim was unsound
because it tested from *inside* the container; the final check now runs `prisma db execute` from
`apps/api` over the host path, the exact client and route that failed. And its foreign-listener
check silently skipped on a host with neither `lsof` nor `ss`; it now falls back to
`/proc/net/tcp` (listening state `0A`, hex port, socket inode → `/proc/*/fd`), compares what compose
declares against what the container actually binds, checks `docker ps` for another publisher, and
calls `scripts/pg-probe.mjs`.

`scripts/pg-probe.mjs` (`pnpm db:probe`) is a zero-dependency Node probe for machines with no `psql`,
no `lsof` and no `ss`. It speaks just enough of the PostgreSQL v3 frontend protocol — `SSLRequest`
(`80877103`) for "is this PostgreSQL at all", then a `StartupMessage` (`196608`) — to classify the
peer without valid credentials: `ECONNREFUSED` means nothing is listening, no `S`/`N` byte means the
peer is not PostgreSQL, an `R` message names the auth method it demands (SCRAM/MD5/cleartext/trust),
and an `E` message is printed field by field, which is often where a foreign server names itself.
Validated here against four peers: a refused port, an HTTP listener (`replied 0x48`), a fake server
demanding `SASL / SCRAM-SHA-256`, and a fake server returning `FATAL 28000 role "gopasal" does not
exist`.

`docker-compose.yml` now takes the host side of both mappings from
`${POSTGRES_HOST_PORT:-15432}` / `${REDIS_HOST_PORT:-6380}` (see the current table below), so
sidestepping a port conflict needs no file edit by hand — `pnpm db:setports` writes both places.

**Resolution: GoPasal moved off the default host ports.** The second run identified the occupants:
`pnpm db:probe` found a PostgreSQL on `localhost:5432` demanding SCRAM-SHA-256, and
`docker compose up` failed with `Bind for 0.0.0.0:6379 failed: port is already allocated` — so a
Redis owns 6379 as well. That bind failure is also why `gopasal-postgres` was stuck in `created`:
compose aborts the whole `up` when one service cannot bind, leaving the other half-applied. Both
occupants are unrelated services the developer depends on, so **nothing was stopped, disabled or
reconfigured.** GoPasal took different host ports instead:

| service | old host port | new host port | container port |
| --- | --- | --- | --- |
| `gopasal-postgres` | 5432 | **5433** | 5432 (unchanged) |
| `gopasal-redis` | 6379 | **6380** | 6379 (unchanged) |

Credentials, the Prisma schema, the datasource and the `gopasal_pgdata` volume were all left alone.
Changed: `docker-compose.yml` (both mappings, defaults now 5433/6380), `apps/api/.env` and
`apps/api/.env.example` (`DATABASE_URL` port, `REDIS_PORT`), `package.json` (`db:ports`),
`scripts/db-doctor.sh` and `scripts/pg-probe.mjs`. Redis needed no code change: the API reads
`REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` discretely in `src/config/configuration.ts`, never a URL.

Three further doctor gaps that run exposed, now closed. It reported only "Cause C — container not
running" while the probe on the same screen showed a foreign PostgreSQL answering the app's port;
that combination is now called decisive in its own right, since a server answering a port our
container does not publish cannot be ours. Step 1 compared user, password and database but **not the
host port**, which is the precise drift that caused this outage — it now resolves the host side of
the compose mapping (literal, `addr:port`, or `${VAR:-default}`, with an exported override winning)
and fails loudly on mismatch. And Redis was unchecked entirely; step 3b now verifies its container
state, host mapping against `REDIS_PORT`, TCP reachability and `PING`. `pnpm db:probe` with no
arguments now targets whatever `DATABASE_URL` dials rather than a hardcoded 5432, so it follows the
app instead of a guess.

**Then 5433 turned out to be occupied too**, which is the more instructive half of this story.
`pnpm db:up` failed with `failed to bind host port 0.0.0.0:5433/tcp: address already in use`, and the
doctor fingerprinted the occupant as `PostgreSQL server present on localhost:5433 (SSL supported)`
asking for SCRAM-SHA-256 — where the server on 5432 reports SSL **not** supported. Two different
foreign PostgreSQL servers, then, not one seen twice, and the machine is a Debian/Ubuntu-style host
where additional native clusters are handed 5433, 5434, … in order. "The next port along" was
therefore the *most* likely port to be taken, and picking 5433 was a guess dressed up as a decision.

| service | first choice | second choice | now | container port |
| --- | --- | --- | --- | --- |
| `gopasal-postgres` | 5432 | 5433 | **127.0.0.1:15432** | 5432 (unchanged) |
| `gopasal-redis` | 6379 | 6380 | **127.0.0.1:6380** | 6379 (unchanged) |

Redis on 6380 was already working — container running, `PING` answered — so only PostgreSQL moved.
Both mappings also gained an explicit `127.0.0.1` address instead of the `0.0.0.0` Docker defaults
to, so a dev database holding a dev password, and a Redis with no password at all, are not reachable
from the LAN. Container-internal ports, credentials, `prisma/schema.prisma` and the `gopasal_pgdata`
volume were untouched, and no command in the repo or its docs stops, disables or reconfigures
anything on the host.

The durable fix is not the number, it is that **a port is now proven free by binding it** rather than
assumed free. `scripts/db-ports.mjs` (stdlib only; starts, stops and modifies nothing) does what the
Docker daemon does — `net.createServer().listen({ host, port, exclusive: true })` — which is the only
authoritative test, and it catches a `0.0.0.0` listener blocking `127.0.0.1` as well:

| command | does |
| --- | --- |
| `pnpm db:portcheck` | resolves both compose mappings, bind-tests them, names any occupant over the PostgreSQL/Redis handshake (no credentials, no `psql`, no `lsof`), and reports drift against `apps/api/.env` |
| `pnpm db:portfind` | suggests the first pair this machine will actually allow, capped below 32768 so an outgoing connection cannot steal it from the ephemeral range |
| `pnpm db:setports <pg> <redis>` | writes `./.env` **and** `apps/api/.env` together — the only supported way to move a port |
| `node scripts/db-ports.mjs print <postgres\|redis>` | machine-readable `<addr> <port>`, used by `db-doctor.sh` |

`db:up` and `db:recreate` run the check first and refuse rather than leaving containers half-applied,
`db:setports` refuses an occupied port unless `--force` and writes `apps/api/.env` first inside a
try/catch so a throw cannot leave the two files disagreeing, and the doctor resolves both host ports
through node — necessary because `127.0.0.1:${POSTGRES_HOST_PORT:-15432}:5432` cannot be split on `:`
before the substitution is expanded, which is exactly what the old sed did. A port lives in two
files; editing one is how you end up debugging a password that was never wrong.

One more piece of misleading output went with it: with `lsof` present but nothing listening, the
doctor printed "could not enumerate listeners" — reporting a passing check as a skipped one. It now
distinguishes "the tool found nothing" from "there was no tool".

Changed for this second move: `docker-compose.yml`, `apps/api/.env`, `apps/api/.env.example`,
`package.json`, `scripts/db-doctor.sh`, `README.md`, and new `scripts/db-ports.mjs`. Nothing under
`apps/api/src`.

**Resolved on 2026-08-23. The gate is open.** On `127.0.0.1:15432` the full chain ran clean:
`db:portcheck` bindable and consistent → both containers `Up` with
`127.0.0.1:15432->5432/tcp` and `127.0.0.1:6380->6379/tcp` → `pnpm db:migrate` applied
`20260822193823_init` ("Your database is now in sync with your schema") → `pnpm db:seed` seeded 49
permissions, 5 platform + 6 shop role templates, 6 categories, 3 shops, staff, riders, products, 3
customers, coupon `WELCOME100`, 3 demo orders, 5 published policies, a Gold subscription and a
referral code. Demo logins are in the seed output; OTP codes are printed to the API log in dev.

Prisma asked to reset the `public` schema before that first migration, and the reset cost nothing:
the reported drift was only `[+] Added extensions` (postgis, postgis_topology,
postgis_tiger_geocoder, fuzzystrmatch), which the `postgis/postgis` image installs itself, so an
empty database looks *ahead* of an empty migration history. There were no application tables and no
rows at that point — this was the first migration ever to reach the cluster — and `gopasal_pgdata`
(compose-qualified `gopasal_gopasal_pgdata`) was never removed.

**One last doctor defect that run exposed, now fixed.** Its verdict announced
`CAUSE A LIKELY: the volume predates the current compose file, so the current POSTGRES_PASSWORD was
never applied` on a cluster where steps 5, 6 and 8 had all just passed — and then `prisma migrate
dev` authenticated fine. Two causes, both structural. The volume-vs-compose *mtime* comparison is a
weak signal that any edit to `docker-compose.yml` (a port, even a comment) sets off, and it was
being emitted as a leading finding rather than deferred; it is now a `!` note in step 4 that says so
in plain terms, and at verdict time it is either suppressed as **RULED OUT** whenever a login
succeeded or promoted to a finding only when none did. More importantly, the decisive end-to-end
check — Prisma's own client, over the host path, the exact route that produced P1000 — ran *only*
under `--repair`, so a diagnostic run had no strong evidence to overrule the weak one; it now runs on
every invocation, is read-only (`select 1`), and drives both the verdict and the exit code. While
fixing that, the verdict also stopped collapsing "nothing is listening" into "you are talking to a
different PostgreSQL": those need opposite advice, and it is the same conflation of *connection
refused* with *authentication failed* the script was written to prevent. `--repair` additionally now
skips `ALTER ROLE … PASSWORD` when the password already works, so it is a genuine no-op on a healthy
cluster.

---

### 5c. External-dependency audit and local development adapters (2026-08-23)

The goal was a specific one: **development must be genuinely functional end-to-end with no
production credential at all**, and the *same* application code must switch to real vendors purely
through environment configuration. Not mocked, not bypassed — functional. Every external dependency
in the API was inventoried and classified:

- **A — must talk to a real external service in development.** Empty. Nothing in GoPasal needs a
  vendor to be reachable in order to develop against it.
- **B — deserves a proper local implementation.** SMS/OTP, file storage, maps/routing.
- **C — local emulator or container.** PostgreSQL + PostGIS, Redis, and optionally MinIO for the
  S3 code path.
- **D — production-only credential.** JWT secrets, `PUBLIC_URL`, the payment gateways, FCM.

| Dependency | Local implementation | Production provider | Required before deployment? | Current status |
|---|---|---|---|---|
| SMS / OTP | `SMS_PROVIDER=log` — real OTP printed to the API log; optional JSONL outbox via `SMS_DEV_OUTBOX_FILE` | Sparrow SMS (`sparrow`) or Twilio (`twilio`) | **Yes — hard blocker.** Production refuses to boot on `log` | Done. 22 tests |
| File / object storage | `STORAGE_PROVIDER=local` — real bytes under `apps/api/uploads`; the `public/` prefix is served back at `/uploads/public/<key>`, the `private/` prefix is outside the static tree and reachable only through an authorised route. MinIO available for the S3 path (`docker compose --profile s3 up -d minio`) | Any S3-compatible bucket: AWS, Cloudflare R2, DigitalOcean Spaces — **must not be public-read at the root**; grant anonymous read to `public/*` only | **Yes** — KYC documents, product images and proof-of-delivery photos must survive a redeploy | Provider + HTTP upload path done (113 tests); KYC wired, catalog images and PoD photos not yet |
| Maps / routing / geocoding | `MAP_PROVIDER=osm` — real great-circle distance, `degraded: true`, key-free MapLibre style; reverse geocoding returns `null`, never an invented address | Mapbox (`MAPBOX_ACCESS_TOKEN`) | No — optional quality upgrade. GoPasal promises no ETAs, so a routed distance is not load-bearing | Done. 15 + 9 tests |
| Payments — Cash on Delivery | Fully implemented; no gateway exists to emulate | Same code | No external dependency | Done. Carries the entire local flow |
| Payments — eSewa / Khalti | **Deliberately none.** Sandbox base URLs are pre-configured; the method reports `enabled: false` and *rejects* if reached | eSewa ePay v2, Khalti ePayment v2 | Only if launching with digital payments | Not implemented (tasks #86/#87). Refuses rather than fabricating a redirect. 14 tests |
| Push notifications | `PUSH_PROVIDER=log`, `delivers === false`. In-app notifications are database rows and fully work | FCM — not implemented; needs a device-token registry first | No — deferred with the mobile apps | Honest placeholder. `PUSH_PROVIDER=fcm` is refused at boot |
| Email | **Not used anywhere.** Verified by grep: no SMTP, nodemailer, SendGrid, Mailgun or SES reference exists | None | No | Out of scope by design — phone-first platform; invites go by SMS + in-app |
| Inbound webhooks | None exist | Payment gateway callbacks, with signature verification | Only with digital payments | Task #87 |
| Third-party analytics | None. Every metric is computed in-database from GoPasal's own data | None planned | No | Intentional |
| Error monitoring | None | Sentry or equivalent | Recommended, not blocking | **Open gap** (task #91) |
| PostgreSQL + PostGIS | `postgis/postgis:16` on `127.0.0.1:15432` | Managed Postgres 16 with the `postgis` extension | **Yes** | Done — migrated and seeded |
| Redis | `redis:7` on `127.0.0.1:6380` | Managed Redis 7 | **Yes** — sessions, OTP store, socket fan-out, BullMQ | Done |
| Background jobs (BullMQ) | Runs on the same local Redis | Same | Covered by Redis | Done |

**The rule that makes this safe: nothing silently downgrades.** Every provider factory throws on a
name it does not implement rather than falling back — this is not hypothetical, `MAP_PROVIDER=mapbox`
without a token used to route every delivery by haversine while the logs said "mapbox". A missing
credential now fails at boot naming the exact variable. `validateConfig` runs in *all* environments
and additionally refuses, in production only, `SMS_PROVIDER=log`, `SMS_DEV_OUTBOX_FILE`, the
development JWT secrets, two identical JWT secrets, and a missing `PUBLIC_URL` or `DATABASE_URL`.

**And no local adapter fakes success.** The log SMS transport reports `delivers === false` and makes
zero network calls; the OSM router marks every result `degraded` and returns no geometry rather than
a straight line pretending to be a road; reverse geocoding returns `null`; the payment gateways
reject. The OTP is *identical* in both modes — same length, hashing, expiry, attempt ceiling and
per-phone rate limit, verified through the same code path — and onboarding, seller login and staff
invitations all resolve the one `SMS_PROVIDER` token, since `AuthModule` exports it and
`InvitesModule` imports it. There is no universal code and no "accept any OTP" switch anywhere.

**Verified, 23 August 2026.** Every claim above now has a test behind it: `prisma validate` passes,
`tsc --noEmit` and `eslint --max-warnings 0` report zero, `nest build` emits `dist/main.js`, and
`pnpm --filter @gopasal/api test` runs **321 tests across 53 suites, all passing** — configuration
validation and its refusals, the hand-rolled SigV4 signer against AWS's published PutObject vector
(with the signature re-derived in-test rather than pinned as a recalled constant), every provider
family, the onboarding state machine cell by cell, and the whole upload path. The suite is hermetic:
config is passed in rather than read from `process.env`, `fetch` is stubbed and restored, and the
storage, upload and document tests write real files into a temp directory and read them back — a
provider that returned a URL without writing anything would pass a mock and fail a
user. Still unverified from here: MinIO (no Docker in the authoring sandbox, validated as YAML only)
and an actual API boot.

---

## 6. What each surface should be (since you asked)

**`gopasal.com` — the customer front door.** Discovery, shop pages, cart, checkout, order
tracking with the rider's live position, support. Framed as *contact the shopkeeper*, never as a
speed promise: no ETAs, no "arriving in X minutes", no countdowns. Nepali and English of equal
standing.

**`seller.gopasal.com` — the shopkeeper's whole business, and its own front door.** This is the
part most implementations get wrong, so to be explicit about the flow:

1. A shopkeeper lands on `seller.gopasal.com`, taps *Register your shop*, and signs in with their
   phone — same OTP, no separate seller account type. A person is a person; a shop is something
   they apply for.
2. They fill a saveable wizard: shop identity, location and delivery radius, the person behind it,
   optional business registration (many Nepali kirana shops have none, so PAN/VAT must be optional
   without penalty), payout destination, KYC documents, and acceptance of the seller agreement at
   the version current on submit.
3. They submit and get a human reference like `GP-7K3QD2`. Their console from that moment is a
   **status screen**, not an empty dashboard — submitted, under review, changes requested with the
   exact fields highlighted, approved, or rejected with a reason they can act on and resubmit
   against.
4. On approval the shop is created, the applicant becomes its Owner, and the console unlocks —
   but trading stays gated by shop status, so a shop can prepare its catalogue before it is live.
5. The Owner then invites staff by phone number and role. They never create a password for anyone,
   because there are none to create. Roles are Owner, Manager, Order Handler, Inventory Editor,
   Support Staff, Delivery — and the Owner can clone any of them into a custom role and tick
   exactly the permissions they want, scoped to their shop only.

**`admin.gopasal.com` — GoPasal's own operations floor.** Shop application review, user and
catalogue moderation, disputes, fraud, policy versioning, finance and settlement, audit, and
platform staff management. Platform roles are Super Admin, Operations Admin, Support Agent,
Compliance Reviewer, Finance Viewer. Super Admin is deliberately **not grantable from any
console** — the first one is seeded out of band, because handing out privileged platform access by
SMS link is precisely the escalation path RBAC exists to close.

---

## 7. What you need to do — your end

Nothing here is optional, and most of it I cannot do for you because it requires your identity,
your money, or a machine with network access.

### 7.1 Immediately, so I can stop guessing

The database gate is already open (§5b) and the API compiles, lints, builds and passes 321 tests
(§5c). What is left to prove on your machine is the parts that need a running process or a network:

```bash
cd gopasal
pnpm install
pnpm db:up                    # bind-tests the ports, then postgres 16 + postgis, redis 7
pnpm --filter @gopasal/api test         # expect 211 passing — no database needed
pnpm dev                      # API on :4000, three web apps
```

Two things I still cannot verify from here and would like the output of: **`pnpm build` for the
three web apps** (`next build` cannot run in the authoring sandbox because all three use
`next/font/google`, which fetches at build time), and **`docker compose --profile s3 up -d minio`**
followed by a run with `STORAGE_PROVIDER=s3` — the S3 signer is unit-tested against AWS's published
vector, but it has never spoken to a real bucket. Send anything either one prints, verbatim.

### 7.2 Accounts and credentials to obtain (all consumed as env vars, never committed)

Nothing in this table is needed to *develop* — see §5c, local development runs on real local
adapters with zero credentials. This is the list for **production deployment**, ordered by lead time.

| What | Why it blocks something | Notes |
|---|---|---|
| **Sparrow SMS** account + `SPARROW_SMS_TOKEN` + operator-approved sender ID (`SPARROW_SMS_FROM`) | Hard blocker. OTP login *and* staff invites both go through it. Production refuses to boot on `SMS_PROVIDER=log`. | **Start this first — the sender ID needs NTA/operator approval and that takes days.** Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`) is the alternative and needs Nepal messaging geo-permission enabled on the account. |
| **Two distinct JWT secrets** — `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Hard blocker. Boot refuses if they are the dev defaults, identical, or shorter than 32 bytes. | `openssl rand -hex 32`, run twice. Store them in your secret manager, not in a file you can grep. |
| **`PUBLIC_URL`** — the API's own external origin, e.g. `https://api.gopasal.com` | Hard blocker in production. Signed links and locally-served upload URLs are built from it. | No trailing slash needed; one is trimmed. |
| **Production `DATABASE_URL`** — Postgres 16 with the `postgis` extension installable | Hard blocker. | Managed Postgres is fine; confirm the provider allows `CREATE EXTENSION postgis`. |
| **Redis host / port / password** (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`) | Hard blocker — sessions, the OTP store, socket fan-out and BullMQ all live here. | Read discretely, never as a URL. Use a password in production; the dev container has none. |
| **Object storage**: bucket + access key + secret (`S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, plus `S3_ENDPOINT`/`S3_REGION` for non-AWS) | Needed the moment real KYC documents, product images or proof-of-delivery photos exist — local disk does not survive a redeploy. | AWS, Cloudflare R2, DigitalOcean Spaces and MinIO all work against the same hand-rolled SigV4 signer. Optional `S3_PUBLIC_BASE_URL` for a CDN in front. |
| Domain + DNS for `gopasal.com`, `seller.`, `admin.`, `api.` + TLS | Deployment | — |
| **Mapbox** token (`MAPBOX_ACCESS_TOKEN`, and `NEXT_PUBLIC_MAPBOX_TOKEN` for the browser) | Nicer tiles and true road routing | **Optional.** Degrades to OpenStreetMap, then to a stylised canvas. GoPasal shows distance remaining and never an ETA, so nothing depends on a routed number. |
| **eSewa** (`ESEWA_MERCHANT_CODE`, `ESEWA_SECRET`) and/or **Khalti** (`KHALTI_SECRET_KEY`) | Digital payments only. COD needs nothing. | Needs a registered business. Not urgent — the integration itself is not written yet (§5c, tasks #86/#87), so obtaining these before the finance milestone lands buys nothing. |
| **Sentry DSN** (or equivalent) | Error tracking — none exists today | Recommended before real users; not a boot blocker. |
| **Firebase project** + FCM credentials | Push notifications | Deferred with the mobile apps. `PUSH_PROVIDER=fcm` is refused at boot until a device-token registry exists, so do not buy this yet. |

### 7.3 Decisions only you can make

- **The first Super Admin's phone number.** It gets seeded directly; no console can grant it.
- **Commission model.** Flat percentage, per-category, or per-shop negotiated? The settlement
  engine cannot be written until this is a number.
- **Escrow and dispute windows.** How many hours after DELIVERED before funds release? What is the
  dispute window? SRS ESC-8.2 requires both; it does not pick them for you.
- **Settlement cadence** — daily, weekly, on-demand — and the minimum payout threshold.
- **COD limits** (PM-8.1): maximum order value, and whether store policy or risk score can restrict
  it.
- **Refund policy specifics**: window, who bears delivery cost, restocking rules.
- **KYC strictness**: which of the document kinds are mandatory versus optional for an unregistered
  kirana shop.
- **Legal review.** The five legal pages and the seller agreement are drafted to a professional
  standard but I am not a lawyer and cannot be your counsel. A Nepali commercial lawyer should read
  the marketplace-intermediary and agency-disclaimer positions (SRS LR-10.1, LR-10.2) before you
  trade. Same for company registration, PAN/VAT, and whatever payment-facilitation posture Nepal
  Rastra Bank expects of you.
- **Nepali translation review.** I can produce the strings; a native speaker should approve tone,
  because Nepali register in commerce is not something to machine-translate and hope.

### 7.4 Before real customers

Pilot with a handful of real shopkeepers in one ward before scaling, and watch the onboarding
wizard over their shoulder. Every assumption about technical literacy in this build is mine, not
theirs, and that is where it will show.

---

## 8. What I will do — my end, in order

I work the dependency chain, not the interesting parts first. Nothing below is a placeholder for
"and then polish"; each step ends with something that actually functions.

**Step 1 — Onboarding API** *(DONE 2026-08-23)*. `apps/api/src/modules/onboarding/`: seller
`apply` / `patch` / `current` / `submit` / `resubmit` (same endpoint, chosen by status) /
`withdraw`; admin `queue` / `get` / `claim` / `request-changes` / `approve` / `reject`. Every
transition goes through one state machine (`application-state.ts`) and writes a
`ShopApplicationEvent`; every decision notifies the applicant through the existing event →
`NotificationEventsListener` → `NotificationQueue` path; approval creates the `Shop` plus the Owner
`ShopMembership` in a single transaction and back-links `ShopApplication.shopId`, which is `@unique`
and part of the claim predicate, so a retry or a second reviewer cannot produce a second shop.
`reviewerNote` never crosses into a seller-facing response or an event payload — the two views are
built field by field rather than spread from the row. Admin routes carry `shops.view` /
`shops.approve` / `shops.reject` and an audit entry per decision. `POST /seller/shops` was deleted.
Verified: `prisma validate`, `tsc --noEmit`, `eslint --max-warnings 0`, `nest build`, and 75
`node:test` assertions in `application-state.spec.ts` + `onboarding.approval.spec.ts` (`pnpm test`).
Not verified: real-database atomicity — the workspace cannot reach the host Postgres, so the
transaction is proven only against an in-memory stand-in.

**Step 2 — Uploads + storage** *(DONE 2026-08-23)*. `apps/api/src/modules/uploads/` +
`modules/onboarding/documents.service.ts`. Five endpoints: applicant `POST … /documents`,
`GET … /documents/:id/file`, `DELETE … /documents/:id`; reviewer `GET admin/… /documents/:id/file`
(`shops.view`) and `POST admin/… /documents/:id/review` (`shops.approve`). Validation cross-checks
three independent facts — the declared `Content-Type`, the filename extension and the sniffed magic
bytes — and refuses on any disagreement; JPEG, PNG, WebP and PDF only; the object key is
`private/shop-applications/<appId>/<32 hex>.<ext>` with the extension taken from the *sniffed* type,
so a hostile filename such as `../../etc/cron.d/evil.jpg` is stored under a random name and survives
only as a display label. Two size gates: the multer hard bound (32 MiB) stops a large body before it
is buffered, `UploadsService` then applies the configured ceiling, and `validateConfig` refuses a
configured value above the hard bound so nothing can fall between them.

**One deviation from the plan above, on purpose: there are no signed read URLs.** A KYC scan is
streamed through an authorised route instead — `attachment`, `no-store, private`, `nosniff`,
`default-src 'none'; sandbox`, filename header percent-encoded and quote/CRLF-stripped. A signed URL
is a bearer token in a link that survives in history, proxies and screenshots for as long as its TTL;
a route re-checks the caller on every read and can be revoked instantly. `storageKey` therefore never
appears in any response, and the `private/` prefix is not in the statically served tree at all.
Ownership answers **404, not 403**, through both the owner's application id and the caller's own.
Bytes never touch PostgreSQL — only `kind`, `storageKey`, `fileName`, `mimeType`, `sizeBytes`, review
state and note. Replacement keeps one row and one object and deletes the old bytes (except `OTHER`,
which accumulates to a cap of 12); a failed insert removes the just-written object and a failed
*replacement* keeps the original row and its bytes, so there is never an unreferenced scan and never
a lost one. Upload, replace, remove, reviewer view and accept/reject each write an `AuditLog` entry
and a `ShopApplicationEvent`; the reviewer's view is recorded *before* the bytes are read. Submit and
approve both hard-require the KYC set, and a `REJECTED` scan does not count as present. Verified:
`tsc --noEmit`, `eslint --max-warnings 0`, `nest build`, 321/321 `node:test` (113 of them the upload
path, run against a real `LocalStorageProvider` over a real temp directory rather than a stub).
No schema change was needed. The S3 provider is unchanged — production storage is configuration, not
code.

**Step 3 — Auth for real, on all three consoles.** A shared `packages/api-client`: typed client,
access token in memory with refresh in an httpOnly cookie, silent refresh, 401 retry-once,
`X-Shop-Id` context. Real OTP login. `middleware.ts` plus server-side session checks on every
`(app)` group. Permissions read from `/auth/me` — the seller console's role dropdown dies. Logout
that actually revokes the refresh token, and a sessions screen that can revoke all.

**Step 4 — Seller registration UI.** The `/register` wizard, saveable at every step, with the
status screens for each application state and highlighted fields on a change request. This is the
first flow a real shopkeeper touches, so it gets the most care.

**Step 5 — Invite acceptance UI.** `/join/[token]` on both consoles against the public preview
endpoint, the "an invitation is waiting for you" banner after login, and resend/revoke controls in
the team screens.

**Step 6 — Replace every fixture with a real call.** All three apps, screen by screen, each with
genuine loading, empty, error and permission-denied states. This is the largest single chunk of
work and it is where the prototypes become a product.

**Step 7 — Finance core (Phase 8).** Ledger, escrow, settlement, refunds, payouts, commission —
modelled, event-wired, and cron-driven. Plus eSewa/Khalti callback routes with signature
verification and idempotency, so a replayed webhook cannot double-credit.

**Step 8 — Close the authorisation gaps.** Enforce the seven dead permission keys at their real
call sites, add the explicit rider guard, and add a test that fails if any catalogue key is
unenforced — so this class of defect cannot silently return.

**Step 9 — Privacy (Phase 9).** Consent capture, export-my-data, delete-my-account with
anonymisation that preserves financial records, retention windows, and the cron that enforces them.

**Step 10 — Scheduled jobs.** Every time-driven obligation above, in one reviewable place.

**Step 11 — Bilingual for real.** Every string through i18n, Nepali throughout, with a language
toggle that persists.

**Step 12 — Tests, accessibility, hardening.** Vitest unit tests on the RBAC engine, pricing and
escrow maths; supertest integration tests on the auth, invite, onboarding and checkout flows;
Playwright on the three critical journeys. Then an accessibility pass against SRS §6.7, security
headers, CORS, request logging and error tracking.

**Step 13 — Deployment documentation.** Actual runbook: environments, migrations, backups, rollback,
and what to do when SMS fails at 9pm.

Along the way I will keep the remaining Tier 2 screens moving — customer addresses, returns,
group orders, loyalty, Gold, notifications centre, policy gate, seller payouts and shop switcher,
admin refunds and rider management — and I will delete `app/signup` in favour of the single OTP
entry point.

---

## 9. The gate I will hold this to before saying it is ready

Not "it renders". All of the following, demonstrably:

- A stranger with a phone can register a shop, be reviewed, be rejected with a reason, fix it,
  resubmit, be approved, and trade — without anyone touching a database.
- That owner can invite a teammate who receives an SMS, joins on their own phone, and can do
  exactly what their role permits and nothing else — verified by trying the things they should not
  be able to do.
- No console route is reachable without a valid session, and no permission key exists that changes
  nothing.
- A customer can order, pay by COD or wallet, watch the rider move, dispute, and be refunded — with
  a ledger that balances afterwards.
- A seller gets settled the right amount, and the calculation can be explained line by line.
- A customer can export and delete their own data.
- Nepali works everywhere.
- No secret appears in a repository, a log, an audit record, or on a screen.
- Every one of those journeys is covered by a test that runs in CI.

Until that list is green, the honest answer to "is it ready for the real market" stays no — and I
will keep giving you the honest answer rather than the encouraging one.

