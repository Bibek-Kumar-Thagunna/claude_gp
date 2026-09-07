# GoPasal Seller Console — Capability Classification

**Task 10 Phase 5, sub-item 5.9.** Written 2026-09-01.

**The rule:** every seller-facing capability is exactly one of **REAL** (an awaited API request that
persists server-side), **READ-ONLY** (the API returns it; nothing here changes it), **DERIVED**
(computed in the browser from real API data), or **UNAVAILABLE** (shown as explicitly not available).
There is no fifth category — nothing "looks real but is actually local".

**How this list was produced.** Every route below was read out of the actual decorators in
`apps/api/src` (`@Controller` prefix + `@Get/@Post/@Patch/@Put/@Delete` + `@RequirePermissions`) and
matched against the actual request in `apps/web-seller/lib/api/*.ts`. Paths are shown relative to the
API root `/api/v1` (`setGlobalPrefix('api')` + URI version `1`). Where an earlier draft of this
document guessed a path, the guess was replaced by the verified one — three of them were wrong
(auth and notifications are **not** under `/seller`, and COD/POD are **not** their own routes).

## REAL

An awaited request that changes stored state (or, for reads, genuinely fetches it). Permission keys
are the API's own `@RequirePermissions`; the browser checks the same key with
`canInShop(shopId, key)` before offering the control.

### Session — `auth.controller.ts`, prefix `auth`
| Capability | Route | Permission |
| --- | --- | --- |
| Request login OTP | `POST /auth/otp/request` | public |
| Verify OTP, receive token pair | `POST /auth/otp/verify` | public |
| Refresh access token | `POST /auth/refresh` | public (rotating refresh) |
| Load own identity + memberships | `GET /auth/me` | authenticated |
| Sign out (revoke refresh) | `POST /auth/logout` | authenticated |

### Onboarding — `onboarding.seller.controller.ts`, prefix `seller/onboarding/applications`
| Capability | Route |
| --- | --- |
| Start an application | `POST /seller/onboarding/applications` |
| List own applications | `GET /seller/onboarding/applications` |
| Load the current application | `GET /seller/onboarding/applications/current` |
| Save edited fields | `PATCH /seller/onboarding/applications/:id` |
| Submit for review | `POST /seller/onboarding/applications/:id/submit` |
| Withdraw | `POST /seller/onboarding/applications/:id/withdraw` |
| Upload a KYC document | `POST /seller/onboarding/applications/:id/documents` (multipart) |
| Open an uploaded document | `GET /seller/onboarding/applications/:id/documents/:docId/file` |
| Delete an uploaded document | `DELETE /seller/onboarding/applications/:id/documents/:docId` |

Ownership is the guard here, not a permission key: every handler takes `@CurrentUser('id')` and the
service scopes by it, because an applicant has no shop and therefore no shop-scoped grants yet.

### Shops — `catalog.seller.controller.ts`, prefix `seller`
| Capability | Route | Permission |
| --- | --- | --- |
| List my shops (identity, status, role) | `GET /seller/shops` | membership only, no key |
| Read one shop | `GET /seller/shops/:shopId` | `dashboard.view` |
| Save shop settings (14 of the 15 `UpdateShopDto` fields) | `PATCH /seller/shops/:shopId` | `settings.manage` |

### Orders — `orders.seller.controller.ts`, prefix `seller/shops/:shopId/orders`
| Capability | Route | Permission |
| --- | --- | --- |
| Order queue (paged, searchable) | `GET …/orders` | `orders.view` |
| Order detail | `GET …/orders/:orderId` | `orders.view` |
| Accept | `POST …/orders/:orderId/accept` | `orders.accept` |
| Reject (with reason) | `POST …/orders/:orderId/reject` | `orders.reject` |
| Mark packed | `POST …/orders/:orderId/pack` | `orders.pack` |
| Dispatch | `POST …/orders/:orderId/dispatch` | `orders.dispatch` |
| Cancel | `POST …/orders/:orderId/cancel` | `orders.cancel` |

### Delivery — `delivery.seller.controller.ts`, prefix `seller/shops/:shopId`
| Capability | Route | Permission |
| --- | --- | --- |
| List riders | `GET …/riders` | `delivery.view` |
| Register a rider | `POST …/riders` | `delivery.assign` |
| Remove a rider | `DELETE …/riders/:riderId` | `delivery.assign` |
| Assign a rider to an order | `POST …/orders/:orderId/assign` | `delivery.assign` |
| Unassign | `POST …/orders/:orderId/unassign` | `delivery.assign` |
| Advance delivery status, **and in the same body** record `codCollected`, a `podNote`, or a `failReason` | `PATCH …/orders/:orderId/delivery` | `delivery.update` |
| List zones | `GET …/zones` | `delivery.view` |
| Create / edit / delete a zone | `POST …/zones`, `PATCH …/zones/:zoneId`, `DELETE …/zones/:zoneId` | `settings.manage` |

**COD-collected and the handover note are fields of `DeliveryStatusDto`, not endpoints.** There is no
`/collect-cod` route and no `PATCH …/orders/:id` for a note; both travel with the status change, which
is why the console only offers them at the moment a delivery is finished. `codCollected` is a boolean
with no amount — the API derives the cash from the order.

### Catalog & inventory — `catalog.seller.controller.ts`, prefix `seller`
| Capability | Route | Permission |
| --- | --- | --- |
| Product list (paged, `q`, category, status, stock, sort) | `GET /seller/shops/:shopId/products` | `catalog.view` |
| Create a product | `POST …/products` | `catalog.create` |
| Edit a product (incl. hide/show via `isActive`, start tracking via `trackStock`) | `PATCH …/products/:productId` | `catalog.edit` |
| Delete a product | `DELETE …/products/:productId` | `catalog.delete` |
| Adjust stock by a signed delta | `POST …/products/:productId/stock` | `inventory.adjust` |
| Upload a product image | `POST …/products/:productId/images` (multipart) | `catalog.edit` |
| Delete a product image | `DELETE …/products/:productId/images` | `catalog.edit` |
| Reorder images (full permutation) | `PUT …/products/:productId/images/order` | `catalog.edit` |
| Add a variant | `POST …/products/:productId/variants` | `catalog.edit` |
| Edit a variant (sets stock, not a delta) | `PATCH …/variants/:variantId` | `catalog.edit` |
| Delete a variant | `DELETE …/variants/:variantId` | `catalog.edit` |

### Promotions — `coupons.seller.controller.ts`, prefix `seller/shops/:shopId/coupons`
| Capability | Route | Permission |
| --- | --- | --- |
| Coupon list (paged, `q`, status, sort) | `GET …/coupons` | `promotions.view` |
| Create a coupon | `POST …/coupons` | `promotions.manage` |
| Edit code / discount / validFrom / validTo | `PATCH …/coupons/:couponId` | `promotions.manage` |
| Deactivate (this is what DELETE means here) | `DELETE …/coupons/:couponId` | `promotions.manage` |

### Reviews — `reviews.seller.controller.ts`, prefix `seller/shops/:shopId/reviews`
| Capability | Route | Permission |
| --- | --- | --- |
| Review list (paged, `q`, answered, rating, sort) | `GET …/reviews` | `reviews.view` |
| Reply to a review (overwrites any earlier reply) | `POST …/reviews/:reviewId/reply` | `reviews.reply` |

### Notifications — `notifications.controller.ts`, prefix `notifications`
| Capability | Route |
| --- | --- |
| List own notifications (`?unread=`) | `GET /notifications` |
| Unread count | `GET /notifications/unread-count` |
| Mark one read | `PATCH /notifications/:id/read` |
| Mark all read | `PATCH /notifications/read-all` |

Notifications are **user-scoped, not shop-scoped**: the controller takes `@CurrentUser('id')` and no
`:shopId`, carries no permission key by design, and `Notification` has no shop column.

### Team — `rbac/staff.controller.ts` + `invites.shop.controller.ts`
| Capability | Route | Permission |
| --- | --- | --- |
| List members | `GET /seller/shops/:shopId/staff` | `team.view` |
| Change a member's role | `PATCH …/staff/:membershipId/role` | `team.invite` |
| Suspend / reactivate a member | `PATCH …/staff/:membershipId/status` | `team.invite` |
| Remove a member | `DELETE …/staff/:membershipId` | `team.invite` |
| List invites (`?status=`) | `GET …/invites` | `team.view` |
| Create an invite | `POST …/invites` | `team.invite` |
| Resend an invite | `POST …/invites/:inviteId/resend` | `team.invite` |
| Revoke an invite | `DELETE …/invites/:inviteId` | `team.invite` |

Membership changes are **`team.invite`, not `rbac.manage`** — one grant covers inviting and managing
people, a second (`rbac.manage`) covers the role definitions they are assigned to.

### Roles — `rbac/roles.controller.ts`, prefix `seller/shops/:shopId/roles`
| Capability | Route | Permission |
| --- | --- | --- |
| Permission catalogue | `GET …/roles/catalog` | `rbac.manage` |
| List roles | `GET …/roles` | `rbac.manage` |
| Create a role | `POST …/roles` | `rbac.manage` |
| Clone a role | `POST …/roles/:roleId/clone` | `rbac.manage` |
| Edit name / description / permissions | `PATCH …/roles/:roleId` | `rbac.manage` |
| Delete a role | `DELETE …/roles/:roleId` | `rbac.manage` |

### Analytics — `analytics.seller.controller.ts`, prefix `seller`
| Capability | Route | Permission |
| --- | --- | --- |
| One shop's overview (`?period=`) | `GET /seller/shops/:shopId/analytics/overview` | `analytics.view` |
| "All shops" consolidated overview (`?period=`) | `GET /seller/analytics/overview` | own memberships, no key |

### Server-side search and filtering
Real, and per screen — each searches only the collection that owns the data, because that is the only
thing its endpoint can query. Orders (`q`, status, sort), products (`q`, category, status, stock,
sort), coupons (`q`, status, sort) and reviews (`q`, answered, rating, sort) all send `page` + `limit`
too. There is deliberately no single box that searches across collections.

## READ-ONLY

Returned by a real endpoint and displayed, with no control anywhere in the console that changes it.
These are kept, not deleted: the brief's rule is that a read-only field is legitimate as long as
nothing pretends it is editable.

**Shop record — the parts no request body accepts** (`GET /seller/shops`) — status
(`PENDING`/`ACTIVE`/`SUSPENDED`/`REJECTED`), `statusReason`, verified flag, `slug`, `ownerId`, my role
in the shop, ratings, product and order counts, `createdAt`/`approvedAt`, and the two payment flags
`codEnabled` / `onlinePaymentEnabled`. `UpdateShopDto` contains none of them, so they are read-only in
every scope a seller has — not merely unwired. `app/(app)/settings/page.tsx` shows the payment flags as
chips with "Set with your approval" beside them, and the rest as plain values. The *editable* fourteen
columns are in REAL above, wired through `PATCH /seller/shops/:shopId`.

**Shop artwork** — `logoImage`, `coverImage`. Returned by `GET /seller/shops`, present in no DTO in
any scope. Typed as response-only in `lib/api/shops.ts` and deliberately absent from `lib/shop-view.ts`
so no screen can grow a picker for them.

**Categories** — the platform-managed list used by the product form and onboarding.

**Order facts** — customer name, phone and address, payment method, payment status (including
`REFUNDED`, which the seller cannot cause), line items with their price at purchase, totals, fees, and
the status timeline the API stamps.

**Delivery facts** — rider phone (set at registration), the timestamps the API writes for each
transition, and the stored `podNote` / `codCollected` once written.

**Review facts** — star rating, customer text, reviewer name as the API anonymises it, timestamps.

**Team facts** — a member's email and account status, invite status and expiry, the one-time invite
code (shown once, never re-readable), and role scope chips.

**Application facts** — reviewer notes and the server's `missing` list on an onboarding application.

## DERIVED

Computed in the browser from data a real endpoint returned. Nothing here is stored, and nothing here
invents a number the API did not supply.

**Shop accent colour** — hashed from `shopId` so a shop keeps the same colour everywhere. Presentation
only; no colour column exists.

**Stock state** — `untracked | out | in`, from `trackStock` plus the `stock` integer. The counts on
Inventory (out-of-stock products, out-of-stock variants, untracked products, active products) are
tallies of that state. There is **no low-stock bucket**, because `Product` has no threshold column and
inventing one (`<= 5`) would be a fabricated business rule.

**Coupon status ladder** — draft / scheduled / active / expired / deactivated, from `isActive`,
`validFrom`, `validTo` and the clock. It mirrors the ladder the API's own `quote` path applies, so the
badge and the customer's experience agree.

**Analytics deltas and series** — period-over-period change percentages and the day-by-day series, both
computed from the two `analytics/overview` payloads. A `null` in a payload is rendered as a silence, not
as a zero.

**Order arithmetic** — line subtotals (`quantity × priceAtPurchase`) and item counts.

**Unread notification badge** — counted from the list, cross-checked against
`GET /notifications/unread-count`.

**Client-side staff and invite filtering** — `GET …/staff` takes no query parameters at all, so the
Staff screen loads the full list and filters it in the browser with `matchesMember` / `matchesInvite`.
This is honest because the whole collection is in hand; it is *not* presented as a server search, and
an empty result says "Try clearing the search" rather than implying no members exist.

## UNAVAILABLE

Shown as not available, or absent with the gap documented in the file that would otherwise host it.
No control, no copy and no type in the console implies any of these works.

**Clearing a shop's category or map pin.** `categoryId`, `lat` and `lng` are nullable columns whose DTO
fields refuse `null` and have no empty-string meaning, so each can be *changed* and never emptied. The
settings screen offers "No category" only while the shop has none, and the coordinate hints say the pin
can be corrected but not removed.

**Shop logo / cover upload.** No route in any scope accepts shop artwork.

**Bulk catalog import.** `catalog.import` is a real grant with no endpoint behind it.
`app/(app)/catalog/import/page.tsx` is an explicit unavailable screen — no file input, no template, no
preview, no progress, no success state — and it names the situation: the account has the permission,
GoPasal has no import service. It links back to Catalog and to Add product.

**Sponsored / featured placement.** `model SponsoredListing` exists in Prisma and no controller or
service in `apps/api/src` reads or writes it. The two switches that used to sit on the Promotions
screen are gone; the header comment records why.

**Payouts, settlement, refunds, net earnings, ledger, escrow.** No finance module in seller scope.
`payments.codCollected` in analytics is cash *due* on delivered COD orders, labelled as such — never as
earnings or a balance. `REFUNDED` is a status the seller can read and not cause.

**Low-stock thresholds.** No column, no metric, no filter, no badge.

**Proof-of-delivery photos.** Only the free-text `podNote` exists; no image route in any scope.

**Delivery ETA and rider shifts.** No fields, no routes — and per the brand rule the console makes no
delivery-time promise anywhere.

**Per-shop notification filtering.** `Notification` has no shop column; each item is labelled with its
subject, and the list is never filtered by shop.

**Clearing onboarding lat/lng.** `UpdateApplicationDto` cannot express null for a number, so a cleared
coordinate is skipped rather than sent as zero. The field hints say it can be corrected but not emptied.

**Editing a delivery-zone boundary the console cannot read back.** `PATCH …/zones/:zoneId` replaces the
polygon rather than merging into it, so `toDeliveryZone` sets `editable` only when every stored vertex
parsed (`points.length >= 3 && points.length === stored`). A partly-unreadable boundary keeps its row,
loses its Edit button, and says why — deleting and re-adding is offered instead of overwriting the shop's
boundary with a guess. There is also no map and no drawing surface: vertices are typed as `lat, lng`
lines, the exact shape `UpsertZoneDto` accepts.

**Notification pagination.** `GET /notifications` takes only `?unread=`; `listMine` runs a single
`findMany` with `take: 100` and no cursor, so the hundred-and-first notification cannot be reached from
any client. Orders, products, coupons and reviews are *not* in this bucket — each of those list DTOs
carries `page` and `limit` (default 20, `@Max(100)`) and is genuinely paged.

**Applying the four authored index migrations.** `20260826161105_seller_query_indexes`,
`20260826182000_review_shop_created_index`, `20260826204500_coupon_shop_created_index` and
`20260827093000_notification_user_created_index` are written and cannot be applied here, so their effect
is **unverified** and must never be described otherwise.

## Counts, and what they count

Counted off this document's own entries, not estimated: **71** REAL routes (the three zone-write routes
that share one table row are counted separately), **8** READ-ONLY field groups, **7** DERIVED
calculations, **13** UNAVAILABLE capabilities. These are counts of entries here, not a claim about the
whole API — admin-scope and customer-scope routes are out of scope for this document.

The REAL count rose from 70 to 71 in Phase 6, when `PATCH /seller/shops/:shopId` stopped being a route
the API had and the console did not call.

## How this was verified

The route column was read from `@Controller` / `@Get|@Post|@Patch|@Put|@Delete` / `@RequirePermissions`
decorators in `apps/api/src`; the permission column is the decorator's own key, not an inference from
`lib/rbac.ts`. Each route was then matched to the request that actually issues it in
`apps/web-seller/lib/api/*.ts` or `packages/api-client/src`, so a row here means both halves exist.

After the Phase 5 source edits, `apps/web-seller` was checked by running the tools, not by reading:
`tsc --noEmit` exit 0, `next lint --max-warnings=0` clean, `next build` exit 0 across 21 routes (with
the documented `next/font` stub applied for the build and then reverted — `app/layout.tsx` sha256 back
to `1cf3f4d7ddf9ae228d672e89b12b874f66cca4afebd655fca36f79dda37b276e`, `.next` removed).

Two things this document must not be read as claiming. The four authored index migrations
(`20260826161105_seller_query_indexes`, `20260826182000_review_shop_created_index`,
`20260826204500_coupon_shop_created_index`, `20260827093000_notification_user_created_index`) cannot be
applied in this sandbox and are **unverified**. And no route here was exercised against a running API —
verification was static plus the three build tools.
