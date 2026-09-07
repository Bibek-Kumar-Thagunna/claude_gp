# Task 10 · Phase 8 — Final production-readiness audit

**Date:** 2026-09-03 · **Scope:** `apps/api`, `apps/web-seller`, and `packages/api-client` (which both consoles compile from source).

This repository is not a git repository, so file modification times are the only record of
change. Wherever this report says Phase 8 touched a file, it means that file's mtime is
newer than `TASK_10_PHASE_7_REPORT.md` (2026-09-01T13:58:36Z), the marker that closed
Phase 7. Every count below was produced by a command run today. Nothing is carried forward
from an earlier report.

## 1. Executive summary

Phase 8 audited the seller console and the API contracts behind it across the ten mandated
areas. No product feature was started, no deferred capability was implemented, no Prisma
schema was changed, no `apps/web-admin` source was modified, and no file was deleted.

Fifty files carry mtimes newer than the boundary: forty-nine with content changes,
plus `apps/web-seller/app/layout.tsx`, whose bytes are identical to the recorded baseline
(sha256 `1cf3f4d7ddf9ae228d672e89b12b874f66cca4afebd655fca36f79dda37b276e`) and whose mtime
moved only because the sandbox `next/font` workaround backs that file up and restores it
around a production build. One file was added, `apps/web-seller/lib/use-escape.ts`. Two of
Phase 8's writes were whole-file `Write`s — the `users.dto.ts` rewrite and that new file;
every other change was a targeted `Edit`.

Four groups of findings drove the changes.

**The API described its own internals to the browser.** The global exception filter had a
fallback branch that put any unhandled `Error`'s own message into the response envelope, and
the storage provider's failure message named the bucket, the object key and the HTTP verdict
(`S3 rejected PUT public/products/<shop>/<product>/<key> (HTTP 4xx)`). Both now keep the
diagnosis in the server log and return a refusal a caller can act on.

**Two reads returned more of the database than any caller displays.** The seller order queue
included the rider's entire `User` row — `email`, `avatarUrl`, `locale`, `isPlatformStaff`
and account timestamps — for a queue that renders a name and a phone number. Eleven invite
reads joined `acceptedBy` for a name nothing rendered.

**Validation was thinner than the columns behind it.** The two catalog routes a seller uses
most accepted unbounded `text`; permission arrays had neither a size limit nor a membership
check against the real catalogue; and the address DTO's `@IsOptional()` admitted `null` into
columns that are not nullable.

**The console conflated "no answer yet", "empty" and "failed to load."** Six screens seeded
state with zeros or empty arrays, so a failed read looked like a quiet, true zero. Those
states are now nullable, and a failure says it failed.

One further hardening change landed on the last day of the audit. `lib/api/onboarding.ts`
was the single seller module that interpolated ids straight into path segments; every other
module wraps them in `encodeURIComponent`. The ids in question are server-generated cuids,
so no request was malformed by this — but the console's guarantee about its own URLs was
resting on a property of the data instead of on the code, and it now does not.

The one code defect discovered today was not in a product path at all: a raw NUL byte inside
a test string in `apps/api/src/providers/storage.provider.spec.ts` made `grep` classify the
whole file as binary, so it printed "binary file matches" instead of matching lines. That
file had therefore been silently absent from every text search over this repository,
including the ones this audit relies on. The byte is now written `\u0000` — identical to the
runtime, visible to every tool.

What "production readiness" means here, and what it does not: the seller console now says
only what the backend has actually measured, refuses only what the server would refuse, and
fails visibly when it cannot read. It does **not** mean every desired feature exists.
Settlement, payouts, refund flows, a ledger, sponsored listings, delivery ETA or SLA, proof
of delivery, bulk catalog import, low-stock thresholds and bilingual EN/NP copy do not exist
in this codebase, and Phase 8 confirmed none of them is simulated anywhere in the console.

## 2. Files changed

Fifty files, listed by area. `+` marks the only file added.

### `apps/api` — 18 files

| File | What changed |
| --- | --- |
| `.env.example` | The `CORS_ORIGINS` entry now explains that CORS runs with credentials, so this is the list of browsers allowed to act as a signed-in user. |
| `src/main.ts` | The OpenAPI document is gated behind explicit configuration; the ready log says "(docs disabled)" when it is off. |
| `src/config/configuration.ts` | Added `corsOriginsConfigured`; production now refuses to boot when `CORS_ORIGINS` is unset or still allows local origins. |
| `src/config/configuration.spec.ts` | Cases for the new production refusal and for the docs gate. |
| `src/common/filters/all-exceptions.filter.ts` | Deleted the `exception instanceof Error` fallback that put internal messages on the wire; documented the log helper. |
| `src/common/filters/all-exceptions.filter.spec.ts` | Cases asserting on the serialised wire body, not on `getResponse()`. |
| `src/common/dto/request-validation.spec.ts` | The largest test addition of Phase 8: pipe behaviour, `@IsOptional()` vs `@OptionalField()`, and subclass metadata dedup. |
| `src/common/types/authed-request.ts` | Comment recording why the resolved shop id is stashed on the request. |
| `src/rbac/permissions.guard.ts` | Comment and import cleanup around the same stash. |
| `src/rbac/dto/rbac.dto.ts` | `ArrayMaxSize` plus membership validation against `ALL_PERMISSIONS`. |
| `src/modules/users/dto/users.dto.ts` | Rewritten: exported address bounds, `@OptionalField()` on every non-nullable column, `UpdateAddressDto extends AddressDto` with `declare` re-decoration, and `ADDRESS_PHONE_CHARS` narrowed from `\s` to a literal space. |
| `src/modules/catalog/dto/catalog.dto.ts` | Length bounds for the previously unbounded `text` columns, re-declared on `UpdateProductDto` and `UpdateVariantDto`. |
| `src/modules/coupons/coupons.service.ts` | `update()` no longer accepts `Prisma.CouponUpdateInput` (which admits `code`, `shopId`, `type`, every column); it projects column by column. |
| `src/modules/coupons/coupon-tenancy.spec.ts` | Two cases pinning the projection and the tenancy check. |
| `src/modules/invites/invites.service.ts` | Dropped the `acceptedBy` join from all eleven reads; narrowed the row type. |
| `src/modules/orders/orders.service.ts` | Seller queue rows now select `user: { name, phone }` instead of the whole `User` row. |
| `src/providers/storage.provider.ts` | Storage failures return a caller-readable message; bucket, key and verdict stay in the log. |
| `src/providers/storage.provider.spec.ts` | The NUL byte written as `\u0000`, with the reason recorded in place. |

### `apps/web-seller` — 32 files

| File | What changed |
| --- | --- |
| `.env.example` | `NEXT_PUBLIC_SELLER_URL` removed — it was documented as "used for canonical links" and nothing read it. The comment records why it is absent. |
| `app/layout.tsx` | **Content unchanged** (sha256 matches the recorded baseline). Its mtime moved only through the build workaround's backup/restore. |
| `app/login/page.tsx` | Keeps its own non-`ApiError` wording, now stated as a deliberate exception to the `asApiError` sweep. |
| `app/onboarding/page.tsx` | `asApiError` adoption. |
| `app/(app)/analytics/page.tsx` | `scope="col"` on all six data columns of the console's only real `<table>`; `aria-pressed` on the period switch. |
| `app/(app)/catalog/page.tsx` | `asApiError` adoption. |
| `app/(app)/delivery/page.tsx` | A `catch` around the per-shop fan-out so one failing shop no longer empties the board; `aria-pressed` on the FAILED-reason chips. |
| `app/(app)/inventory/page.tsx` | `asApiError` adoption. |
| `app/(app)/orders/page.tsx` | Summary state is `OrderQueueSummaryWire \| null`, never seeded with zeros; a failed read clears it; tab badges show nothing rather than a stale or invented count; row `onKeyDown` ignores keys aimed at the inner Accept/Reject buttons. |
| `app/(app)/orders/[id]/page.tsx` | `ridersError` threaded into the view, so an empty rider roster is no longer the same thing as an unread one; renders `InlineError` instead of "No riders on this shop's roster yet". |
| `app/(app)/promotions/page.tsx` | `asApiError` adoption; `useEscape`. |
| `app/(app)/reviews/page.tsx` | `asApiError` adoption. |
| `app/(app)/roles/page.tsx` | `asApiError` adoption; `useEscape`. |
| `app/(app)/settings/page.tsx` | `categories: Category[] \| null`, where `null` means "no answer yet"; the hint distinguishes "Reading the category list…" from "Category list unavailable". |
| `app/(app)/staff/page.tsx` | Twenty-two edits, the highest churn of Phase 8: per-shop `RoleRead = { roles, error }` so "no entry", "empty list" and "failed read" are three distinct states; Refresh re-runs the role reads; `InviteDrawer` names which of three reasons blocks an invitation. |
| `components/auth-provider.tsx` | `asApiError` adoption. |
| `components/shop-provider.tsx` | `asApiError` adoption. |
| `components/use-analytics.ts` | `asApiError` adoption. |
| `components/onboarding/DocumentsPanel.tsx` | `asApiError` adoption. |
| `components/onboarding/SubmitPanel.tsx` | `asApiError` adoption. |
| `components/onboarding/WithdrawRow.tsx` | `asApiError` adoption. |
| `components/shell/DashboardShell.tsx` | `useEscape`. |
| `components/shell/NotificationBell.tsx` | Keeps its own `keydown`/`mousedown` effect, now documented: it needs outside-click dismissal too, and it is a popover, not a modal. |
| `components/shell/Sidebar.tsx` | `aria-current="page"` on the active item — `data-active` reaches CSS and never assistive technology. |
| `components/shell/Topbar.tsx` | Reads `error` from `useShops()`, so the scope strip stays blank rather than claiming a scope it could not read. |
| `components/OfflineWatcher.tsx` | Redundant default export removed. |
| `components/Splash.tsx` | Redundant default export removed. |
| `components/Reveal.tsx` | Redundant default export removed; unused `Variants` import dropped. |
| `lib/api/client.ts` | Added `asApiError` — the one place an unknown throw becomes an `ApiError`. |
| `lib/api/onboarding.ts` | All nine id interpolations now go through `encodeURIComponent`, matching every sibling module; the reason is recorded next to `BASE`. |
| `lib/api/orders.ts` | `EMPTY_ORDER_SUMMARY` demoted from an export to module-private; it is the identity element for `mergeOrderSummaries`, not a display value. |
| `+ lib/use-escape.ts` | The only file added. Five call sites. Its docblock records the deliberate gap: no Tab containment, scroll lock or focus restoration, because `staff/page.tsx` lets two dialogs coexist during the exit tween. |

## 3. Files deleted

None. Phase 8 removed behaviour by editing files — a fallback branch in the exception
filter, three redundant default exports, one unread environment variable, one export
demoted to module-private — but no file was deleted, and no directory was removed.

## 4. Findings classified

### FIX NOW — applied (19)

1. **Unhandled `Error` messages reached the browser.** `all-exceptions.filter.ts` fell back to
   `exception.message` for anything that was not an `HttpException`, which is how the internals
   of every unexpected throw — Prisma text, driver text, our own assertion strings — became part
   of a public API response. The branch is gone; the log keeps the detail.
2. **Storage failures named the bucket and key.** `S3 rejected PUT public/products/<shop>/<product>/<key> (HTTP 4xx)` told a caller the layout of our object store. The message a caller sees is now about their upload.
3. **The seller order queue sent the rider's whole `User` row** — `email`, `avatarUrl`, `locale`, `isPlatformStaff`, account timestamps — for a screen that renders a name and a phone. Narrowed to `user: { name, phone }`, the shape `DeliveryRiderWire` already declares.
4. **Eleven invite reads joined `acceptedBy`** for a name no screen renders, list endpoints included. Join removed, row type narrowed.
5. **`coupons.service.update()` accepted `Prisma.CouponUpdateInput`**, whose type admits every column on the row — `code`, `shopId`, `type`. It now projects the four patchable columns explicitly.
6. **Two catalog routes accepted unbounded `text`.** Product name, description, tags, unit, category id and variant SKU had no `@MaxLength`. Bounds added as exported constants and re-declared on the update DTOs.
7. **Permission arrays were unbounded and unchecked.** `rbac.dto.ts` now has `ArrayMaxSize` and validates every entry against `ALL_PERMISSIONS`, so an unknown key is a 400 rather than a role holding a string the engine will never match.
8. **`@IsOptional()` admitted `null` into non-nullable columns** across the address DTOs. Replaced with `@OptionalField()`, which skips validation only for `undefined`.
9. **`ADDRESS_PHONE_CHARS` used `\s`**, which matches `\n` and `\r`. Narrowed to a literal space.
10. **`UpdateAddressDto` was a hand-written copy of `AddressDto`** — two lists to keep in step. It now extends it and re-decorates with `declare`, the pattern the catalog DTOs use for the same class-validator metadata reason.
11. **Production could boot with a development CORS allowlist.** `CORS_ORIGINS` unset, or still naming `localhost`, now refuses to start in production; `corsOriginsConfigured` makes the state explicit.
12. **The OpenAPI document was served unconditionally** — every route, DTO property and validation constraint, to anyone who asked. Now gated by configuration, and the ready log says which mode it is in.
13. **Six screens could not tell "no answer yet" from "empty" from "failed."** Fixed at the state level, not with new error UI: the orders queue summary and its tab badges, the order-detail rider roster, per-shop role reads on Staff, the category list on Settings, and the delivery board's per-shop fan-out.
14. **The Topbar claimed a scope it had not read.** It now reads `error` from `useShops()` and stays blank instead.
15. **`err instanceof ApiError ? err : null` silently discarded non-`ApiError` throws** in twelve files, which is exactly where a `TypeError` in our own mapping code would vanish. `asApiError` now normalises them; `login/page.tsx` keeps its own wording deliberately.
16. **Concrete accessibility defects** (§13): the sidebar conveyed the current page only through CSS, the delivery reason chips were unannounced toggles, the analytics table's six data columns had no `scope`, the orders row keyboard handler swallowed keys aimed at its own buttons, and Escape handling was copied five times.
17. **Dead surface.** Three redundant default exports, one unused `Variants` import, one unread environment variable (`NEXT_PUBLIC_SELLER_URL`), one export with no importer (`EMPTY_ORDER_SUMMARY`, demoted rather than deleted because it is `mergeOrderSummaries`'s identity element).
18. **A raw NUL byte in `storage.provider.spec.ts`** made `grep` treat the file as binary, so it printed "binary file matches" instead of matching lines and dropped out of every text search — including this audit's. Written as an escape now; behaviour at runtime is identical.
19. **`lib/api/onboarding.ts` interpolated nine ids into path segments unencoded**, alone among the seller API modules. Now encoded.

### ALREADY CORRECT — verified today, unchanged (13)

Each of these was checked with a command run today, not inferred from an earlier report.

1. **`lib/api/` is the only door out.** Exactly two `fetch(` calls exist in the seller console plus the shared client, both inside `packages/api-client/src/http.ts` (:184, :250). No screen can bypass token refresh or 401 handling. The two `authedRequest` mentions outside `lib/api/` are comments.
2. **Token logging is structurally impossible.** The only `console.` match anywhere in the seller surface is the word "console" in a sentence (`auth-provider.tsx:10`).
3. **No HTML injection surface.** Zero `dangerouslySetInnerHTML`, `innerHTML`, `eval(` or `new Function` in the console.
4. **The one external link is safe.** `SubmitPanel.tsx:140` is the only `target="_blank"`, and it carries `rel="noopener noreferrer"`.
5. **`localStorage` cannot grant anything.** It holds the session blob (`session.ts:105-118`) and the active shop id (`shop-provider.tsx:65-73`). No permission, role or capability is stored client-side, so editing it changes what you see, never what the server allows.
6. **The image allowlist is closed and fails loudly.** `apps/web-seller/next.config.ts` derives its `remotePatterns` from `NEXT_PUBLIC_API_URL` plus an explicit host list, and throws on a wildcard hostname rather than silently reinstating an open image proxy.
7. **No browser owner bypass.** Every shop action asks `canInShop(shopId, key)`; `useSeller().can` widens to "anywhere" only when no shop is in scope; `"all"` remains a local UI sentinel and is never sent to the API.
8. **Uploads are constrained server-side.** The product-image and KYC routes keep the three-fact MIME check and reject client-supplied storage paths; the console cannot name an object key.
9. **Every path the console builds resolves to a declared route**, and every route in the seller-scoped controllers has a caller — checked by listing all `@Get/@Post/@Patch/@Put/@Delete` decorators in the seven `*.seller.controller.ts` files plus `invites.shop.controller.ts`, `rbac/roles.controller.ts` and `rbac/staff.controller.ts` against every URL template in `lib/api/`, method by method.
10. **Fan-out reads are bounded.** Each `listAllShop*` helper walks at most five pages of 100 and reports `truncated`, so a shop with forty thousand orders cannot turn one screen into four hundred requests.
11. **Retired permission keys are inert.** Twenty-six colon-style keys exist, all of them inside `RETIRED_PERMISSIONS` in `lib/rbac.ts`; zero appear at a check site.
12. **All five `role="dialog"` sites are labelled** — three by `aria-labelledby`, two by `aria-label` — and `aria-modal="true"` is on the four modal overlays and correctly absent from the notification popover.
13. **Query strings are built with `URLSearchParams`**, so every filter, search term and page number is encoded by the platform rather than by hand.

### DOCUMENT — real, left as-is, recorded here (6)

1. **Six screens fan out one request per readable shop** when no shop is in scope: orders, catalog, inventory, promotions and reviews issue one list request per shop; delivery issues four (`open`, `done`, `riders`, `zones`); staff issues three (staff, invites, roles). This is not an accident and not fixable in the console: the API has no aggregate endpoint for orders, products, coupons, reviews or staff across shops. Analytics is the one screen that does have one — `GET /seller/analytics/overview` returns `byShop` — and it uses it. Inventing the others would mean inventing backend capability.
2. **`useEscape` deliberately does not trap focus**, lock scroll or restore focus on close. Its docblock says so and says why: `staff/page.tsx` lets `InviteDrawer` and `ShareOnceDialog` coexist during an exit tween, and a focus trap that owns the document would fight that. Full modal focus management is a real gap, recorded rather than half-built.
3. **`orders.complete` is grantable and inert.** It exists in the permission catalogue on both sides and no controller carries it; both comments say so (`permissions.catalog.ts:39-50`, `orders/[id]/page.tsx:302`). Verified today by finding no `@RequirePermissions('orders.complete')` anywhere.
4. **The queue's `codOutstanding` is not a settlement figure.** It is summed from order totals because no ledger or settlement table exists. The service comment and the console copy both say this.
5. **Two seller capabilities have no endpoint and say so on screen**: bulk catalog import and sponsored listings. Both are "unavailable" screens with an explanation, not disabled buttons.
6. **Notifications are the one unpaginated list**, and they have no shop column, so the console labels them by shop and never filters by it.

### OUT OF SCOPE (4)

1. **`apps/web-admin/next.config.ts:13` still allows `{ protocol: "https", hostname: "**" }`** — an open image proxy on the admin console, the exact configuration the seller console removed. Not touched, because the brief forbids modifying `apps/web-admin` unless a Phase 8 requirement demands it. It should be the first item of any admin pass.
2. **`apps/web-admin/lib/api/onboarding-review.ts:161-184` downloads KYC documents with a raw `fetch`.** The bearer token goes in an `Authorization` header, not a URL, so it is not leaked — but the call bypasses the shared client, so an expired token surfaces as "could not open the document" rather than being refreshed. The seller console fixed the same defect with `authedBlob`. The same file also interpolates ids into path segments unencoded (seven and two sites).
3. **Four index migrations of unknown applied state.** `apps/api/prisma/migrations` holds five directories: `20260822193823_init` and four index migrations dated 2026-08-26/27. Whether the four are applied cannot be determined here — no database is reachable from this sandbox — so `_prisma_migrations` was not read and no claim is made about it.
4. **Every capability the brief defers**: finance, payouts, settlement, refunds, a ledger, sponsored listings, ETA/SLA, proof of delivery, bulk import, low-stock thresholds, and bilingual EN/NP copy. None was started; none is simulated.

## 5. API contract findings

The contract check was done by tracing decorators, not by grepping route strings. Every
`@Get/@Post/@Patch/@Put/@Delete` in the seller-scoped controllers was listed with its base
path, then matched against every URL template in `apps/web-seller/lib/api/` together with the
HTTP method the console sends.

The result: the console and the API agree on every route. `seller/shops` (list, read, patch),
products (list, create, patch, delete, stock, images post/delete/reorder, variants
create/patch/delete), coupons (list, create, patch, delete), orders (list, read, and the five
transitions), delivery (riders list/create/delete, assign, unassign, delivery patch, zones
CRUD), reviews (list, reply), invites (list, create, resend, revoke), staff (list, role,
status, remove), roles (catalog, list, create, clone, patch, delete) and both analytics
overviews all have a caller, and every caller resolves to a route.

Two details are worth recording because they are easy to get wrong and are currently right.
The four order transitions are built by interpolating an action segment, and that segment is
typed as the closed union `"accept" | "pack" | "dispatch" | "cancel"` (`lib/api/orders.ts:462`),
so no arbitrary string can become a path. And `GET seller/onboarding/applications/current` is
served but deliberately has no wrapper: the wizard needs "the open application, else the most
recent", which only the list can answer, and a helper for `/current` would have been a second
way to ask a question the console does not have. The route is untouched and the omission is
documented in place.

Envelope handling is consistent: refusals carry `message` plus machine-readable extras
(`missing`, `missingDocuments`), and `ApiError.list(key)` is how the wizard reads them, so the
submit screen points at the missing field rather than restating a sentence.

## 6. Authorization and shop-scope findings

Nothing was loosened. The browser's model is unchanged: `canInShop(shopId, key)` for anything
that happens inside a shop, `canAnywhere(key)` only for questions that are genuinely about the
account, and `useSeller().can` widening to "anywhere" exclusively when `activeShopId === null`.
No `|| canAnywhere(...)` fallback was added to make a screen work, no owner flag short-circuits
a permission check in the browser, and no fixture role answers an authorization question —
there are no fixture roles left to ask.

Four things were verified rather than assumed.

The sidebar's eleven entries are keyed by permissions the API actually issues
(`dashboard.view` … `settings.view`), all in dot notation. A nav entry keyed to something the
API never grants is a dead link by construction, which is why Analytics lists only
`analytics.view` and no finance key.

Per-shop divergence is respected. `analytics.view` is shop-scoped and held by Owner and Manager
only, so the analytics screen asks per shop and reports its coverage ("These figures cover … of
your …") instead of silently summing what it could read. Staff does the same thing at a finer
grain: after Phase 8, each shop's role read is `{ roles, error }`, so a member who can read roles
in one shop and not another sees which is which, and `InviteDrawer` names the specific reason an
invitation cannot be completed rather than presenting a form that will 403.

`"all"` never leaves the browser. It is the shop switcher's sentinel for "no shop in scope";
every request either carries a real shop id in its path or is one of the two account-level
routes.

Server-side enforcement is intact for every mutation the console performs: each write goes to a
route carrying `@RequirePermissions(...)` with shop scope resolved from `:shopId`, and RBAC
remains default-deny. The one asymmetry worth restating is not a defect but a design decision:
`rbac.manage` gates role editing while `team.invite` gates invitations, so an account can hold
one without the other, and the Staff screen has to explain that rather than merge them.

## 7. Mutation and form honesty findings

Every mutation on the seller console was walked against the six-point checklist. All of them
now start from a real request, show a pending state, resolve on the API's answer, report
success or failure from that answer, refresh or apply a demonstrably complete response, and —
the part most easily broken — leave the seller's unsaved input alone when the server refuses.

Three concrete improvements came out of this pass, and each was a state-shape change rather
than new UI.

The orders queue no longer seeds its summary with zeros. `OrderQueueSummaryWire | null` is the
state, so before the first answer the stat cards show nothing; "Needs action: 0" and
"COD to collect: Rs 0" are claims about a shop's money and must be measurements or absent. A
failed refresh clears the summary instead of leaving the previous one under a new filter, and
the tab badges show nothing rather than a stale count.

The order detail screen distinguishes an empty rider roster from an unread one. `ridersError`
is threaded into the view; a failed read renders `InlineError`, where it previously said "No
riders on this shop's roster yet" — a sentence about the shop that was actually a sentence
about the network.

Settings treats `categories: Category[] | null` as three states, and its hint says which:
"Reading the category list…", "Category list unavailable", or the list itself. The form's diff
logic was already correct — only changed keys are sent, `null` is not a value, and a refusal
keeps the seller's edits on screen — and the server half of that contract is pinned by
`apps/api/src/modules/catalog/shop-settings.spec.ts`, which exists in the tree today.

## 8. Error, loading and empty-state findings

The brief's rule for this area was to reuse what the console already has, and the console
already has enough: `components/states.tsx` exports `Spinner`, `LoadingPanel`, `SkeletonRows`,
`ErrorPanel`, `InlineError` and `InlineNotice`, and `components/primitives.tsx` exports
`EmptyState`. Phase 8 added no seventh component. Usage today, counted outside the two
defining modules: `Spinner` 56 sites, `LoadingPanel` 6, `SkeletonRows` 11, `ErrorPanel` 16,
`InlineError` 37, `InlineNotice` 35, `EmptyState` 18. The division of labour is consistent —
`ErrorPanel` for "this screen has nothing to show you", `InlineError` for "that one action
failed", `InlineNotice` for "you are seeing less than everything, and here is why",
`EmptyState` for a genuine measured absence.

What Phase 8 did change is the number of states each screen can distinguish. Six surfaces
were collapsing three different situations — *not asked yet*, *asked and the answer was
empty*, *asked and the read failed* — into one rendering, and in every case the rendering
chosen was the reassuring one.

**Orders queue.** The summary was seeded with a zero-filled object, so the stat cards read
"Needs action: 0" and "COD to collect: Rs 0" before the first request had returned, and kept
the last good numbers after a refresh failed. The state is now
`OrderQueueSummaryWire | null`; nothing is shown until something is measured, a failed read
clears it, and the tab badges show nothing rather than a stale count. Zeros about a shop's
money are the one place a placeholder is indistinguishable from a claim.

**Order detail.** A failed rider read rendered "No riders on this shop's roster yet" — a
sentence about the shop that was actually a sentence about the network. `ridersError` is now
threaded into the view and gets `InlineError`.

**Settings.** `categories` is `Category[] | null`, and the field hint says which of the three
states it is in: "Reading the category list…", "Category list unavailable", or the list.

**Staff.** Each shop's role read is now `RoleRead = { roles, error }`, so "you have no entry
for this shop", "this shop has no custom roles" and "this shop's roles could not be read" are
three distinct outcomes; Refresh re-runs those reads; and `InviteDrawer` names which of three
reasons blocks an invitation instead of presenting a form the server will refuse.

**Delivery board.** The per-shop fan-out had no failure boundary, so one shop's error emptied
the whole board. `readShop` now returns `{ id, error, orderRows, truncated, riders, zones }`;
if every shop fails the page shows `ErrorPanel` carrying the first real message, and if some
succeed it renders them and names the rest in an `InlineNotice` ("Couldn't read …, so nothing
from them is on this board").

**Topbar.** The scope strip fell through a failed shop read to "Managing No shop yet" — while
`ShopSwitcher`, in the sidebar beside it, correctly said "Shops unavailable". It now reads
`error` from `useShops()` and stays blank, leaving the failure to the one component that
states it accurately.

No error was converted into an empty list, no unavailable read into a zero, and no failure
into "No data" anywhere in this pass; the changes all run in the opposite direction.

## 9. Performance and request-shape findings

The seller console is a consolidated multi-shop view sitting on an API that scopes every list
to one `:shopId`. That mismatch is the source of every request pattern below, and it is not a
bug in either half: the shop id is what carries authorization, so a cross-shop list endpoint
would have to invent a permission model the backend does not have.

Four helpers absorb the paging: `listAllShopOrders` (`lib/api/orders.ts:370`),
`listAllShopProducts` (`products.ts:322`), `listAllShopCoupons` (`promotions.ts:231`) and
`listAllShopReviews` (`reviews.ts:182`). Each reads page 1, learns `meta.totalPages`, and
continues to a hard ceiling — `ORDER_PAGE_LIMIT`/`ORDER_MAX_PAGES` are `100` and `5`
(orders.ts:273, :276), and the same 100 × 5 pair is declared in products.ts (:210, :213),
promotions.ts (:135, :136) and reviews.ts (:82, :83). So one shop costs at most five requests
and 500 rows for any of those lists. When the ceiling bites, the helper returns
`truncated: orders.length < first.meta.total`, and the screen says so; a filtered view drawn
from a truncated read cannot honestly report "nothing here" otherwise.

Above those helpers, **seven** screens fan out one read per readable shop inside a single
`Promise.all`: orders (`orders/page.tsx:155`), catalog (`catalog/page.tsx:158`), inventory
(`inventory/page.tsx:162`), promotions (`promotions/page.tsx:178`), reviews
(`reviews/page.tsx:150`), staff (`staff/page.tsx:161-163` — staff and pending invites, two
per shop — plus the role reads at `:205`, a third), and delivery (`delivery/page.tsx:244`, and
`:211` inside it, up to four per shop). Roles (`roles/page.tsx:167`) is deliberately *not* in
that list: its `Promise.all` holds two different reads for one `shopId`, so it does not scale
with shop count at all. Concretely, with *n* readable shops the request count is *n* for the
five list screens, 3*n* for staff and up to 4*n* for delivery.

This is **DOCUMENT, not FIX NOW.** There is no aggregate endpoint to call, the brief forbids
inventing one, and the two heaviest screens already limit what they ask for. Delivery reads
`DELIVERED` as one short newest-first page per shop rather than walking it — that lane grows
without bound and a full read would crowd out the live lanes — and it only asks a given shop
for orders or for riders/zones if the signed-in member actually holds the matching permission
there, so `orderIds` and `deliveryIds` are usually smaller than the shop list. Staff's three
reads per shop are three genuinely different resources, and the role read now keeps its own
per-shop failure rather than discarding the answer it did get.

Two things Phase 8 did improve here. The orders summary is no longer a separate request: it
arrives on the same page-1 response (`summary: first.summary`) and `mergeOrderSummaries` folds
the per-shop objects together in the browser, so the stat cards cost nothing extra. And the
delivery fan-out gained a per-shop `try/catch`, which changes its failure cost as much as its
request cost — one slow or refusing shop no longer discards the other shops' answers, so the
board does not have to be re-fetched from scratch to recover.

Analytics is the exception that proves the shape is deliberate: `fetchSellerAnalytics`
(`lib/api/analytics.ts:187`) is a genuine consolidated endpoint, so that screen makes exactly
one request no matter how many shops the seller has, and it reports its own coverage when the
API measured fewer shops than the console knows about. Settings imports no list helper at all
— one category read and one `PATCH`.

Phase 8 added no caching layer, no request de-duplication and no prefetching. Each of those
would be a guess about traffic this console has never seen.

## 10. Security findings

### Two message leaks, both closed

`all-exceptions.filter.ts` had an `else if (exception instanceof Error)` branch that copied
`exception.message` into the response body for anything that was not an `HttpException`. That
is the class of error that carries Prisma's own prose — constraint names, column names,
sometimes a fragment of the failing statement — so an unhandled database error was answering
the browser with a description of the schema. The branch is gone; a 500 now answers with a
fixed sentence and the detail goes to the log. Line 124 of the file is a comment saying so, in
those words, so the branch is not reintroduced as a convenience. `instanceof Error` still
appears at :43 and :140, both inside the logging helper, which is where it belongs.

`storage.provider.ts` did the same thing one layer down: an upload failure produced a message
naming the bucket, the object key and the provider's verdict, and that message reached the
seller. It now returns a caller-readable sentence and keeps bucket, key and verdict in the log.

### Two over-fetches, both narrowed

The seller order queue included `user: true` on the rider relation, so every row shipped the
rider's `email`, `avatarUrl`, `locale`, `isPlatformStaff` and account timestamps to a shop
that displays a name and a phone number. It now selects `user: { select: { name, phone } }`,
matching `ORDER_DETAIL_INCLUDE` above it and the console's own `DeliveryRiderWire`. Separately,
`invites.service.ts` joined `acceptedBy` on all eleven of its reads — a full `User` row for a
person the invite list only needs to know accepted — and the join is dropped from every one.

### Input validation

`UpdateProductDto` and `UpdateVariantDto` had unbounded `text` columns; both now carry length
bounds, re-declared on the update subclasses because class-validator's metadata dedup drops
inherited built-ins on any property a child re-decorates. `rbac.dto.ts` gained `ArrayMaxSize`
and membership validation against `ALL_PERMISSIONS`, so a role can no longer be created with
an unbounded array of strings the guard will never recognise. `coupons.service.ts` `update()`
no longer takes `Prisma.CouponUpdateInput` — a type that admits `code`, `shopId`, `type` and
every other column — and projects the four patchable fields explicitly instead.

`users.dto.ts` was rewritten. `@IsOptional()` skips every validator when a value is `null`,
which meant `null` was accepted for columns the schema declares `NOT NULL`; the non-nullable
fields now use `@OptionalField()`, which only skips on `undefined`. `UpdateAddressDto` was a
hand-copied duplicate of `AddressDto` and had already drifted; it now extends it and re-declares
what it must. And `ADDRESS_PHONE_CHARS` was `/^[0-9+ \-]+$/` with `\s`, which also matches
`\n`, `\r` and `\t` — this value is interpolated into `tel:` and `sms:` hrefs, so it is now a
literal space: `/^[0-9+ -]+$/` (users.dto.ts:92), with `ADDRESS_PHONE_DIGITS` beside it
requiring seven digits so `" - - - "` is not a phone number.

### Path segments

`lib/api/onboarding.ts` interpolated nine application and document ids into URL paths
unencoded, alone among the seller API modules. All nine now go through `encodeURIComponent`.
Today's ids are server-generated cuids that need no escaping; the encoding is what keeps that a
property of the data rather than an assumption the file makes. Zero unencoded id
interpolations remain anywhere in `apps/web-seller/lib`.

### ALREADY CORRECT — every item on the brief's security checklist, re-checked today

**No transport bypass.** `fetch(` appears exactly twice in the seller console and the shared
client combined, both inside `packages/api-client/src/http.ts` (:184 and :250). Every seller
request therefore goes through the one code path that attaches the bearer token and refreshes
it. There is no hand-rolled request left in `apps/web-seller`.

**No token can be logged.** The token exists only inside `session.ts` and `http.ts`, and
neither file contains a single `console.*` call — `grep -n "console\." ` over both returns
nothing — so there is no statement in the codebase that could print one.

**No injection sinks.** `dangerouslySetInnerHTML`, `innerHTML`, `eval(` and `new Function(`
return **zero** matches across `apps/web-seller` and `packages/api-client/src`.

**External links.** One `target="_blank"` in the whole console, `SubmitPanel.tsx:140`, and it
carries `rel="noopener noreferrer"`.

**`tel:` / `sms:` hrefs.** Five sites, all in orders detail and the delivery board, all
interpolating a phone number that came from the API — `Address.phone`, validated on write by
the two anchored patterns above, or `User.phone`, which only exists because an OTP was
delivered to it. Neither is free text.

**`localStorage` cannot grant anything.** Two keys: the session blob written by
`session.ts:117` and the active shop id written by `shop-provider.tsx:73`. Permissions are
read from `/auth/me` on every load; editing either key changes which shop is selected or
forces a sign-in, and nothing else. The one adjacent risk is documented rather than assumed
away: `shops.ts:168` records that `"all"` is a local sentinel for "no shop selected" and is
never sent to the API.

**Upload limits are the server's.** `FileInterceptor('file', { limits: { fileSize:
MULTIPART_HARD_LIMIT_BYTES, files: 1 } })` on both upload routes
(`catalog.seller.controller.ts:129`, `onboarding.seller.controller.ts:141`), with
`UPLOAD_MAX_IMAGE_BYTES` enforced in the service and validated at boot — configuration refuses
a zero ceiling and refuses a value above the multipart hard limit. The console's
`MAX_IMAGE_BYTES` (`products.ts:482`) is a courtesy check that mirrors the default; it is not
the enforcement point, and its docblock says so.

**Image hosts are allowlisted.** `next.config.ts` derives `remotePatterns` from
`NEXT_PUBLIC_API_URL` plus `NEXT_PUBLIC_IMAGE_HOSTS` and throws on a wildcard entry, so this
console cannot be turned into an open image proxy by configuration. No component trusts a
client-supplied image URL: DTOs reject client-supplied storage paths, and images arrive as
keys the API minted.

**Query strings are built, not concatenated.** Four `URLSearchParams` sites in `lib`. The
search term is bounded at both ends by the same number: `SEARCH_MAX_LENGTH = 120` is declared
in `packages/api-client/src/types.ts:170` and reaches five search boxes as `maxLength`
(orders, reviews, catalog, inventory, promotions), while the API enforces it independently with
`@MaxLength(SEARCH_MAX_LENGTH)` on `pagination.dto.ts:40`, where the constant is declared again
at :6. Two declarations of one number is a deliberate mirror — the package cannot import from
the API app — and the client-side docblock says why a looser or tighter client cap would both
be the UI disagreeing with the API.

**Authorization is the server's.** No `|| canAnywhere(...)` fallback, no owner bypass in the
browser, no fixture role answering an authorization question. Twenty-six retired colon-notation
permission keys exist in the repository and all twenty-six are inside the `RETIRED_PERMISSIONS`
table that documents them; none is checked anywhere.

**No committed secrets.** `.env.example` files hold placeholders and prose only.

## 11. Dead-code and dead-capability findings

### Removed

Three components exported the same function twice, once named and once as a default —
`OfflineWatcher`, `Splash` and `Reveal`. Every caller used the named export; the defaults were
a second public name for one thing, which is how two names for one component start to drift.
`grep -rn "^export default" apps/web-seller/components` now returns nothing. `Reveal` also
imported `Variants` from framer-motion and never used it; the import is gone.

`NEXT_PUBLIC_SELLER_URL` was listed in the seller `.env.example`, described as "used for
canonical links", and read by no code at all. Documenting a variable that nothing reads is
worse than omitting it: an operator sets it, and the console's behaviour does not change. It is
removed, and line 14 of the file now records that its absence is deliberate.

`EMPTY_ORDER_SUMMARY` was an export. It is the identity element for `mergeOrderSummaries` —
zeros to fold per-shop objects into — and the orders page had adopted it as initial state,
which is how the queue came to assert "Needs action: 0" before it had asked. It is now
module-private at `lib/api/orders.ts:405` with exactly one reference, `:425`, inside the
reducer it belongs to. Demoting the export was the fix; the display bug was a symptom.

### The NUL byte

`apps/api/src/providers/storage.provider.spec.ts` contained a literal NUL byte inside a test
fixture. A single NUL makes `grep` classify a file as binary and print "binary file matches"
instead of the matching line, which silently removes that file from every text audit — including
this one. It is now written as a source-level escape sequence rather than as a raw byte, and the
reason is recorded in place. This found no defect in the product; it made an existing test case
visible to the tools that audit the repository, which is the only reason it is worth a paragraph.

### Comments that stay

Per the brief, comments were not deleted for containing the words "fixture", "fake" or "mock".
Four such comments remain and all four document behaviour that was removed: `delivery/page.tsx:75`,
`Sidebar.tsx:44`, and `providers.tsx:33` and `:36`. Each explains a capability the console used to
fake — a STAFF fixture, a fixture-driven nav item, a fixture role switcher — so that it does not
come back. Similarly, exports were not removed merely for having a single caller where they form
an intentional module boundary.

### Capabilities that exist as honest absences — DOCUMENT

`orders.complete` is grantable and inert. It appears in `permissions.catalog.ts:44` and in two
seed role bundles, and **no route carries it**: a handover is authorised by the delivery-status
permission instead. It is not dead in the sense of removable — the API defines it, so the
console must be able to display and grant it — so `lib/rbac.ts:193-197` labels it "Legacy" and
its hint says in the UI that on its own it grants nothing.

Bulk catalog import and sponsored listings each have a screen that says the capability does not
exist, rather than a form that would post nowhere. Notifications is the one unpaginated list in
the console, and it has no shop column at all, so the console labels each notification with its
shop where it can and never filters by one — filtering a list the backend does not scope would
be the UI inventing a guarantee.

`codOutstanding` is summed from order totals, not from a ledger, because there is no ledger
table. Its declaration (`lib/api/orders.ts:305-307`) and the API's `queueSummary` docblock both
state that it must never be presented as a payout figure. Nothing in the console calls it one.

## 12. Environment and configuration findings

`validateConfig` in `apps/api/src/config/configuration.ts` separates *problems*, which refuse
the boot, from *warnings*, which are printed. Phase 8 added two entries to it and gated one
route; everything else in this section was already correct and is recorded because the brief
asked for it to be checked.

### Added: production refuses to inherit the localhost CORS default

`CORS_ORIGINS` defaults to `http://localhost:3000`, and `main.ts` enables CORS with
`credentials: true`. An unset variable therefore reached production as a working
configuration that no real console could use — every request refused in the browser, with an
opaque CORS error and nothing in the server log to explain it. Production now refuses to boot
when `CORS_ORIGINS` is unset (`configuration.ts:435`), which is what `corsOriginsConfigured`
exists to distinguish: "set to the localhost value" and "not set" are different facts, and only
the second is a mistake. A production list that still contains `localhost`, `127.0.0.1` or
`[::1]` is a warning, not a refusal — that can be deliberate on a staging host — and the
warning names the offending origins. Two pre-existing checks sit beside the new one: `*` is
refused outright, because a browser rejects a wildcard origin on a credentialed response and
the `cors` package compares by equality, so somebody writing "allow everything" would get
"allow nothing" and debug it as a network fault; and a `CORS_ORIGINS` that is set but parses to
zero origins is refused as well.

### Added: the OpenAPI document is gated

`GET /api/v1/docs` served an unauthenticated description of every route, every DTO property and
every validation constraint in the API. `docsEnabled` now defaults to "not in production"
(`configuration.ts:166`) and `main.ts:89` skips the whole `createDocument` block when it is off,
so a production boot also skips walking every controller. `API_DOCS_ENABLED=true` remains
available for a deliberate public sandbox, and it is a production warning when used. The ready
log says `(docs disabled)` rather than silently omitting the URL.

### ALREADY CORRECT

**Development needs no credentials.** `SMS_PROVIDER=log` is the default outside production and
warns, in the log, that codes are being printed rather than delivered — the fallback does not
pretend to have sent an SMS. Production refuses `SMS_PROVIDER=log` and refuses
`SMS_DEV_OUTBOX_FILE`, both because one-time codes would end up somewhere other than a phone.
The payment gateway is all-or-nothing: eSewa needs both `ESEWA_MERCHANT_CODE` and
`ESEWA_SECRET` or neither, because a half-configured gateway offers a checkout method that
cannot complete.

**No production secret is hardcoded, and no development one survives.** The JWT secrets fall
back only outside production; a production instance still carrying either dev value, or using
the same value for both, is refused. `DATABASE_URL` and `PUBLIC_URL` are refused when unset in
production — the second because notification links and file URLs are built from it.
`STORAGE_PROVIDER=local` is refused in production unless an explicitly named escape hatch is
set, because the files at stake include KYC documents and an instance replacement would take
them with it.

**API URLs are not silently localhosted in production.** The seller console reads
`NEXT_PUBLIC_API_URL`; when it is absent, `RequireAuth` renders "No API configured" rather than
quietly trying `localhost`. That is the same principle as the CORS refusal: a missing variable
produces a clear failure, not fake application behaviour.

**Image hosts stay allowlisted.** `apps/web-seller/next.config.ts` builds `remotePatterns`
from `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_IMAGE_HOSTS` and throws on a wildcard, with the
reason in the message: `next/image` would otherwise fetch and re-serve arbitrary URLs through
this console.

## 13. Accessibility findings

No component was redesigned and no accessibility library was added. Five concrete defects were
fixed, plus one shared hook, and the rest of this section is a census taken today so the
console's existing conventions are on the record.

**Sidebar active item.** The current page was marked with `data-active`, which reaches CSS and
never reaches assistive technology, so a screen-reader user was told the same thing about all
eleven nav links. `aria-current={active ? "page" : undefined}` at `Sidebar.tsx:140`.

**The analytics table had no column scope.** It is the console's only real `<table>`
(`analytics/page.tsx:298`; everywhere else the rows are cards), and its six `<th>` cells now
carry `scope="col"`, so a row is read as "Orders, 14" rather than as six bare figures.

**Two segmented controls were not announcing state.** The analytics period switch and the
delivery board's FAILED-reason chips looked selected and said nothing; both now carry
`aria-pressed`, matching the console's established pattern — 13 sites use it.

**The orders queue row answered keys aimed at its own buttons.** Accept and Reject sit inside a
`role="button"` row, so their `keydown` bubbled: pressing Enter on Reject rejected the order
*and* navigated away from the queue in one keystroke. The mouse path was already guarded by
`stopPropagation` on click; the keyboard path was not. The handler now begins
`if (e.target !== e.currentTarget) return;` (`orders/page.tsx:491`) and handles Space as well as
Enter, because a `role="button"` is expected to answer it and because Space's default action on
a focused div is to scroll the queue out from under the reader.

**Escape did not close four overlays.** `lib/use-escape.ts` is the only file Phase 8 added; five
call sites use it (`staff/page.tsx:836` and `:1051`, `roles/page.tsx:561`,
`promotions/page.tsx:756`, `DashboardShell.tsx:21`). Its docblock records a deliberate gap: it
does not do Tab containment, scroll locking or focus restoration. Adding those would have been
a redesign, and `staff/page.tsx` lets two dialogs coexist during the exit tween, so a naive
focus trap would have created a worse bug than the one it fixed.
`NotificationBell.tsx` keeps its own `keydown`/`mousedown` effect rather than adopting the hook,
and now says why: it needs outside-click dismissal too, and it is a popover, not a modal.

### Census, counted today across `apps/web-seller/**/*.tsx`

`aria-pressed` 13. `aria-label=` 57. `aria-hidden` 23. `scope="col"` 6 attributes (7 grep lines;
one is the comment explaining them). `aria-current` 1 attribute (2 lines, same reason).
`aria-expanded` 4 — the catalog filter, the notification bell, the account menu and the shop
switcher. `aria-invalid` 3. `sr-only` 5. `aria-labelledby` 3.

`role="dialog"` 5, and **all five are labelled**: three by `aria-labelledby` pointing at their
own heading (`staff:885`, `roles:644`, `promotions:799`) and two by `aria-label`
(`staff:1086` "Invitation created", `NotificationBell:203` "Notifications").
`aria-modal="true"` appears on exactly the four true modals and not on the bell popover, which
is correct rather than an omission — the popover does not make the rest of the page inert.

`aria-live` is **0**, and that is a known gap rather than a fixed one. The console reports the
result of a mutation by re-rendering an `InlineError` or a success line, which a screen reader
will not announce unless focus happens to move there. Making it announce properly means
choosing a politeness level per surface and a single live region to own it — a design decision
across 37 `InlineError` sites, not a mechanical edit, so it is documented in §17 instead of
half-applied here.

## 14. Tests added

**Zero new spec files.** The brief said to add tests only for defects found in this audit and
not to create tests to inflate a number, so every case Phase 8 wrote went into the suite that
already owns the behaviour. The repository has 30 spec files, unchanged in count from Phase 7.

The suite as it stands today, from the run at 05:35:10Z: **713 tests, 131 suites, 713 pass, 0
fail, 0 skipped, 0 todo**, in 23.7 s. Of those 713, **661** are line-anchored `it(` declarations
across the 30 files; the remainder are the `describe` blocks node:test also counts as subtests.

Four existing suites absorbed Phase 8's cases:

| Suite | `it()` today | What was added |
|---|---|---|
| `src/common/dto/request-validation.spec.ts` | 142 | The largest addition. Pipe behaviour end to end; `@IsOptional()` accepting `null` where the column is `NOT NULL` versus `@OptionalField()` refusing it; class-validator's subclass metadata dedup, which is why `UpdateProductDto`, `UpdateVariantDto` and `UpdateAddressDto` must re-declare inherited built-ins; the new catalog length bounds; the permission-array bounds; and `@MaxLength` measuring `String.length`, so a 120-character Nepali search is more bytes than a Latin one. |
| `src/config/configuration.spec.ts` | 48 | The production CORS refusal, both of its neighbours (`*` and set-but-empty), and the docs gate. |
| `src/common/filters/all-exceptions.filter.spec.ts` | 19 | Cases asserting on the **serialised wire body** rather than on `getResponse()`, which is the only way to catch a message that survives the filter and reaches the browser. |
| `src/modules/coupons/coupon-tenancy.spec.ts` | 9 | Two cases pinning the explicit column projection in `update()` and the tenancy check around it. |

`src/providers/storage.provider.spec.ts` sits at 36 and gained no case: its Phase 8 edits
rewrote assertions and comments for the new caller-readable failure message, and replaced a raw
NUL byte with an escape. That change added no coverage — it made coverage that already existed
visible to text search.

Two suites are cited elsewhere in this report and were verified to exist rather than recalled:
`src/modules/catalog/shop-settings.spec.ts` (17 cases), which backs §7's claim about the
settings `PATCH` contract, and `src/rbac/shop-staff-tenancy.spec.ts:170`, whose "the owner
cannot be locked out of their own shop" block is subtest 123 of today's run, 4 cases.

No seller-console test framework exists, so none of the front-end changes in this phase carry
unit tests. That is a real gap and it is listed in §17; the seller console's guarantees today are
`tsc --noEmit`, `next lint --max-warnings=0` and `next build`, which are what §15 records.

## 15. Verification actually run

Every command below was executed in this environment during this phase and its exit status read.
Binaries were invoked out of `apps/<app>/node_modules/.bin` because this sandbox provides no
`pnpm` — only `npm` and node v22.23.2. All times are UTC on 2026-09-03.

| # | Command (cwd) | Ran at | Exit | Result |
|---|---|---|---|---|
| 1 | `node --require ts-node/register/transpile-only --test $(find src -name '*.spec.ts' \| sort)` (`apps/api`) | 05:35:10Z | 0 | 713 tests, 131 suites — **713 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo**, 23707 ms |
| 2 | `tsc --noEmit -p tsconfig.json` (`apps/api`) | 05:36:32Z | 0 | no diagnostics |
| 3 | `eslint "src/**/*.ts" "prisma/*.ts" --max-warnings 0` (`apps/api`) | 05:36:45Z | 0 | no warnings, no errors |
| 4 | `rm -rf dist && nest build` (`apps/api`) | 05:37:02Z | 0 | `dist/main.js` emitted, 5314 bytes |
| 5 | `tsc --noEmit` (`apps/web-seller`) | 05:37:21Z | 0 | no diagnostics |
| 6 | `next lint --max-warnings=0` (`apps/web-seller`) | 05:37:30Z | 0 | "✔ No ESLint warnings or errors" |
| 7 | `next build` (`apps/web-seller`) | 05:39:38Z | 0 | 21 routes — 20 prerendered static, `/orders/[id]` server-rendered on demand; 99.2 kB shared first-load JS |

Two details about those commands are worth stating rather than leaving to inference. The API's
test runner is **node:test**, not jest — `describe`/`it` come from `node:test` and the suite is a
single `node --test` invocation over every `*.spec.ts` under `src`, which is why the totals in
row 1 count `describe` blocks as subtests alongside the 661 line-anchored `it(` declarations.
And the API's lint glob is `"src/**/*.ts" "prisma/*.ts"`, which deliberately excludes `test/**`;
that is the project's existing configuration and this phase did not widen it, so a lint pass is
a statement about `src` and `prisma`, not about the whole app directory.

### The `next/font` sandbox workaround, and its teardown

`next build` cannot resolve `next/font/google` here: the loader fetches font metadata from
Google at build time and this sandbox has no outbound network. The brief permits the established
stub for exactly that reason and requires the repository not to keep it. The full sequence, in
order, with the checks that make the restoration verifiable rather than asserted:

1. `cp app/layout.tsx /tmp/layout.tsx.bak` — backup taken.
2. `sha256sum` on both copies, agreeing at
   `1cf3f4d7ddf9ae228d672e89b12b874f66cca4afebd655fca36f79dda37b276e`, the recorded baseline.
3. The stub applied to the working copy only: the line
   `import { Baloo_2, Inter, Hind } from "next/font/google";` deleted, and the three loader calls
   replaced by plain objects carrying the same CSS variable names the JSX already consumes —
   `const display = { variable: "--font-display" }`, `const body = { variable: "--font-body" }`,
   `const deva = { variable: "--font-devanagari" }`. The patch printed
   `next/font occurrences now: 0`.
4. `next build` run against the stub — row 7 above, exit 0 at 05:39:38Z.
5. `cp /tmp/layout.tsx.bak app/layout.tsx` — restored at **05:40:21Z**.
6. `sha256sum app/layout.tsx` →
   `1cf3f4d7ddf9ae228d672e89b12b874f66cca4afebd655fca36f79dda37b276e`, byte-identical to the
   baseline in step 2, and `grep -c "next/font" app/layout.tsx` → **1**, the real import back in
   place.
7. `rm -rf .next`, then `ls -d .next` → "No such file or directory". The backup at
   `/tmp/layout.tsx.bak` was deleted in the same step; `/tmp` is sandbox-local and never part of
   the repository in any case.

So the build in row 7 proves the app compiles, and steps 6 and 7 prove the tree that proof was
taken from is the tree that ships. What the row does **not** prove is that the three Google fonts
resolve — that is a network fact this environment cannot establish, and it is listed in §16.

### Searches re-run after the fixes

The brief requires the §7 searches to be run again once the changes are in, and requires that no
number be carried forward without a recount. Both were done after the last fix landed and after
the layout restoration: the word-anchored fixture-constant sweep at **05:45:33Z**, the
case-insensitive substring sweep at **05:45:41Z**, and the permission-key and file-existence
checks immediately after. Every figure in §18 comes from those runs, and three of them moved
against the numbers an earlier draft held — which is the reason for the rule. The report file
itself was also re-scanned: 0 NUL bytes, `file` reporting "Unicode text, UTF-8 text".

## 16. Verification NOT run, and why

Four things a production readiness audit would normally do could not be done here. Each is a
capability this environment lacks, not a check that was skipped by choice, and none of them is
substituted for by an inspection dressed up as a test.

**No live API or database exercise.** There is no docker, no `psql`, no running Postgres or Redis
and no outbound network in this sandbox. Nothing in this report says an endpoint was called, a
migration was applied, a query plan was measured or a permission was enforced at runtime.
Where a claim concerns server behaviour it rests either on a spec file that ran (§14, §15 row 1)
or on the controller/DTO/service source read end to end (§5, §6) — and the report says which.
The distinction matters most for the new index migrations and the CORS refusal: both are backed
by unit tests over the same code path, neither has been observed against a real server.

**The applied state of the four index migrations is unknown.** `_prisma_migrations` lives in the
database, so with no database reachable there is no way to tell whether the four migrations
Phase 1 added have been applied to the developer's volume. They are present in
`apps/api/prisma/migrations` and they are valid SQL; whether the running instance has them is a
question only `prisma migrate status` against the real database can answer. It is carried into
§17 as a gap, and it is one of the four OUT OF SCOPE items in §4 for the same reason.

**`apps/web-admin` was not typechecked, linted or built.** The brief says to verify admin only if
admin was touched, and otherwise not to modify it. Admin was not touched — §2 records zero admin
files changed — so no admin command was run. The two admin defects this audit noticed (a wildcard
image host, and a raw `fetch` KYC download that does not encode its ids) are documented in §6 and
§10 and classified OUT OF SCOPE rather than fixed, because fixing them means editing admin.

**No font resolution, and no browser.** As §15 notes, `next build` succeeded against the font
stub, so the three Google font families are unverified here. Nor was any page opened in a
browser: the accessibility findings in §13 come from reading markup and attributes, and no
screen reader, axe run or keyboard walk-through was performed. The `aria-live` gap in §17 is
precisely the kind of thing a real screen-reader pass would rank, and this audit cannot rank it.

## 17. Remaining known gaps

This section is the honest ledger. Nothing here was fixed, and nothing here is hidden behind a
UI that pretends otherwise — that was the whole point of Phases 5 through 8. The gaps fall into
four kinds: things the seller console does imperfectly, things the backend has not built, things
this environment could not settle, and things deliberately out of scope.

**No screen-reader announcement of results.** `aria-live` appears **0** times in the seller
console. Mutations report themselves by re-rendering an `InlineError` or a success line, of which
there are **37** `<InlineError>` call sites outside `components/states.tsx`. A screen reader will
read those only if focus happens to land there, which for a save button that stays focused it
usually does not. Fixing it properly means deciding a politeness level per surface (`polite` for
a save confirmation, `assertive` for a destructive failure), choosing whether one region per page
owns announcements or each panel owns its own, and making sure the region is in the DOM before
the message arrives — otherwise nothing is announced at all. That is a design decision across 37
sites plus `states.tsx`, not a mechanical edit, and half-applying it would produce a console that
announces some outcomes and silently swallows others. It is the largest accessibility gap left.

**No test framework in the seller console.** All 30 spec files and all 713 tests are in
`apps/api`. Every front-end change in this and every prior phase is guaranteed only by
`tsc --noEmit`, `next lint --max-warnings=0` and `next build`. Those catch type errors and lint
violations; they cannot catch a permission gate that renders for the wrong role, a mutation that
forgets to refetch, or an error state that shows an empty list. Adding a runner is not a Phase 8
task — the brief forbids new tests except for defects found here — but the absence is real and it
is the reason several §6 and §7 findings had to be argued from source rather than pinned.

**The console reads shops one at a time.** Seven screens fan out one or more requests per
readable shop, at *n*, 3*n* and up to 4*n* requests, as §9 sets out in full. This is not
carelessness: the API is shop-scoped by design and there is no aggregate endpoint to call, apart
from analytics. The brief forbids inventing one, so the pattern is documented and the two
heaviest screens bound what they ask for. A seller with two or three shops will not notice; a
seller with fifteen would, and the honest fix is a backend aggregate, not a client-side trick.

**`orders.complete` is grantable and inert.** The permission exists in the catalogue
(`apps/api/src/rbac/permissions.catalog.ts:44`) and is bundled into two seeded roles
(`:153`, `:164`), but no route requires it. A shop owner can grant it and nothing changes. It is
labelled "Legacy" in the seller console's own catalogue (`lib/rbac.ts:193-197`) so the Roles
screen does not present it as a capability, but the grant itself still exists server-side.
Removing it means a migration over seeded role bundles, which is out of Phase 8's scope.

**Notifications have no shop column and no paging.** The notification list is per-user, not
per-shop, so the console labels a notification with a shop when the payload happens to name one
and never filters by shop — filtering would silently hide rows. It is also the one list in the
console with no `page`/`limit`, because the endpoint has none. Both are backend shapes, recorded
in §7 and §11, and neither can be corrected from the browser.

**The four index migrations are of unknown applied state.** Phase 1 added them, they are valid
SQL and they are in the tree, but as §16 explains there is no database here to ask. Before this
codebase is handed to anyone, `prisma migrate status` needs to be run against the real instance —
the indexes are the difference between a shop-scoped list query that seeks and one that scans.

**Two admin defects are documented and unfixed.** `apps/web-admin` allows a wildcard image host
in its Next config, and its KYC document download uses a raw `fetch` that does not
`encodeURIComponent` the ids it interpolates into the URL. Both are real; both are OUT OF SCOPE
because the brief says not to modify admin unless a Phase 8 requirement demands it, and neither
does. They are stated in §6 and §10 so they are not lost.

**The deferred capabilities remain deferred, and the console says so.** No finance core — no
ledger, escrow, settlement, payouts, statements or refunds. No sponsored listings. No delivery
ETA or SLA. No proof of delivery. No bulk catalog import. No low-stock thresholds. Bilingual
EN/Nepali is present in the design tokens, the fonts and the role catalogue's `labelNp` strings,
but the console's own copy is English — a real translation pass is task #90 and has not been done.
What Phase 8 guarantees is not that these exist but that nothing in the seller console claims
they do: each one is either absent or behind an honest unavailable screen, and §11 lists where.

**The customer surfaces and the mobile apps are outside this audit entirely.** Phase 8 examined
`apps/api` and `apps/web-seller`. The customer web app, the Expo apps and the admin console were
not audited for contract consistency, authorization, mutation honesty, dead capability or
accessibility. Any statement in this report about "the console" means the seller console.

## 18. Final fixture / permission search results

Every number below was counted today, after the last fix and after the layout restoration, at
05:45:33Z and 05:45:41Z. The scope is `apps/web-seller`, files matching `*.ts` and `*.tsx`, with
`node_modules` and `.next` excluded. The grep mode is stated per group, because a word-anchored
count and a substring count of the same term are different questions and conflating them is how a
clean-looking figure hides a hit.

**Fixture constant names — word-anchored (`grep -rnw`).** These are the identifiers the deleted
fixture modules exported, so a live hit would mean fixture data is still being read.

| Term | Count | Where |
|---|---|---|
| `SHOPS` | 1 | `components/providers.tsx:33` — comment |
| `MERCHANT` | 0 | — |
| `STAFF` | 2 | `app/(app)/delivery/page.tsx:75`, `components/providers.tsx:36` — comments |
| `ORDERS` | 1 | `components/shell/Sidebar.tsx:44` — comment |
| `PRODUCTS` | 0 | — |
| `SALES_7D` | 0 | — |
| `TOP_PRODUCTS` | 0 | — |

All four hits are prose inside comment blocks that record what the fixture used to do and why it
is gone — `Sidebar.tsx:44`, for instance, explains that the Orders count pill came from an
`ORDERS` fixture and read 0 for every real shop id. The brief explicitly says not to delete
comments merely for containing such words, and these are the reason the rule exists. No
identifier is declared, imported or referenced. The modules themselves are gone: `lib/data.ts` is
absent, and a filename search for `data.ts`, `*fixture*` or `*mock*` anywhere in the app returns
**0** files.

**Fake-data and fake-money vocabulary — case-insensitive substring (`grep -rni`).** A substring
count is deliberately the noisier question: it catches `payoutMethod` as well as a payout balance,
and every non-zero line below was opened and read.

| Term | Count | Verdict |
|---|---|---|
| `fixture` | 11 | All comments recording removed fixtures (`lib/rbac.ts:25`, `:311`, `lib/catalog-view.ts:4`, `components/orders/OrderBits.tsx:46`, `components/auth-provider.tsx:9`, and the four above) |
| `mock` | 0 | — |
| `fake` | 1 | `app/(app)/delivery/page.tsx:1317` — a comment stating no drawing surface *is* faked |
| `demo` | 0 | — |
| `dummy` | 0 | — |
| `seed` | 13 | All 13 are comments, no identifier: 10 about RBAC seeded roles or about form state being re-seeded from a refetch, 2 about rows a seed wrote predating a DTO (`lib/delivery-view.ts:255`, `lib/api/delivery.ts:148`), and the docblock at `lib/api/orders.ts:397` calling `EMPTY_ORDER_SUMMARY` "a seed, not a display value" |
| `hardcoded` | 0 | — |
| `stub` | 0 | — |
| `placeholder` | 97 | 78 are the HTML `placeholder=` attribute; 19 are the `placeholder?: string` prop on the two field components (`components/onboarding/fields.tsx`, `settings/page.tsx`) and comments denying that an empty-photo tile is a placeholder for a coming feature |
| `payout` | 48 | Every one is `payoutMethod` — a real column on the onboarding application, meaning *how you want to be paid* — or a comment saying no payout balance exists (`settings/page.tsx:739-742`, `:765`), or the retired `finance:payout` key at `lib/rbac.ts:126` |
| `settle` | 20 | 16 are comments refusing to present a settlement figure; 4 are `settled`/`setSettled`, the debounce state in `lib/use-debounced.ts:18-25` |
| `escrow` | 0 | — |
| `ledger` | 2 | Two comments stating the seller ledger is unbuilt (`lib/rbac.ts:122`, `lib/api/orders.ts:306`) |
| `commission` | 1 | `lib/api/analytics.ts:29` — a comment stating sales are not take-home because no commission exists |
| `refund` | 4 | `REFUNDED` on the real `PaymentStatus` union (`lib/api/orders.ts:58`) and its label (`orders/[id]/page.tsx:896`), plus the retired `orders:refund` key and its reason (`lib/rbac.ts:94`, `:96`) |
| `invoice` | 0 | — |

Three of these figures moved against the numbers an earlier draft of this report carried —
`fake` from 2 to 1, `placeholder` from 98 to 97, `payout` from 53 to 48. The numbers above are
today's recount and the earlier ones are not used anywhere in this report. That is exactly the
outcome the "recount, do not carry forward" rule is for.

**Retired permission keys — pattern search (`grep -rnoE '"[a-z]+:[a-z_]+"'`).** The API's live
permissions are dot-notation (`orders.accept`); colon notation is the old scheme, so any colon key
still reaching an authorization call would be a permanently false check.

The pattern returns **27** matches. **26** are in `lib/rbac.ts`, on lines 89 through 149 — every
one inside the `RETIRED_PERMISSIONS` table, which is declared at `:84` and closes at `:150`. That
table exists precisely so a retired key has one home and a documented reason; it is data about
history, not a check. The 27th is a **false positive and is disclosed rather than counted**:
`"lg:hidden"` at `app/login/page.tsx:189` is a Tailwind responsive class that happens to match the
shape. A pattern search for permission-looking strings will always catch Tailwind breakpoints, and
reporting 27 keys would have been wrong in the other direction.

Independently, a search for any colon-notation string being passed to `can(`, `canInShop(`,
`canAnywhere(` or `hasPermission(` returns **0**. So no retired key is checked anywhere: the 26
are inert records, and every live gate uses the dot-notation catalogue that mirrors the backend.

---

That is the whole of Phase 8. The seller console and the API it depends on were audited against
the ten areas the brief named; 19 findings were fixed, 13 were confirmed already correct, 6 were
documented and 4 were left out of scope with reasons. Every command in §15 was run and its exit
status read; everything §15 does not list was not run, and §16 says why. The console makes no
claim this repository cannot honour, and the gaps it does have are written down in §17 rather than
papered over. Phase 8 ends here.
