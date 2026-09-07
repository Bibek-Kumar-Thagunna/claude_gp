# Task 10 Phase 7 — Final Seller Console Dead-Code, Capability & Integrity Sweep

**Written 2026-09-01.** Scope: re-audit every remaining seller-console capability against the actual
source, remove what is genuinely dead, and make the rest either connected, honestly unavailable, or
documented as a platform limitation. No new business capability was built.

**Read this first.** Every check reported here is **static**: type-checking, linting, a production
compile, and unit tests run in-process. This sandbox has **no database, no Docker and no outbound
network**, so **no live HTTP request was made against a running API** and **no migration was applied**.
Where this document says "verified", a named command exited 0 and its output is quoted below. It never
means "observed working against a live server". Where a number appears, it was counted from the code by
a command, not estimated.

Reports from Tasks 1–6 were treated as *historical evidence*, not as truth. Every claim they made was
re-checked against source. Two of their statements turned out to be wrong and are corrected in §2 (the
seven-name type re-export barrel in `lib/api/delivery.ts`, five of whose names had no reader) and §11
(the seller build's route count).

---

## 1. What was audited, and the two rules used to adjudicate

The audit covered all of `apps/web-seller` (pages, components, `lib/`, `lib/api/`), the seller-scope
half of `apps/api/src`, and the four files of `packages/api-client/src` that the seller console
depends on. It read comments and documentation as well as executable code, because a stale *comment*
is allowed to describe something removed while a stale *reference* is not.

Deciding what counts as dead needed two rules, both adopted before any deletion:

**Rule (a) — values and types are not judged alike.** An exported *value* with no importer is code
that ships and runs, so it is removed or demoted to module-private. An exported *type* that names the
shape an exported function returns or accepts is **kept**, because it is the annotation for that
result and it is erased at build time. Deleting it would leave callers unable to name what they hold.

**Rule (b) — when judging whether a field is dead, grep must include the declaring module.** An
earlier pass excluded it and concluded the `family` field was unused; removing it produced a TS2339.
Every field verdict in this task was re-run with the declaring file in scope.

Rule (a) prevented a near-miss worth recording. `PolygonParse` looked like it should be demoted
alongside `parseStoredPolygon`, which became module-private in this task — but it is also the return
type of the *exported* `parsePolygonText` (`apps/web-seller/lib/delivery-view.ts:329`). It was checked
before editing and kept. The same check kept `CouponStatus` (the key type of the exported
`STATUS_LABELS` / `STATUS_TONES`), `OrderRider` (composed into the exported `ShopRider`), `StockState`,
`ShopAccent`, `NotificationPayload` and `PermGroup`.

---

## 2. Dead code: 91 unreferenced exports audited, 0 genuinely dead

A whole-app sweep found **91** exported symbols in `apps/web-seller` with no importer outside their own
file: **35** values and **56** types. Every one was then opened and traced. **None was dead code** in
the sense of code no path reaches — each value is called inside its own module, and each type annotates
an exported declaration. So the fix was surface honesty rather than deletion.

**21 values demoted to module-private** across eight view-model files, each confirmed to be called only
inside its own module before the `export` keyword was removed:

| File | Demoted |
| --- | --- |
| `lib/analytics-view.ts` | `windowLabel` |
| `lib/catalog-view.ts` | `productPhotos`, `stockStateOf`, `toSellerProduct` |
| `lib/delivery-view.ts` | `deliveryLane`, `parseStoredPolygon`, `riderStatusTone`, `toDeliveryZone` |
| `lib/notifications-view.ts` | `notificationTypeLabel`, `parseNotificationData`, `toSellerNotification` |
| `lib/orders-view.ts` | `isTerminalOrderStatus`, `toSellerOrder` |
| `lib/promotions-view.ts` | `couponStatus`, `dateInputValue`, `endOfDayIso`, `toSellerCoupon` |
| `lib/reviews-view.ts` | `toSellerReview` |
| `lib/shop-view.ts` | `accentForShopId`, `shopStatusLabel`, `toSellerShop` |

The pattern is consistent: what a screen imports is the *plural* mapper (`toSellerProducts`) and the
label/tone tables; the singular row mapper and the presentation helpers are that mapper's internals.
The eight files now hold **38** module-private functions in total (`grep -cE '^function '` summed), of
which these 21 are new to this task. The edit was applied by a script that refused any name not
matching `^export (function NAME\b)` exactly once, so no same-named symbol elsewhere could be caught.

**14 values kept exported despite having no importer**, under §13's carve-out for "an API/shared
boundary intended for an existing route":

- `listShopProducts`, `listShopCoupons`, `listShopReviews` — the single-page primitives that their own
  `…All…` wrappers call (`lib/api/products.ts:333/337`, `promotions.ts:242/246`, `reviews.ts:193/197`).
- `PRODUCT_PAGE_LIMIT`, `PRODUCT_MAX_PAGES`, `COUPON_PAGE_LIMIT`, `COUPON_MAX_PAGES`,
  `REVIEW_PAGE_LIMIT`, `REVIEW_MAX_PAGES`, `ORDER_PAGE_LIMIT`, `ORDER_MAX_PAGES` — each documents the
  `limit` its route actually enforces, and a screen that wants to explain its own paging needs them.
- `UNCATEGORISED`, `NOTIFICATION_PAGE_LIMIT`, `SHOP_ACCENTS`.

`RETIRED_PERMISSIONS` also stayed exported: §14 mandates keeping the table, and demoting an unread
`const` would fail `no-unused-vars` at `--max-warnings=0`.

**Genuinely removed, earlier in this task, with a comment left where each stood:**

- `lib/motion.ts` — `fadeIn`, `stagger`, `scaleIn`. Three unused variants "whose only effect was to
  suggest four house motions where there is one"; `fadeUp` is the console's single entrance.
- `lib/format.ts` — `minutesUntil`, and `rsPlain` / `pct` with it. `minutesUntil` read "minutes
  remaining until an SLA deadline": no order, delivery or shop column holds one, no seller route
  returns one, and **GoPasal makes no delivery-time promise anywhere by design**, so a helper naming a
  deadline is an invitation to render a countdown the platform cannot honour.
- `lib/i18n.ts` — deleted. A phrasebook of **fifteen** words behind a language toggle; the honest note
  now sits at `components/shell/Topbar.tsx:108`. Real bilingual EN/NP is a separate, still-owed task
  and is *not* claimed here.
- `lib/api/delivery.ts` — **5** type re-exports trimmed (`DeliveryPatchBody`, `DeliveryRiderWire`,
  `DeliveryWire`, `RiderStatusWire`, `ShopRiderWire`). Nothing imported them by that path;
  `lib/delivery-view.ts` and `lib/orders-view.ts` both take them from `./api/orders`, where they are
  declared. The four *value* re-exports (`assignRider`, `listShopRiders`, `patchDelivery`,
  `unassignRider`) were kept deliberately, so the delivery screen has one import surface for the two
  routes that are order-addressed.

Per §2, documentation explaining that something was removed is not itself a fixture, and no test
fixture was deleted from a test file for containing the word "fixture".

---

## 3. API helper audit — every helper against its controller

Each function in `apps/web-seller/lib/api/*.ts` was matched to the decorator that answers it: path
(including the `setGlobalPrefix('api')` + URI-version `1` prefix, so `/api/v1/…`), method, body DTO and
`@RequirePermissions` key. No helper was found addressing a route that does not exist, and no helper
was found claiming a permission the route does not require.

Two findings worth stating because they shape UI, not because they are bugs:

- **Every seller delivery route is shop-scoped**, including the ones that read as global elsewhere:
  removing a rider is `DELETE /seller/shops/:shopId/riders/:riderId`, not `DELETE /riders/:riderId`.
  That prefix is how `PermissionsGuard` finds the shop whose membership it must check, so there is no
  unscoped rider route for a seller to call.
- **Permissions are not uniform within one controller.** In `delivery.seller.controller.ts` reads are
  `delivery.view`, rider register/remove and assignment are `delivery.assign`, the delivery PATCH is
  `delivery.update`, and **zone writes are `settings.manage`** — a delivery teammate can see the zones
  and never edit them. `lib/api/delivery.ts` documents this at each function.

`POST …/riders` returns the `Rider` row with only `include: { user: { select: { name, phone } } }`, so
it is typed `RegisteredRiderWire` and deliberately **not** `ShopRiderWire`: typing it as the roster row
would invite a caller to splice it into a loaded list and blank `avatarUrl`, `activeDeliveries` and
`location`. The console refetches the roster instead.

---

## 4. Permission audit, and the retired-key table

`apps/web-seller/lib/rbac.ts` exports exactly four things: `PermissionId`, `PermGroup`,
`PERMISSION_GROUPS` and `RETIRED_PERMISSIONS`. Every key in `PermissionId` was compared to
`apps/api/src/rbac/permissions.catalog.ts`. The browser catalogue is a mirror of the API's, in the API's
dot notation, and **no removed permission name was silently restored** (§5).

`RETIRED_PERMISSIONS` holds **26** entries (counted: `key: "` occurrences inside the array literal),
each with a reason and a replacement or `null`. It is kept per §14 even though nothing reads it, because
it is the record of what an old colon-notation key became — for example `orders:refund` maps to
`orders.cancel` with the reason "No refund permission exists in any scope; refunds are unbuilt (finance
core). Cancelling an order is the nearest real grant."

Two live catalogue keys grant nothing today, and the API now says so in its own `description` rather
than in a frontend comment:

- `orders.complete` — "Legacy key… granting this one on its own changes nothing."
- `catalog.import` — "Reserved. GoPasal has no bulk import endpoint yet, so granting this permits
  nothing today."

Both were **kept, not deleted**: existing seeded roles grant them and `shop-status.policy.ts`
references `catalog.import`. Removing a key that a stored `RolePermission` row names would be a silent
authorization change, which §14 forbids.

**No owner bypass exists in the browser.** `RbacService.describe()` already expands privileged roles and
subtracts what a shop's lifecycle forbids, so the console asks the same question the guard does rather
than short-circuiting on a role name.

---

## 5. Multi-shop authorization audit

**12** screens are wrapped in `<PermissionGate>` (counted: `grep -rlE '<PermissionGate' app`). Every
shop-scoped control was checked to use `canInShop(shopId, permission)` against the shop the row belongs
to — never an ambient check, and never the *active* shop's id when the row came from another shop.

The rule the console follows: `useSeller().can` degrades to a "does the user hold this anywhere" check
**only** when `activeShopId === null`, which is the deliberate "all shops" view. Any list that can show
rows from more than one shop — the order queue is the important one — computes permission per row from
that row's own `shopId`. `useAuth().canAnywhere(key)` is reserved for navigation, where the question
really is "is this screen worth showing at all".

Cross-shop reads cannot be widened from the browser because there is no unscoped seller route to widen
to: `:shopId` is in the path of every seller write, and `assertVisibleInScope` answers
`NotFoundException('Role not found')` rather than a 403 for another shop's role, "so the id space of
other shops stays opaque". §15's rule against silently changing backend authorization semantics was
observed — no guard, decorator or scope resolver was modified in this task.

---

## 6. Success messages: does the server say it happened?

§7's rule is that a success state may never be triggered by `setState(...)` or by a dialog closing. The
sweep found exactly **two** success-state setters in the whole console
(`grep -rnE "set(Saved|Sent|Done|Success|Copied|Created|Ok)\("` over `app` and `components`):

- `app/(app)/settings/page.tsx:171` — `setSaved(row.name)`. Reached only after `updateShop` resolves
  **and** the refetch that follows it resolves, and it is named from `row.name` — the value the *server*
  returned, not the value typed into the form. If the PATCH succeeds and the refetch fails, no success
  message appears.
- `app/(app)/staff/page.tsx:929` — `setCopied(what)`. This one reports a *browser* fact (text was put on
  the clipboard) and makes no claim about the server, which is the only case where local state is the
  honest source.

Everywhere else the console follows **refetch-never-merge**: a write's response is not spliced into a
loaded list. `components/catalog/VariantEditor.tsx` is the clearest instance — all three variant routes
answer with the changed variant alone, so the component calls `onChanged()` and asks its caller to
re-read rather than patching a row into a product.

---

## 7. Empty, loading, error and unavailable states

§8's rule is that these four cases must not collapse into one. Each list screen was checked to
distinguish: *loading*, *the shop genuinely has none of these*, *your filter or search matched nothing*,
and *the request failed*. The fourth is an `InlineError` carrying the API's own message when the failure
is an `ApiError`, and a neutral "That didn't go through. Please try again." otherwise — never a blank
list that reads as "you have none".

A fifth state exists in this console and is distinct from all four: **unavailable**. `catalog/import`
renders an explanation that no bulk-import endpoint exists rather than a disabled form, and the variant
editor shows the server's `isActive` as an "Off" badge with a tooltip saying the console has no control
for it — so `/inventory` and the editor agree instead of one reading "Off" and the other looking normal.
The stock note under the editor states plainly that stock there **sets** a variant count while the
Inventory screen's plus/minus adjusts the product total, "that is the only thing the stock endpoint can
change".

---

## 8. Capability classification, re-verified

`SELLER_CAPABILITY_CLASSIFICATION.md` was re-counted from its own entries rather than trusted:
**71 REAL** routes (69 table rows; the three zone-write routes that share one row are counted
separately), **8 READ-ONLY** field groups, **7 DERIVED** calculations, **13 UNAVAILABLE** capabilities.

Per §12, no entry in that document was rewritten. **It was not modified in this task** — its last write
is Phase 6 (mtime 2026-09-01 13:27, before the Phase 6 report at 13:32) — because Phase 7 changed no
capability's status: everything it removed was either an unreferenced helper, a presentation surface, or
a hardening of an existing route, none of which moves a row between REAL, READ-ONLY, DERIVED and
UNAVAILABLE. The deleted fifteen-word phrasebook does not appear there either; the document never
claimed a bilingual capability (`grep -i "bilingual\|nepali\|language\|i18n"` returns nothing), so
deleting the dictionary did not make it false.

One prior statement in it *is* worth re-flagging rather than trusting: its own warning that the four
authored index migrations "cannot be applied here, so their effect is **unverified** and must never be
described otherwise" still holds, unchanged, in this task. See §13.

---

## 9. Defects found and fixed, and how each is covered

§15 allows a fix only when it breaks an already-completed capability, is small and local, ships with a
regression test where a test is possible, and does not expand into Phase 8. Six qualified. No new
business capability was implemented, and no migration was added.

**9.1 — `@IsOptional()` lets `null` skip every validator.** Measured, not assumed: with a bare
`@IsOptional()`, the bodies `{name: null}`, `{isOpen: null}` and `{deliveryRadiusKm: null}` each reached
Prisma and produced a 500 on a non-nullable column. `@OptionalField()` is
`ValidateIf((_object, value) => value !== undefined)` and therefore *does* 400 on `null`.
`apps/api/src/common/dto/optional-field.decorator.ts` now documents both behaviours and states that the
`@IsOptional()` choice on `UpdateProductDto` is **deliberate** — `keep(v) = v ?? undefined` in
`products.service.ts` protects the non-nullable columns there — with the explicit instruction "do not
sweep one into the other."

**9.2 — unbounded search strings.** `apps/api/src/common/dto/pagination.dto.ts` gained
`export const SEARCH_MAX_LENGTH = 120;` and `@MaxLength(SEARCH_MAX_LENGTH)` on `q`. It is imported by
`coupons.dto.ts:4/158`, `orders.dto.ts:15/127` and `reviews.dto.ts:13/96`, and re-exported from
`packages/api-client/src/types.ts` so both consoles' search boxes cap at the same number the server
enforces rather than at a hand-typed constant.

**9.3 — `RolesService.update` had no spec at all.** `apps/api/src/rbac/role-writes.spec.ts` is **new**:
**12 tests / 3 suites**, exit 0. The DTO spec proves `UpdateRoleDto` *admits* `null`; this file pins what
the service then does with it, because that is where the safety lives. `patch.name?.trim()` collapses a
missing *or* null name to `undefined` and Prisma leaves a column alone on `undefined`, so a role cannot
be made nameless; `description` is written straight through, so `''` and `null` both clear the `String?`
column — the console's role editor has no other spelling for "remove this".

The more dangerous half is `if (patch.permissions)`. A rename must not touch `RolePermission`; if that
check ever loosened to a truthy test on a defaulted `[]`, saving a role's *name* would silently strip
every permission and lock a whole team out of a shop. The spec asserts the write **order** for that
reason: permissions omitted gives `['role.update']` alone, while permissions sent gives
`['rolePermission.deleteMany', 'rolePermission.createMany', 'role.update']` inside one transaction —
it is a replace, and it has to happen in the transaction that also updates the row. `permissions: []` is
taken literally (`permissionCreates === [[]]`), because that is how the editor unchecks the last box.
Guard failures assert `assertUntouched(calls)` — nothing written at all: an unknown key
(`orders.teleport`) and a PLATFORM key on a SHOP role (`shops.approve`) are 400s; a seeded system role
and the privileged Owner role are 403s; another shop's role and a nonexistent id are both
404 `'Role not found'`; a missing shop scope is a 400.

**9.4 — product/variant PATCH sinks spread the request object into Prisma.** `products.service.ts` now
projects by hand instead: `productData()` and `variantData()` name every column a PATCH may touch, and
`keep(v) = v ?? undefined` routes only the **non-nullable** columns, so a JSON `null` on `name`, `price`,
`unit`, `tags`, `trackStock`, `stock` or `isActive` means "leave it alone" rather than reaching Prisma.
Genuinely nullable columns (`nameNp`, `description`, `categoryId`, `mrp`, `sku`) are passed straight
through, because for them `null` *is* the way to clear a value.

The comment explains why this second wall exists behind an already-whitelisting pipe: "the update sinks
used to spread the request object straight into `prisma.product.update({ data })`, which is safe exactly
as long as every caller is a validated DTO — and one route already lost that property once by being typed
`Partial<VariantDto>`." That earlier defect (a mapped type's design-time metadata is `Object`, so
`ValidationPipe` found no class and skipped the body) was fixed in Phase 6 by introducing
`UpdateVariantDto extends VariantDto`; this task removed the *shape* of code that made it exploitable.
The list also carries an instruction: **`images` is not in it and must not be added** — that column is
written only by the three image routes, which mint their own keys, and "a PATCH-able `images` is how a
client names a storage path."

**9.5 — the seller console proxied images from any host on the internet.**
`apps/web-seller/next.config.ts` had `remotePatterns` with `hostname: "**"`, which makes Next's image
optimiser an open proxy. It now builds its allow-list with `imagePatterns()` from
`NEXT_PUBLIC_API_URL` plus `NEXT_PUBLIC_IMAGE_HOSTS`, and **throws** on any hostname containing `*`
("Refusing to allow the wildcard image host …"). That throw is the regression test: the wildcard cannot
come back without failing `next build`, which is exercised in §11.

**9.6 — a download read the access token by hand and never refreshed.**
`apps/web-seller/lib/api/onboarding.ts:143` fetched a KYC document by reading the stored access token
directly, so an expired token produced a failed download instead of a silent refresh. The shared client
gained the missing primitive — `rawBlobRequest` (`packages/api-client/src/http.ts:239`) and `authedBlob`
(`session.ts:243`, `withFreshToken((token) => rawBlobRequest(path, { ...options, token }))`) — and the
seller call now goes through it, so a download takes the same refresh path as every other authed request.
Covered by type-check and build; there is no way to exercise a token refresh statically in this sandbox,
and this document does not claim otherwise.

---

## 10. Fake, mock, simulated and placeholder data

§18's distinction was applied: a historical comment documenting a removed thing is not a defect; an
executable reference is. Every hit for fixture/mock/demo/stub/sample/TODO/FIXME/HACK vocabulary across
`apps/web-seller` was opened. **None was executable fake data.** The categories found:

- **Nepali phone placeholders** — `98XXXXXXXX` in input `placeholder` attributes. A placeholder is UI
  copy telling a shopkeeper the shape of a phone number; it is never submitted.
- **Benign `setTimeout` calls** — OTP input focus, the copy-badge reset in `staff/page.tsx`, the splash
  animation, an object-URL revoke after a download, and the search debounce. None of them stands in for
  a server round-trip; none resolves a promise the server should have resolved.
- **Historical comments** — for example the note at `components/shell/Topbar.tsx:108` recording the
  deleted fifteen-word phrasebook, and the block in `lib/api/delivery.ts` listing the five type
  re-exports that were removed and why. §18 explicitly permits these, and §2 forbids deleting them.

Two structural checks back this up. There is **no raw `fetch(`** left anywhere in `apps/web-seller`
outside the shared client — every request goes through `packages/api-client`, so there is no path that
could quietly return a literal instead of a response. And every seller fixture module is gone: the last
one was deleted when analytics was wired, and `lib/` now contains only view models, `rbac.ts`, `format`,
`motion`, `cn`, `use-debounced` and `api/` (`ls lib/` in §11).

---

## 11. Verification commands and results

Every command below was run in this sandbox for this report and its **actual exit code** is quoted, per
§17. Nothing here involved a database, a container or the network.

```
apps/api      tsc --noEmit                                         exit 0
apps/api      eslint src --max-warnings=0                           exit 0
apps/api      nest build                                            exit 0
apps/api      node --require ts-node/register/transpile-only \
                --test $(find src -name '*.spec.ts' | sort)         exit 0
                # tests 649   # suites 118   # pass 649
                # fail 0      # cancelled 0  # skipped 0
apps/web-seller  next build                                         exit 0
apps/web-seller  tsc --noEmit                                        exit 0
apps/web-seller  next lint --max-warnings=0                          exit 0
                 ✔ No ESLint warnings or errors
apps/web-admin   tsc --noEmit                                        exit 0
```

**Test totals.** 649 tests across 118 suites in **30** spec files, 0 failing. The previously recorded
baseline was 628 tests / 113 suites; this task added **21** tests in **5** suites — 9 in
`common/dto/request-validation.spec.ts` (now **94 tests / 14 suites**) and 12 in the new
`rbac/role-writes.spec.ts` (**12 tests / 3 suites**).

**A correction to an earlier figure.** Previous notes said the seller build produces "21 routes". Both
numbers are real and they measure different things: the build's route table has **20** entries
(`grep -cE '^(┌|├|└)'` = 20) while Next reports "Generating static pages (21/21)". This report states
both rather than repeating the single figure.

**The `next build` font workaround, and proof it left nothing behind.** This sandbox has no outbound
network, so `next/font/google` cannot fetch. For the build only, `app/layout.tsx` was copied aside, its
`next/font` import deleted and the three font calls replaced with plain `{ variable: … }` objects; after
the build the original was restored and re-checked: sha256
`1cf3f4d7ddf9ae228d672e89b12b874f66cca4afebd655fca36f79dda37b276e`, `grep -c "next/font"` back to `1`,
`.next` removed. The whole sequence ran inside a single shell invocation so the file could not be left
stubbed. `app/layout.tsx` is therefore **excluded** from §12's file count — its mtime moved but its bytes
did not.

**Structural checks quoted in §10:** `grep -rn "\bfetch("` over `app`, `components` and `lib` returns
**0**; `ls lib` shows 15 modules plus the `api/` directory, with no fixture or mock module among them.

---

## 12. Files changed

**This repository is not a git repository**, so there is no `git diff` to cite. The change set was
reconstructed from file mtimes against a boundary: `TASK_10_PHASE_6_REPORT.md`, written at the end of the
previous phase (2026-09-01 13:32 local). Files newer than that boundary under `apps/api/src`,
`apps/web-seller` and `packages/api-client/src`:

**57 files** — 9 in `apps/api`, 44 in `apps/web-seller`, 4 in `packages/api-client`. (`find … -newermt`
returns 58; `apps/web-seller/app/layout.tsx` is subtracted for the reason given in §11.)

`apps/api` (9):

```
src/common/dto/optional-field.decorator.ts     null-vs-undefined semantics, documented
src/common/dto/pagination.dto.ts               SEARCH_MAX_LENGTH + @MaxLength on q
src/common/dto/request-validation.spec.ts      +9 tests (94 tests / 14 suites)
src/modules/catalog/products.service.ts        hand-projected PATCH columns; images excluded
src/modules/coupons/dto/coupons.dto.ts         imports the shared q cap
src/modules/orders/dto/orders.dto.ts           imports the shared q cap
src/modules/reviews/dto/reviews.dto.ts         imports the shared q cap
src/rbac/permissions.catalog.ts                honest descriptions for orders.complete, catalog.import
src/rbac/role-writes.spec.ts                   NEW — 12 tests / 3 suites
```

`packages/api-client` (4): `src/http.ts` (`rawBlobRequest`), `src/session.ts` (`authedBlob`),
`src/index.ts` (exports), `src/types.ts` (re-exports `SEARCH_MAX_LENGTH`).

`apps/web-seller` (44), by area: 13 in `lib/`, 13 in `app/`, 7 in `lib/api/`, 3 in
`components/onboarding/`, 2 in `components/shell/`, one each of `components/providers.tsx`,
`components/auth-provider.tsx`, `components/PermissionGate.tsx`, `components/ShopScope.tsx`,
`components/catalog/VariantEditor.tsx`, and `next.config.ts` at the app root. One file was **deleted**
(`lib/i18n.ts`), so it appears in no list above.

---

## 13. Out of scope: recorded, deliberately not fixed

These are **not bugs in the seller console**. Some are deliberate scope boundaries; the rest are real
issues that §0 rules 8–12 put outside this task. They are written down so the next phase inherits them
rather than rediscovering them.

**Deliberate scope boundaries** (the UI says so on screen, and §20 forbids calling them bugs): bulk
catalog import, sponsored/featured placement, payouts, settlement, refunds, ledger and escrow, low-stock
thresholds, proof-of-delivery photos, delivery ETA and rider shifts, notification and review pagination,
per-shop notification filtering, shop logo/cover upload, and clearing a shop's `categoryId` / `lat` /
`lng`. Thirteen such capabilities are enumerated with their reasons in
`SELLER_CAPABILITY_CLASSIFICATION.md` under **UNAVAILABLE**. Delivery ETA additionally is a *brand* rule,
not a gap: GoPasal makes no delivery-time promise anywhere by design.

**Real issues left untouched, with the rule that forbade touching them:**

1. **`apps/web-admin/lib/api/onboarding-review.ts:163-184` still downloads a KYC document with a raw
   `fetch` and a hand-read access token** — the exact defect §9.6 fixed on the seller side. `authedBlob`
   already exists in the shared client, so the fix is a two-line change. Not applied: §0 rule 12, "do not
   modify unrelated customer/admin applications."
2. **`apps/web-admin`'s image-host configuration still has the wildcard hole** that §9.5 closed in
   `apps/web-seller/next.config.ts`. Same rule, same one-file fix, and the seller version's `throw` is
   ready to copy.
3. **Four Prisma migrations are authored and unapplied in this sandbox** —
   `20260826161105_seller_query_indexes`, `20260826182000_review_shop_created_index`,
   `20260826204500_coupon_shop_created_index`, `20260827093000_notification_user_created_index`. There is
   no database here, so their effect is **unverified** and this report does not describe it otherwise.
4. **Other DTOs still use bare `@IsOptional()` on non-nullable columns.** The worst case is now a 400
   rather than a 500, because `AllExceptionsFilter` answers `PrismaClientValidationError` with one — but
   that is a net, not a validator. Each DTO needs its own test before being switched to
   `@OptionalField()`, and §15 caps this task at defects that break an already-completed capability.
   `UpdateProductDto` and `UpdateRoleDto` are deliberately **excluded** from any future sweep: their
   services give `null` a defined meaning (§9.1, §9.3), so `optional-field.decorator.ts` says outright
   "do not sweep one into the other."

**Nothing from Phase 8 was started.** No finance, payouts, settlement, refund, ledger, sponsored-listing,
ETA, rider-shift, bulk-import, POD-upload or pagination work was added; no aggregate endpoint was created
to make a screen easier; no migration was written; no guard or scope resolver was changed; and no
customer or admin application was modified. Task 7 ends here.
