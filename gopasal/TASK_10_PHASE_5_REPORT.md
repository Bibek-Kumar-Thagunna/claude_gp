# Task 10 Phase 5 — Final Report

**Task:** Dead Capability Cleanup + Honesty Pass  
**Date:** 2026-09-01  
**Scope:** `apps/web-seller` production hardening — no new features, no backend expansion, no fixtures

**Corrections applied to this report before issuing it.** A first draft of the Phase 5 paperwork stated
endpoint paths from memory rather than from the decorators, and got several wrong: auth is `/auth/...`
not `/seller/auth/...`; notifications are `/notifications/...` not `/seller/notifications/...`;
COD-collected and the handover note are fields of `PATCH …/orders/:orderId/delivery`, not `/collect-cod`
and `PATCH …/orders/:id`; a review reply is `POST …/reviews/:reviewId/reply`, not a `PATCH`; a member is
suspended via `PATCH …/staff/:membershipId/status`, not `PATCH …/staff/:id {isActive}`; analytics takes
`?period=`, not `?window=`; and staff search is a browser-side filter, not a server `?q=`. The whole
route inventory was then re-derived from `@Controller` / HTTP-verb / `@RequirePermissions` decorators in
`apps/api/src` and matched against the actual requests in `apps/web-seller/lib/api/*.ts` and
`packages/api-client/src`. §6 item 10 records the one substantive factual error that reached this
document. Verification (§10–§14) was re-run after the corrections; the results below are from that run.

---

## 1. Files Changed

### Modified (6 files)

1. **`apps/web-seller/components/shell/Topbar.tsx`**  
   Removed the global search box (uncontrolled `<input type="search">` with no consumer, placeholder promising cross-entity search GoPasal has no endpoint for). Real search is per-screen, server-side `?q=`. Also removed the now-unused `Search` lucide import to satisfy lint.

2. **`apps/web-seller/components/catalog/VariantEditor.tsx`**  
   Corrected stale comment claiming `PATCH …/variants/:variantId` is unvalidated. It now takes `UpdateVariantDto` (a class), so `ValidationPipe` applies `whitelist`, `forbidNonWhitelisted`, and every `@IsInt`/`@Min(0)`.

3. **`apps/web-seller/components/onboarding/ApplicationForm.tsx`**  
   Updated `lat` and `lng` field hints to state they can be corrected but not emptied (because `UpdateApplicationDto` has no way to express null for a number, so `diffFields` skips cleared numbers rather than guessing zero).

4. **`apps/web-seller/app/(app)/settings/page.tsx`**  
   Fully rewritten from a fake-editable form (live `<input>`s + `Switch`es over `useState` with a disabled Save + small print) into a read-only record with `canInShop`-filtered shop selection and one `InlineNotice` stating that these details cannot be changed here yet. `PATCH /seller/shops/:shopId` does exist under `settings.manage`; it is simply not wired. Also dropped the ambient `can("settings.manage")` guard (the shop list is already filtered by `canInShop(id, "settings.view")`).

   **Superseded by Phase 6 (2026-09-01).** The screen is no longer read-only: Phase 6 wired `PATCH /seller/shops/:shopId` for real, so fourteen of `UpdateShopDto`'s fifteen fields are editable behind `canInShop(shopId, "settings.manage")`. What Phase 5 removed was the *fake* save, and that removal still stands — the form that replaced it submits a diff and awaits the server. The read-only fields Phase 5 identified (payment flags, artwork, status, role) are still read-only, because no request body in any seller scope accepts them.

5. **`apps/web-seller/components/OfflineWatcher.tsx`**  
   Rewrote the banner copy from "We'll reconnect automatically. New orders will sync the moment you're back." to "GoPasal can't be reached right now. Anything you save won't go through until you're back — reconnect and try again." Grep proved there is no service worker, no IndexedDB, no mutation queue — `navigator.onLine` is the whole mechanism, so the console cannot promise background sync.

6. **`apps/web-seller/app/offline/page.tsx`**  
   Added header comment documenting that nothing is queued while offline and that nothing routes here automatically (no service worker = no navigation fallback). Rewrote body copy from "your work is safe and new orders will sync as soon as you reconnect" to "GoPasal can't be reached from this device right now. Nothing you were part-way through has been sent, so check your connection and try that step again once you're back online." Button label changed from "Retry" to "Try again" for clarity.

### Also Modified Earlier (4 files, verified this session)

7. **`apps/web-seller/lib/api/shops.ts`**  
   Wire type documented as response-only; `coverImage`/`logoImage` marked read-only in JSDoc (no upload route in any scope).

8. **`apps/web-seller/lib/shop-view.ts`**  
   `emoji`, `logoImage`, `coverImage` removed from the view model so no screen can grow a picker for a capability that has no endpoint.

9. **`apps/web-seller/lib/rbac.ts`**  
   Inventory group description corrected to "Stock on hand for tracked products."; `inventory.adjust` hint corrected to "Add to or subtract from the stock of a tracked product." (not "manage low-stock thresholds").

10. **`apps/web-seller/components/auth-provider.tsx`**  
    Stale fixture comment corrected (shop identity no longer lives in this provider).

---

## 2. Files Deleted

None. Phase 5 rules forbade creating files and did not require deleting any.

---

## 3. Dead Capabilities Removed

1. **Global search box** (`components/shell/Topbar.tsx`) — uncontrolled input with no `value`, no `onChange`, no form, no consumer. Every keystroke discarded. Placeholder promised cross-entity search; GoPasal has no such endpoint. Real search is per-screen, server-side `?q=`.

2. **Fake-editable shop settings** (`app/(app)/settings/page.tsx`) — live inputs over `useState` with a disabled Save button and small print admitting changes "stay in this browser". `PATCH /seller/shops/:shopId` exists but is not wired. The screen is now a read-only record stating the gap at the top.

---

## 4. Capabilities Converted to Explicit Unavailable States

1. **Catalog import** (`app/(app)/catalog/import/page.tsx`) — already an honest unavailable screen as of sub-task 5.2. Page states: "Your account has permission to import products, but GoPasal doesn't have a bulk import service running yet." No file input, no template, no preview, no success state. Offers navigation back to Catalog and to Add Product.

2. **Shop settings editing** (`app/(app)/settings/page.tsx`) — now a read-only record with an `InlineNotice` stating: "These details can't be changed here yet." **No longer unavailable as of Phase 6 (2026-09-01):** the endpoint was wired, so this entry describes Phase 5's state only. What remains unavailable on that screen is narrower — clearing a category or a map pin, shop logo/cover upload, and the payment flags.

---

## 5. Unsupported Copy Corrected

1. **Offline banner** (`components/OfflineWatcher.tsx`) — changed from "New orders will sync the moment you're back" (implying background sync + IndexedDB queue that do not exist) to "Anything you save won't go through until you're back — reconnect and try again."

2. **Offline fallback page** (`app/offline/page.tsx`) — changed from "your work is safe and new orders will sync as soon as you reconnect" to "Nothing you were part-way through has been sent, so check your connection and try that step again once you're back online."

3. **Onboarding lat/lng hints** (`components/onboarding/ApplicationForm.tsx`) — now state "Can be corrected later but not emptied" (because `UpdateApplicationDto` cannot express null for a number).

4. **Variant editor comment** (`components/catalog/VariantEditor.tsx`) — corrected to document that `PATCH …/variants/:variantId` is validated (takes `UpdateVariantDto`, a class, not `Partial<VariantDto>`, a mapped type).

5. **RBAC inventory wording** (`lib/rbac.ts`) — `inventory.adjust` hint changed from "manage low-stock thresholds" to "add to or subtract from the stock of a tracked product" (no threshold exists).

6. **Topbar removal comment overstated where server search exists** (`components/shell/Topbar.tsx`). The comment that documents the removed global search box listed `/staff` among the screens with "a server-side `?q=`". That is false: `rbac/staff.controller.ts`'s list handler takes no query DTO, and `app/(app)/staff/page.tsx:230-231` filters the full list in the browser with `matchesMember` / `matchesInvite`. Verified by checking all six screens — orders, catalog, inventory, promotions and reviews each send `q: debouncedQ || undefined`; staff does not. The comment now names /staff as the one exception and says why, so the file that explains the honesty rule no longer breaks it.

---

## 6. Backend Gaps Discovered But Deliberately NOT Implemented

Per 5.8, the following gaps were documented and left unfixed:

1. **Shop settings PATCH wiring** — `PATCH /seller/shops/:shopId` exists, takes `settings.manage`, accepts the full DTO, but is not called from `app/(app)/settings/page.tsx`.

2. **Shop logo/cover upload** — `Shop.logoImage` and `coverImage` are returned by `GET /seller/shops` and appear in no DTO anywhere. No route in any scope accepts a shop artwork upload.

3. **Catalog import** — `catalog.import` is a real permission with no endpoint behind it.

4. **Low-stock threshold** — `Product` has no `lowStockThreshold` column. Inventory state is only `untracked | out | in`.

5. **POD image upload** — no route in any scope for proof-of-delivery photos.

6. **Delivery ETA** — no field, no route.

7. **Rider shift model** — no schema support.

8. **Settlement / payouts / refunds / finance ledger** — no finance module in seller scope. `PaymentStatus.REFUNDED` is read-only; seller cannot initiate. No net-earnings figure, no escrow view, no settlement request.

9. **Notification pagination** — `GET /notifications` (user-scoped; **not** under `/seller`, and it carries no permission key by design) accepts only `?unread=`. `NotificationsService.listMine` is a single `findMany` with `take: 100` and no cursor, so the hundred-and-first notification is unreachable from any client.

10. **~~Review pagination~~ — not a gap.** An earlier draft of this report listed reviews and order search as unpaginated. That was wrong, and re-reading the DTOs disproved it: `ListShopReviewsQueryDto` and `ListShopOrdersQueryDto` both declare `page = 1` and `limit = 20` with `@Min(1)`/`@Max(100)`, so `GET …/reviews` and `GET …/orders?q=` are genuinely paged. Notifications (item 9) is the only unpaginated seller-facing list.

11. **Editing a delivery-zone boundary the console cannot read back** — the real gap that belongs in this slot. `PATCH …/zones/:zoneId` replaces the whole polygon rather than merging, so `toDeliveryZone` marks a zone `editable` only when `points.length >= 3 && points.length === stored` (`lib/delivery-view.ts:298-300`). When a stored polygon is partly unreadable the Edit button is withheld and the row says so — "This boundary was saved in a form this screen can't read back, so it can't be edited here without redrawing it." There is also no map or drawing surface anywhere; boundaries are typed as `lat, lng` lines, which is the exact shape `UpsertZoneDto` accepts.

12. **Analytics indexes** — four authored migrations (`20260826161105_seller_query_indexes`, `20260826182000_review_shop_created_index`, `20260826204500_coupon_shop_created_index`, `20260827093000_notification_user_created_index`) cannot be applied in the sandbox and must never be described as verified.

13. **Sponsored listings** — `model SponsoredListing` exists in Prisma; no controller or service reads or writes it.

---

## 7. Remaining Seller-Console Fixtures

**Zero.** `lib/data.ts` confirmed absent via `ls`. The six fixture constants (`SHOPS`, `STAFF`, `ORDERS`, `PRODUCTS`, `SALES_7D`, `TOP_PRODUCTS`) that existed at the start of Task 10 are gone. Every screen reads the real API.

Grep for bare-word fixture identifiers (`\b(SHOPS|STAFF|ORDERS|PRODUCTS)\b`) returned 4 hits, all comments documenting their removal:
- `components/shell/Sidebar.tsx:44` — "Orders no longer carries a count pill. It used to, derived from the `ORDERS` fixture…"
- `components/providers.tsx:45` — "Shop identity used to live here as `SHOPS`/`scope`/`activeShop`. It now lives in `ShopProvider`…"
- `components/providers.tsx:48` — "The editable role catalogue and the `STAFF` fixture used to live here too…"
- `app/(app)/delivery/page.tsx:73` — "The fixture version of this page picked a courier out of a `STAFF` array…"

---

## 8. Remaining Hardcoded Numbers

All surviving hardcoded numbers are legitimate and justified:

1. **`lib/api/products.ts:421`** — `PRODUCT_IMAGE_LIMIT = 8`, mirroring `apps/api/src/modules/catalog/product-images.ts:40`.
2. **`lib/api/products.ts:441`** — `MAX_IMAGE_BYTES = 5 * 1024 * 1024`, matching the backend's multipart validator.
3. **`components/onboarding/OtpInput.tsx`** — `Array(6)` for the 6-digit OTP length the backend expects.
4. **`app/login/page.tsx:106`** — `setTimeout(..., 300)` to focus the first OTP digit after render (legitimate UX).
5. **`app/(app)/staff/page.tsx:902`** — `setTimeout(..., 1200)` to reset "Copied" chip text (legitimate UX).
6. **`app/(app)/promotions/page.tsx:184`** — `setInterval` fallback for coupon countdown clock when `now` is unavailable (legitimate UX).
7. **`components/Splash.tsx:21`** — `setTimeout(..., 800)` for splash-screen exit animation (legitimate UX).
8. **`components/onboarding/DocumentsPanel.tsx:109`** — `setTimeout(..., 0)` to revoke object URL after download starts (legitimate cleanup).
9. **`lib/use-debounced.ts:21`** — `setTimeout` for the debounce hook (legitimate utility).

Search hits for `Math.random` / `Date.now()` / `new Promise` / `setTimeout` are all accounted for above. No hardcoded fake IDs, fake counts, fake sales numbers, or fake percentages remain.

---

## 9. Remaining Dead Permissions

**Zero dead permissions in the seller console.** Every permission string in `lib/rbac.ts` corresponds to a real backend permission enforced by `@RequirePermissions()` in `apps/api/src`. The `RETIRED_PERMISSIONS` table in `components/auth-provider.tsx` documents permissions that once existed in the codebase and are now removed; it is not a list of permissions the console still uses.

Grep for colon-style permission strings outside `RETIRED_PERMISSIONS` returned zero hits. Grep for `canAnywhere` confirmed it appears only in `providers.tsx:90`'s ternary (choosing `canAnywhere` when `activeShopId === null`) and `auth-provider.tsx`'s definition/plumbing — no `|| canAnywhere(...)` fallback exists.

---

## 10. tsc Result

```
=== tsc ===
tsc exit=0
```

**Verdict:** PASS. Zero type errors in `apps/web-seller`.

---

## 11. lint Result

```
=== lint ===
✔ No ESLint warnings or errors
lint exit=0
```

**Verdict:** PASS. Zero warnings, zero errors at `--max-warnings=0`.

---

## 12. build Result

```
=== 3. build ===
  ▲ Next.js 15.0.0

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/21) ...
   Generating static pages (5/21) 
   Generating static pages (10/21) 
   Generating static pages (15/21) 
 ✓ Generating static pages (21/21)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                              Size     First Load JS
┌ ○ /                                    2.42 kB         121 kB
├ ○ /_not-found                          895 B           100 kB
├ ○ /analytics                           3.62 kB         166 kB
├ ○ /catalog                             16.6 kB         179 kB
├ ○ /catalog/import                      5.03 kB         161 kB
├ ○ /catalog/new                         7.36 kB         166 kB
├ ○ /dashboard                           3.93 kB         167 kB
├ ○ /delivery                            10.5 kB         174 kB
├ ○ /inventory                           5.3 kB          168 kB
├ ○ /login                               6.04 kB         162 kB
├ ○ /manifest.webmanifest                0 B                0 B
├ ○ /offline                             174 B           108 kB
├ ○ /onboarding                          15.8 kB         135 kB
├ ○ /orders                              5.1 kB          168 kB
├ ƒ /orders/[id]                         6.66 kB         133 kB
├ ○ /promotions                          11.9 kB         171 kB
├ ○ /reviews                             6.76 kB         166 kB
├ ○ /roles                               5.3 kB          171 kB
├ ○ /settings                            4.01 kB         127 kB
└ ○ /staff                               7.43 kB         173 kB
+ First Load JS shared by all            99.2 kB
  ├ chunks/44d9fad6-564c46ee0213d93c.js  52.6 kB
  ├ chunks/713-a6adf42a826fbc26.js       44.7 kB
  └ other shared chunks (total)          1.91 kB


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

build exit=0
```

**Verdict:** PASS. 21 routes built successfully. Zero errors, zero warnings.

---

## 13. app/layout.tsx Restoration

- **Original checksum:** `1cf3f4d7ddf9ae228d672e89b12b874f66cca4afebd655fca36f79dda37b276e`
- **Checksum after restore:** `1cf3f4d7ddf9ae228d672e89b12b874f66cca4afebd655fca36f79dda37b276e`
- **`next/font/google` import present after restore:** yes (grep returned 1 hit)

**Verdict:** MATCH. `app/layout.tsx` restored byte-for-byte. Font stub was not left in the source tree.

---

## 14. .next Removal

```
=== 6. remove .next ===
removed
.next absent
```

**Verdict:** DONE. Build artifact directory removed; `ls -d .next` confirmed absent.

---

## 15. Verification Commands Not Run

All required verification commands were executed successfully:
- `./node_modules/.bin/tsc --noEmit` — ran, exit 0
- `./node_modules/.bin/next lint --max-warnings=0` — ran, exit 0
- `./node_modules/.bin/next build` — ran, exit 0, 21 routes
- Font-stub sequence (backup → apply → build → restore → checksum → rm .next) — completed successfully
- Phase 5.11 searches (all 15 required patterns) — executed and interpreted

**No verification was skipped.**

The whole sequence was executed twice: once after the source edits, and again on 2026-09-01 after the
documentation corrections above, so that no result quoted here predates the current tree. Both runs
agreed — `tsc` exit 0, lint clean, build exit 0 across 21 routes, `app/layout.tsx` sha256 back to
`1cf3f4d7ddf9ae228d672e89b12b874f66cca4afebd655fca36f79dda37b276e`, `.next` absent.

Two things that **could not** be verified here, and are not claimed anywhere as verified: the four
authored index migrations cannot be applied in this sandbox (no `docker`, no `psql`), and no route in
§6 or in `SELLER_CAPABILITY_CLASSIFICATION.md` was exercised against a running API — the evidence is the
decorators, the DTOs, the request code, and the three build tools.

---

## Summary

Phase 5 is **complete and verified**. Every sub-item (5.1 through 5.12) delivered:

- ✅ **5.1** — Shop image typing corrected (read-only wire type, no fake URL field, removed from view model).
- ✅ **5.2** — Catalog import is an honest unavailable screen (verified by reading the full file).
- ✅ **5.3** — No low-stock threshold capability remains (19 grep hits, all absence-documenting prose).
- ✅ **5.4** — Dead capability audit complete (global search removed; fake settings form rewritten; every button verified against a real route; no fake success states; no fake loading; no fixture fallbacks; no permission mismatches).
- ✅ **5.5** — Finance honesty confirmed (no payout/settlement/refund/ledger UI; `REFUNDED` is read-only).
- ✅ **5.6** — Product image implementation regression-checked (multipart-only, no URL input, allowlist not wildcard).
- ✅ **5.7** — Architecture preserved (no `lib/data.ts`, no fixture constants, no second permission system, no `|| canAnywhere` fallback, `canInShop` preserved).
- ✅ **5.8** — Backend gaps documented, not implemented (12 real gaps enumerated in §6; item 10 is not a gap and records the wrong earlier claim it replaced).
- ✅ **5.9** — **Honesty rule classification delivered** (all seller-facing capabilities classified as REAL / READ-ONLY / DERIVED / UNAVAILABLE in `SELLER_CAPABILITY_CLASSIFICATION.md`).
- ✅ **5.10** — Verification executed (tsc/lint/build all green, font-stub sequence completed, layout restored byte-identical, .next removed).
- ✅ **5.11** — Final searches executed and interpreted (15 patterns, zero code hits for dead identifiers, surviving hits are comments/prose).
- ✅ **5.12** — Final report delivered (this document).

The seller console now obeys the governing rule: **every capability is exactly one of REAL (awaited API request that persists) / READ-ONLY (returned by API, not changeable here) / DERIVED (calculated from real API data) / UNAVAILABLE (intentionally shown unavailable)**. There is no fifth category. No control implies a capability the backend does not support. No fixture data. No fake success states. No dead permissions. No unsupported-capability copy.

---

**Task 10 Phase 5 — COMPLETE**
