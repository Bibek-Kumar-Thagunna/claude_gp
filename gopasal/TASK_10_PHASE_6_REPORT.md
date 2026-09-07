# Task 10 Phase 6 — Shop Settings Update, Wired

**Written 2026-09-01.** Scope: wire the highest-value remaining real seller capability —
`PATCH /seller/shops/:shopId`. Nothing outside that path was changed.

**Read this first.** Every check reported here is **static**: type-checking, linting, a production
compile, and unit tests run in-process. This sandbox has **no database, no Docker and no outbound
network**, so **no live HTTP request was made against a running API** and no migration was applied.
Where this document says "verified", a named command exited 0 and its output is quoted. It never means
"observed working against a live server".

---

## 1. The backend endpoint audited

One route, and only one, writes a `Shop` row in seller scope:

```ts
// apps/api/src/modules/catalog/catalog.seller.controller.ts:61-65
@Patch('shops/:shopId')
@RequirePermissions('settings.manage')
updateShop(@Param('shopId') shopId: string, @Body() dto: UpdateShopDto) {
  return this.shops.update(shopId, dto);
}
```

Absolute path `PATCH /api/v1/seller/shops/:shopId` — `setGlobalPrefix('api')` plus URI version `1`.

`ShopsService.update` (`apps/api/src/modules/catalog/shops.service.ts`) does exactly two things: it
calls `exists(shopId)`, which throws `NotFoundException('Shop not found')` when
`prisma.shop.findUnique` returns null, then `prisma.shop.update({ where: { id: shopId }, data: input })`.

Four properties of that shape mattered to the frontend, and each was read out of the source rather
than assumed:

- **It is a true partial PATCH.** Nothing is defaulted and nothing absent is written as null, so
  submitting a diff genuinely leaves every other column alone. Pinned by
  `shop-settings.spec.ts` → "sends exactly the keys it was given and no others".
- **The service has no tenancy check of its own.** The shop id *is* the path parameter
  `PermissionsGuard` resolved its verdict from, so membership in that shop is the whole of the check.
  That makes the guard load-bearing, which is why half of `shop-settings.spec.ts` pins its verdicts.
- **The response is a bare `Shop`.** `prisma.shop.update(...)` is returned directly — no `myRole`, no
  `_count`, no `category`. It is therefore *not* a `SellerShopWire` and must not be merged into one.
  The console refetches instead.
- **An unknown shop is a 404, but a non-member never reaches it** — the guard answers 403 first.

**No new backend endpoint was created.** The existing route already supported the operation.

### Null / empty / omitted semantics

`UpdateShopDto` marks every field with the project's `@OptionalField()`, which is
`ValidateIf((_object, value) => value !== undefined)` (`apps/api/src/common/dto/optional-field.decorator.ts`).
So:

| Client sends | API does |
| --- | --- |
| key omitted | column untouched (`undefined` reaches Prisma as "not provided") |
| `""` on a nullable text column | column set to the empty string — a real clear |
| `null` | **400** — the value is defined, so `@IsString()`/`@IsNumber()` runs and rejects it |
| `"27.7"` for a number, `"true"` for a boolean | **400** — bodies get no implicit conversion |

The consequence the UI has to live with: `categoryId`, `lat` and `lng` are nullable columns whose DTO
fields refuse `null` and have no empty-string meaning, so each can be **changed and never emptied**.
The API has no spelling for "unset this".

An empty body `{}` is accepted as a no-op write rather than an error.

### Business rules found

- `hours` is **plain free text**, `@MaxLength(120)` — e.g. "6:30am – 9pm". There is no schedule model,
  no per-day structure and no open/close time columns. Whether the shop is currently taking orders is
  the separate boolean `isOpen`.
- `deliveryRadiusKm` is bounded 0.5–20 (`SHOP_RADIUS_MIN_KM` / `SHOP_RADIUS_MAX_KM`).
- `minOrder` is an integer ≥ 0, `@Max(SHOP_MIN_ORDER_MAX)` = 2 147 483 647.
- **COD and online payment are not in the DTO at all.** `codEnabled` and `onlinePaymentEnabled` are
  real columns that no request body in any scope accepts — which payment methods a shop may offer
  travels with approval.
- Lifecycle is part of authorization: `apps/api/src/rbac/shop-status.policy.ts` allows
  `settings.manage` on ACTIVE, PENDING and REJECTED and refuses it on SUSPENDED, with the reason
  `'This shop is suspended, so it is read-only. Contact GoPasal support to have it reviewed.'`

## 2. The actual `UpdateShopDto` fields

Fifteen, all optional, from `apps/api/src/modules/catalog/dto/catalog.dto.ts`:

| Field | Type | Server bound |
| --- | --- | --- |
| `name` | string | 2–120 |
| `nameNp` | string | ≤ 120 |
| `description` | string | ≤ 1000 |
| `categoryId` | string | ≤ 60 |
| `phone` | string | ≤ 20 |
| `area` | string | ≤ 160 |
| `fullAddress` | string | ≤ 300 |
| `lat` | number | `@IsNumber()` + `@IsLatitude()` |
| `lng` | number | `@IsNumber()` + `@IsLongitude()` |
| `deliveryRadiusKm` | number | 0.5–20 |
| `emoji` | string | ≤ 16 |
| `hours` | string | ≤ 120 |
| `isOpen` | boolean | — |
| `minOrder` | integer | 0 – 2 147 483 647 |
| `soloMode` | boolean | — |

Everything else on a `Shop` row is response-only. Because the pipe runs `forbidNonWhitelisted`,
sending one is a 400 naming the field, not a silently ignored key.

## 3. The actual permission and authorization

`@RequirePermissions('settings.manage')`, resolved in **SHOP scope** from the `:shopId` path parameter.
Verified against `PermissionsGuard` / `RbacService`, not inferred from the frontend catalogue:

- `settings.view` renders the screen; `settings.manage` is what makes any field editable. The split is
  real on both sides.
- The grant is **per shop**. Holding `settings.manage` on shop A gives nothing on shop B.
- A shop the caller is not a member of is refused, as is a resolved shop id of `undefined` — and so is
  the literal string `'all'`, which is a shop id the caller holds no grant for, not a wildcard.
- `isPrivileged` (Owner) short-circuits the per-key check **but not the lifecycle check** — a suspended
  shop is read-only even to its owner.
- `/auth/me` reports **effective** permissions: `RbacService.describe` filters each shop's keys through
  `shopStatusAllows`, so a SUSPENDED shop already reports `settings.view` and **not** `settings.manage`.
  The browser therefore renders a suspended shop read-only without knowing any lifecycle rules.

The browser check is `canInShop(shop.id, "settings.manage")` — the shop-scoped form. There is no
ambient `can(...)`, no `|| canAnywhere(...)`, and no owner bypass anywhere in the path.

## 4. Fields made editable (14)

All gated on `canInShop(shop.id, "settings.manage")`.

Name, Nepali name, emoji, description, phone, area, full address, opening hours (free text),
"Taking orders" (`isOpen`), delivery radius, minimum order, solo mode, latitude, longitude.

Plus `categoryId`, offered as **change-only**: the `<select>` shows "No category" *only* while the shop
has none, and adds a "Current category" option when the stored id is absent from the fetched list. If
`fetchCategories` fails the field degrades to read-only rather than to an empty picker.

Mechanics: the form holds a `Draft` (numbers as text, `null` as `""`), and `review(shop, draft)`
returns both the `ShopUpdateBody` **diff** and per-field `problems`. Only changed keys are sent.
Cleared text fields are sent as `""`; a cleared coordinate is refused with "A pin can be corrected but
not removed." rather than sent as zero.

## 5. Fields intentionally left read-only

**The API cannot support them (category B):**

- `codEnabled`, `onlinePaymentEnabled` — real columns, in no request body in any scope. Rendered as
  state chips with the hint "Set with your approval", not as switches that would 400.
- Shop logo and cover — no route in any scope accepts shop artwork, so there is no picker. `logoImage`
  and `coverImage` stay typed on `SellerShopWire` (the API really does return them) and are deliberately
  absent from `SellerShop`, so no screen can grow a picker for them.
- Payouts, statements, settlement — no finance module in seller scope. Stated as not part of GoPasal
  yet; nothing was invented.

**Read-only by nature (category C):** status and its label, `verified`, `restricted` /
`restrictionReason`, `statusReason`, the caller's role name, `slug`, `ownerId`, ratings, product and
order counts, `createdAt` / `approvedAt`.

Each read-only field carries its **reason** in the field hint. `FieldShell` renders a `<label>` when the
field is editable and a plain `<div>` when it is not, because a label pointing at nothing is a lie to a
screen reader.

## 6. API client changes

`apps/web-seller/lib/api/shops.ts` gained three exports and no behaviour anywhere else:

- **`ShopUpdateBody`** — the fifteen `UpdateShopDto` fields and nothing else. Deliberately *not*
  `Partial<SellerShopWire>`: it is smaller (no `status`, `verified`, `slug`, `ownerId`, `statusReason`,
  ratings, `codEnabled`, `onlinePaymentEnabled`, `logoImage`, `coverImage`, timestamps, `myRole`,
  `_count`), `null` is not a member of any field, and numbers/booleans must be real ones. The docblock
  records the server bounds as documentation and says the API is the one that enforces them.
- **`ShopRowWire`** = `Omit<SellerShopWire, "myRole" | "_count">` — the bare `Shop` the PATCH answers
  with, typed so it cannot be mistaken for a list row.
- **`updateShop(shopId, body, signal?)`** — `authedRequest` with `method: "PATCH"` to
  `/seller/shops/${encodeURIComponent(shopId)}`.

`lib/shop-view.ts` gained `emoji` on `SellerShop` (it is a real `UpdateShopDto` field, so it belongs in
the model the screens read) and comments marking `codEnabled` / `onlinePaymentEnabled` read-only. Its
header explains why `logoImage` / `coverImage` remain excluded.

## 7. UI changes

`apps/web-seller/app/(app)/settings/page.tsx` was rewritten from a read-only record into a real form.

- `SettingsPage` → `PermissionGate perm="settings.view"` → `SettingsInner`.
- The shop `<select>` lists only shops where `canInShop(id, "settings.view")`.
- `editable = canInShop(shop.id, "settings.manage")`. When false, one `InlineNotice` explains why —
  `shop.restrictionReason` verbatim when the shop is restricted, otherwise that editing needs the
  `settings.manage` permission and an owner can grant it from Team.
- The save: `if (saving) return` → `await updateShop(...)` → `await reload()` → **then**
  `setSaved(row.name)` and `setRevision(r => r + 1)`. The form is keyed on `${shop.id}:${revision}`, so
  bumping the revision remounts it and re-seeds the draft from the refetched row. On failure the
  revision is untouched, so every unsaved value stays on screen next to the API's own message.
- Failure copy is `ApiError.message` verbatim, with a connection-level fallback for non-`ApiError`
  throws. Validation errors are shown, not swallowed.
- Duplicate submission is blocked twice: the `saving` guard and a disabled submit button.
- Four cards — Shop profile, Opening hours, Delivery & coverage, Payments — and a sticky save bar
  rendered **only when editable**, whose one status line is, in priority order: the error, else
  "Saved. GoPasal now has these details for {name the server returned}.", else "One field can't be
  saved as it is — see the note under it.", else "Nothing changed yet.", else "N change(s) ready to
  save." Discard restores the draft from the live shop.
- Editable versus read-only is carried by the control itself (input/switch versus value/chip) plus the
  hint that states the reason, rather than by extra prose.
- There is no map picker for the coordinates. The comment in place records that this is because the
  console has no map component — **not** because the API refuses coordinates, which it accepts.
- The existing no-fixed-delivery-time notice on Delivery & coverage is unchanged.

## 8. Tests added or changed

All `node:test` — no new test framework was introduced, in either app.

**New: `apps/api/src/modules/catalog/shop-settings.spec.ts`** — three suites:

1. *Who the guard lets through*: holder of `settings.manage` allowed; `settings.view`-only refused;
   the grant held in a different shop refused; a non-member shop refused; `undefined` **and `'all'`**
   as the resolved shop id refused; an owner allowed without the key listed; an owner of shop A refused
   on shop B.
2. *What the lifecycle allows*: PENDING allowed, REJECTED allowed, SUSPENDED refused **with the exact
   reason sentence** while `settings.view` still passes, SUSPENDED refused even to the owner, and
   `RbacService.describe` proving a suspended shop reports `restricted: true` and does not report
   `settings.manage` as effective.
3. *`ShopsService.update` as a real partial write*: sends exactly the keys given; writes a cleared text
   field as `""`; returns a bare `Shop` (no `myRole`, no `_count`); 404s an unknown id **without
   writing**; accepts `{}` as a no-op.

**Extended: `apps/api/src/common/dto/request-validation.spec.ts`** — a final suite pinning the shop
settings PATCH contract: `null` rejected on every field, non-whitelisted keys rejected by name, string
numbers and string booleans rejected, the bounds at their edges, and an empty body accepted (asserting
on the *defined* entries, because `plainToInstance` builds a full instance with all fifteen keys present
and `undefined`).

**Extended: `apps/api/src/common/filters/all-exceptions.filter.spec.ts`** — a `PrismaClientValidationError`
becomes a 400 with a generic message and no Prisma internals on the wire.

No frontend test framework exists in `apps/web-seller`, and none was added. The frontend was checked by
`tsc`, ESLint and a production compile.

## 9. Security and scope checks

Traced the whole path: browser control → `canInShop` → `updateShop` → `authedRequest` (bearer token,
refresh-on-401) → route → `JwtAuthGuard` → shop resolution from `:shopId` → `PermissionsGuard`
(`settings.manage`, default-deny) → `RequestValidationPipe`
(`whitelist + forbidNonWhitelisted + transform`, no implicit conversion) → `ShopsService.update` →
`prisma.shop.update`.

Searches run across `apps/web-seller` (excluding `node_modules`):

| Looking for | Result |
| --- | --- |
| `\|\| canAnywhere` / `?? canAnywhere` fallback | none |
| ambient `can(` in `settings/page.tsx` | none — only `canInShop` |
| `isPrivileged` / `ownerId` used to authorize | none; every hit is a display badge, a docblock, or the rule that *system* roles are uneditable |
| `ALL_SHOPS` / `"all"` reaching a request | none — it exists only in `shop-provider.tsx` as a localStorage token, plus two docblocks warning it must never be sent |
| hardcoded shop ids | none |
| fixture / mock / dummy modules | none; `lib/data.ts` does not exist and every "fixture" hit is a comment recording a past removal |
| `localStorage` / `sessionStorage` holding shop fields | none — only the selected shop id, language, splash-seen and the session token |
| callers of `updateShop` | exactly one: `settings/page.tsx` |

Client-side authorization is presentation only: the guard is the enforcement point, and the console
merely avoids offering what the guard would refuse. No unrelated authorization issue was touched.

## 10. Backend defects discovered and fixed

Four, each with a regression test. Each was a real defect, not a shape change made to suit the UI.

1. **`@IsOptional()` is a null hole.** It skips *every* validator when the value is `null`, so
   `null` reached Prisma on fields typed non-null. Replaced with `@OptionalField()`
   (`ValidateIf((_object, value) => value !== undefined)`), which validates a present `null` and skips
   only a genuinely absent key. This distinction applies to every DTO in the codebase.
2. **`@IsLatitude()` / `@IsLongitude()` accept strings.** `"27.7"` passed. Added `@IsNumber()`
   alongside, so a coordinate must arrive as a real number.
3. **`UpdateShopDto` was looser than the onboarding DTO that created the same columns** — an unbounded
   `name`, `description`, `phone`, `hours` and radius meant a shop could be edited into a state
   onboarding would have refused. Adopted the onboarding bounds verbatim.
4. **`AllExceptionsFilter` turned a `Prisma.PrismaClientValidationError` into a 500 carrying Prisma's
   raw report** — an internal schema description on the wire, and the wrong status for a caller
   mistake. Now 400 `'Database request error.'` with `error: 'BadRequest'`, the detail logged
   server-side only.

## 11. Still unavailable after this phase

Nothing here was worked around, faked or half-built:

- **Clearing a category or a map pin.** `categoryId`, `lat`, `lng` are change-only, because the DTO
  cannot express null. The UI says so where the field is.
- **Shop logo / cover upload.** No route in any scope accepts shop artwork.
- **The payment flags** `codEnabled` / `onlinePaymentEnabled` — read-only, set with approval.
- **Payouts, statements, settlement, refunds, ledger.** No finance module in seller scope.
- **A structured opening-hours schedule.** `hours` is one free-text column; a per-day editor would be
  inventing a model the database does not have.
- **A map picker for the coordinates.** A console gap, not an API gap — the fields are typed as
  `lat` / `lng` numbers, exactly what the DTO accepts.
- **The four authored index migrations** — `20260826161105_seller_query_indexes`,
  `20260826182000_review_shop_created_index`, `20260826204500_coupon_shop_created_index`,
  `20260827093000_notification_user_created_index` — cannot be applied here. Their effect is
  **unverified** and must never be described otherwise.

## 12. Verification commands and results

Every command below was actually run in this sandbox; the exit code quoted is the one it returned.

**API** (`apps/api`):

| Command | Result |
| --- | --- |
| `node --require ts-node/register/transpile-only --test $(find src -name '*.spec.ts' \| sort)` | **628/628 pass, exit 0** |
| `./node_modules/.bin/tsc --noEmit -p tsconfig.json` | **exit 0** |
| `./node_modules/.bin/eslint "src/**/*.ts" "prisma/*.ts" --max-warnings 0` | **exit 0** |
| `./node_modules/.bin/nest build` | **exit 0** |

**Seller console** (`apps/web-seller`):

| Command | Result |
| --- | --- |
| `./node_modules/.bin/tsc --noEmit` | **exit 0** |
| `./node_modules/.bin/next lint --max-warnings=0` | **exit 0** — "✔ No ESLint warnings or errors" |
| `./node_modules/.bin/next build` | **exit 0** — "✓ Compiled successfully", 21 routes, `/settings` 6.58 kB / 131 kB First Load JS |

`next build` needed the documented `next/font` workaround, because the sandbox has no network and
`next/font/google` fetches at build time. Applied and reverted inside a **single** bash call, then
re-checked: `app/layout.tsx` sha256 is `1cf3f4d7ddf9ae228d672e89b12b874f66cca4afebd655fca36f79dda37b276e`,
identical to the pre-build baseline; `grep -c "next/font" app/layout.tsx` is back to `1`; `.next` was
removed. **The stubbed layout is not in the repository.**

**This build is not a networked production build**, and no runtime request was made to the API. The
seller app's `tsc` also type-checks `packages/api-client` source, since workspace packages are
source-only and listed in `transpilePackages`.

## 13. Files changed

**Backend** (`apps/api/src`):

1. `modules/catalog/dto/catalog.dto.ts` — `UpdateShopDto` hardened (defects 1–3), bound constants
   exported.
2. `common/dto/optional-field.decorator.ts` — the `@OptionalField()` decorator.
3. `common/filters/all-exceptions.filter.ts` — `PrismaClientValidationError` → 400 (defect 4).
4. `modules/catalog/shop-settings.spec.ts` — **new**, three suites.
5. `common/dto/request-validation.spec.ts` — new final suite for the shop PATCH contract.
6. `common/filters/all-exceptions.filter.spec.ts` — new final suite for the Prisma-validation branch.

**Frontend** (`apps/web-seller`):

7. `lib/api/shops.ts` — `ShopUpdateBody`, `ShopRowWire`, `updateShop`.
8. `lib/shop-view.ts` — `emoji` added; payment flags marked read-only; header rationale.
9. `app/(app)/settings/page.tsx` — rewritten as the real form.

**Documentation:**

10. `SELLER_CAPABILITY_CLASSIFICATION.md` — added the PATCH row to the Shops REAL table; narrowed the
    READ-ONLY "Shop record" entry to the columns no request body accepts; replaced the UNAVAILABLE
    "Editing shop details" entry with "Clearing a shop's category or map pin"; REAL route count
    70 → **71**.
11. `TASK_10_PHASE_5_REPORT.md` — two "superseded by Phase 6" notes appended to the entries that said
    the settings screen is read-only. The Phase 5 narrative itself was left intact, because rewriting a
    historical report to match today would be the dishonest option.
12. `TASK_10_PHASE_6_REPORT.md` — this file.

The repository is **not a git repository**, so there is no `git diff` to inspect. The change set above
was instead established from modification times: every file altered in the Phase 6 window appears in
the list, and the only other recently-touched files are `app/layout.tsx` (stub applied and reverted,
sha256 re-confirmed), `tsconfig.tsbuildinfo` (a `tsc` artifact, gitignored) and
`components/shell/Topbar.tsx` (edited **before** Phase 6 began, as part of Phase 5).

## 14. No unrelated task was started

Phase 6 only. Not started, not touched: Phase 7 (frontend dead-code sweep), Phase 8 (full
verification), finance, payouts, settlement, refunds, ledger, sponsored listings, catalog import,
delivery ETA, POD uploads, notification pagination, review pagination. No fixtures were reintroduced,
no fake local-only save path exists, no optimistic success is shown before the server resolves, no
owner bypass was added, and no unsupported setting is presented as editable.
