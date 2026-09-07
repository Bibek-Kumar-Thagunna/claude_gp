/**
 * Seller shop endpoints — `apps/api/src/modules/catalog/catalog.seller.controller.ts`.
 *
 * Two routes are wired: `GET /seller/shops` (the list every screen's shop context is
 * built from) and `PATCH /seller/shops/:shopId` (`settings.manage`, the settings
 * screen's save). `GET /seller/shops/:shopId` (`dashboard.view`) is still unwired —
 * the list already returns whole shop rows, so nothing needs the detail read.
 *
 * Tenancy: `GET /seller/shops` carries no permission key because it is not a
 * shop-scoped question — the API answers it from the caller's own `ACTIVE`
 * `ShopMembership` rows, so the list is already exactly the shops this account
 * may act on. There is nothing to scope with an `:shopId`, and nothing a caller
 * could pass to widen it. The PATCH is the opposite: its shop comes from the path,
 * `PermissionsGuard` resolves the tenant from that same parameter, and there is no
 * body field or header that could redirect it.
 */

import { authedRequest } from "./client";
import type { ShopLifecycle } from "./types";

/**
 * One row of `GET /seller/shops`, i.e. `ShopsService.mine()`: the whole `Shop`
 * record, plus the caller's role on it and two counts.
 *
 * Fields are typed exactly as Prisma serialises them — `null` for an unset
 * nullable column, never `undefined` — so that a missing field is a real
 * absence rather than a mapping bug further down.
 *
 * **This is a response type, and only a response type.** The update body is
 * `ShopUpdateBody` below, declared separately because it is a strict subset of
 * these columns and because `null` means different things on the two sides: a
 * response uses `null` for "this column is empty", while the request body rejects
 * `null` outright and clears a text column with `""`.
 *
 * Three fields below can be read and never written by a seller:
 *
 *  - `coverImage` and `logoImage` are in no DTO in any scope, and GoPasal has no
 *    route that accepts shop artwork — the upload routes that do exist take KYC
 *    documents and product photos. So these two are not "not wired yet"; there is
 *    nothing on the other side to wire. They stay typed because the API really
 *    does return them and a screen may legitimately display a shop's own logo.
 *  - `ownerId` is set when the application is approved and is not a settable
 *    field afterwards.
 *
 * `codEnabled` and `onlinePaymentEnabled` are the same kind of read-only: both
 * columns exist, and no request body in any scope accepts them. Which payment
 * methods a shop may offer travels with approval, so the settings screen shows
 * them as read-only rather than as a switch that would 400.
 */
export type SellerShopWire = {
  id: string;
  slug: string;
  name: string;
  nameNp: string | null;
  description: string | null;
  categoryId: string | null;
  ownerId: string;
  status: ShopLifecycle;
  verified: boolean;

  phone: string | null;
  area: string | null;
  fullAddress: string | null;
  lat: number | null;
  lng: number | null;
  deliveryRadiusKm: number;

  hours: string | null;
  isOpen: boolean;
  minOrder: number;
  soloMode: boolean;
  codEnabled: boolean;
  onlinePaymentEnabled: boolean;

  /** Read-only: no seller route writes shop artwork. See the note above. */
  coverImage: string | null;
  /** Read-only: no seller route writes shop artwork. See the note above. */
  logoImage: string | null;
  emoji: string | null;

  ratingAvg: number;
  ratingCount: number;

  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  /** Why GoPasal rejected or suspended the shop, in words the owner can act on. */
  statusReason: string | null;

  /** The caller's own role on this shop, from the membership row. */
  myRole: { name: string; isPrivileged: boolean };
  _count: { products: number; orders: number };
};

/**
 * Every shop this account is an active member of.
 *
 * Returned as a bare array by the API (no `{ data }` envelope, no pagination) —
 * a seller has a handful of shops, not a page of them.
 */
export function listMyShops(signal?: AbortSignal): Promise<SellerShopWire[]> {
  return authedRequest<SellerShopWire[]>("/seller/shops", { signal });
}

/**
 * The body `PATCH /seller/shops/:shopId` accepts — every field of `UpdateShopDto`
 * (`apps/api/src/modules/catalog/dto/catalog.dto.ts`) and nothing else.
 *
 * It is deliberately *not* `Partial<SellerShopWire>`. Three things differ:
 *
 *  - **It is smaller.** `status`, `verified`, `slug`, `ownerId`, `statusReason`,
 *    `ratingAvg`, `codEnabled`, `onlinePaymentEnabled`, `logoImage`, `coverImage`,
 *    the timestamps, `myRole` and `_count` are all response-only. The pipe runs
 *    `forbidNonWhitelisted`, so sending one is a 400 naming the field — not a
 *    silently ignored key. Typing them out of the body is what stops that request
 *    from being written by accident.
 *  - **`null` is not a value.** Every field is `@ValidateIf(v !== undefined)`, so
 *    `null` falls through to `@IsString()`/`@IsNumber()` and is answered with a
 *    400. Omit a key to leave its column alone; send `""` to clear a nullable text
 *    column. `categoryId`, `lat` and `lng` can therefore be *changed* but not
 *    emptied — the API has no spelling for "unset this".
 *  - **Numbers and booleans must be real ones.** Body validation runs without
 *    implicit conversion, so `"27.7"` and `"true"` are 400s. Parse before sending.
 *
 * Server-side bounds, mirrored here only as documentation — the API is the one that
 * enforces them: `name` 2–120 characters; `nameNp` ≤ 120; `description` ≤ 1000;
 * `categoryId` ≤ 60; `phone` ≤ 20; `area` ≤ 160; `fullAddress` ≤ 300; `hours` ≤ 120;
 * `emoji` ≤ 16; `lat`/`lng` real coordinates; `deliveryRadiusKm` 0.5–20;
 * `minOrder` a whole number ≥ 0.
 */
export type ShopUpdateBody = {
  name?: string;
  nameNp?: string;
  description?: string;
  categoryId?: string;
  phone?: string;
  area?: string;
  fullAddress?: string;
  lat?: number;
  lng?: number;
  deliveryRadiusKm?: number;
  emoji?: string;
  hours?: string;
  isOpen?: boolean;
  minOrder?: number;
  soloMode?: boolean;
};

/**
 * The row `PATCH /seller/shops/:shopId` answers with.
 *
 * `ShopsService.update` returns `prisma.shop.update(...)` directly, so this is a
 * **bare `Shop`** — no `myRole`, no `_count`, no `category`. It is therefore not a
 * `SellerShopWire` and must not be merged into one; a caller that needs the console's
 * shop context refreshed reloads it (`useShops().reload()`) rather than patching the
 * list from this response.
 */
export type ShopRowWire = Omit<SellerShopWire, "myRole" | "_count">;

/**
 * Save shop settings.
 *
 * Requires `settings.manage` **in this shop** — `PermissionsGuard` resolves the
 * tenant from the `:shopId` path parameter, so the caller must check
 * `canInShop(shopId, "settings.manage")`, never an ambient "somewhere" grant.
 *
 * `shopId` must be a real shop id. The console's `ALL_SHOPS` sentinel (`"all"`) is a
 * localStorage token for "no shop selected" and is not a wildcard the API knows: it
 * would be resolved as a shop id the caller holds no grant for, i.e. a 403.
 *
 * The shop's lifecycle also has a say, and the browser already knows the answer
 * without asking: `settings.manage` is allowed on ACTIVE, PENDING and REJECTED shops
 * and refused on a SUSPENDED one, and `/auth/me` reports lifecycle-filtered
 * *effective* permissions — so `canInShop` is already false for a suspended shop.
 */
export function updateShop(
  shopId: string,
  body: ShopUpdateBody,
  signal?: AbortSignal,
): Promise<ShopRowWire> {
  return authedRequest<ShopRowWire>(`/seller/shops/${encodeURIComponent(shopId)}`, {
    method: "PATCH",
    body,
    signal,
  });
}
