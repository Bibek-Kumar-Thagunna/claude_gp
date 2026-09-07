/**
 * The seller console's own view of a shop.
 *
 * Two API payloads describe the same shops and neither is sufficient alone:
 *
 *  - `GET /seller/shops` has the shop *record* — name, area, hours, radius,
 *    counts, the caller's role — but says nothing about permissions.
 *  - `GET /auth/me`'s `access.shops[]` has the *authorization* — the resolved
 *    permission keys, plus `restricted`/`restrictionReason` when a shop's
 *    lifecycle has had keys withdrawn from it (a SUSPENDED or PENDING shop).
 *
 * Both are driven by the same query — `shopMembership.findMany({ userId,
 * status: 'ACTIVE' })` — so they return the same shop id set, and merging them
 * on `shopId` is exact rather than best-effort. Where they overlap (`status`),
 * the shop row wins: it is the record itself, while `/auth/me` is a snapshot
 * taken when the session was last resolved.
 *
 * `accent` is the one field with no API counterpart. It is derived from the shop
 * id so a shop keeps the same colour on every screen and across reloads —
 * presentation only, and never read as though it meant something.
 *
 * `logoImage` and `coverImage` are not copied through to this model, and their
 * absence here is deliberate rather than an oversight. `SellerShopWire` still
 * declares both, because `GET /seller/shops` really does return them and describing
 * a payload accurately is always right; what was wrong was carrying them into the
 * model every screen reads from, when no screen renders them and no seller route can
 * write them. GoPasal has no shop-logo or shop-cover upload route at all, so a
 * `logoImage` sitting in the view model is an invitation to build a picker for a
 * capability that does not exist. If a screen ever needs to *display* a shop's own
 * artwork, read it from the wire type at that point and say in the same breath that
 * it is read-only. Adding it back here is not the way in.
 *
 * `emoji` was in the same group and is no longer: it is a real `UpdateShopDto` field,
 * and the settings screen now both shows and saves it, so it belongs here. That was
 * the distinction the earlier note drew — writable through the API, merely unwired —
 * and this is the moment it stopped applying.
 */

import type { SellerShopWire } from "./api/shops";
import type { ShopAccess, ShopLifecycle } from "./api/types";

/** The four brand accents the shell already knows how to render. */
export const SHOP_ACCENTS = ["crimson", "green", "marigold", "blue"] as const;
export type ShopAccent = (typeof SHOP_ACCENTS)[number];

export type SellerShop = {
  id: string;
  slug: string;
  name: string;
  /** Nepali name, when the shop gave one. */
  nameNp: string | null;
  description: string | null;
  categoryId: string | null;

  status: ShopLifecycle;
  /** Human label for `status`, e.g. "Awaiting approval". */
  statusLabel: string;
  /** GoPasal's reason for a REJECTED or SUSPENDED shop, in the owner's words. */
  statusReason: string | null;
  verified: boolean;
  /** True when this shop's lifecycle has had permissions withdrawn from it. */
  restricted: boolean;
  /** Why, when `restricted`. Comes from the API, not composed here. */
  restrictionReason: string | null;

  area: string | null;
  fullAddress: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  deliveryRadiusKm: number;

  /** Free text as the shop wrote it, e.g. "6:30am – 9pm". Not a schedule. */
  hours: string | null;
  isOpen: boolean;
  minOrder: number;
  soloMode: boolean;
  /** A single character the shop picked to stand for itself. Editable. */
  emoji: string | null;
  /** Read-only: set with approval, in no request body in any scope. */
  codEnabled: boolean;
  /** Read-only: set with approval, in no request body in any scope. */
  onlinePaymentEnabled: boolean;

  ratingAvg: number;
  ratingCount: number;
  productCount: number;
  orderCount: number;

  /** The caller's role on this shop, for display. */
  roleName: string;
  /** Whether that role is privileged — display only; never a permission check. */
  rolePrivileged: boolean;

  createdAt: string;
  approvedAt: string | null;

  /** Stable per-shop colour. Presentation only. */
  accent: ShopAccent;
};

const STATUS_LABELS: Record<ShopLifecycle, string> = {
  ACTIVE: "Live",
  PENDING: "Awaiting approval",
  SUSPENDED: "Suspended",
  REJECTED: "Rejected",
};

function shopStatusLabel(status: ShopLifecycle): string {
  return STATUS_LABELS[status];
}

/**
 * A stable accent for a shop id.
 *
 * A sum of char codes rather than anything cryptographic: the only requirement
 * is that the same id always lands on the same colour, in the browser and in a
 * server render, without a lookup table of ids we would have to maintain.
 */
function accentForShopId(id: string): ShopAccent {
  let total = 0;
  for (let i = 0; i < id.length; i += 1) total += id.charCodeAt(i);
  // `noUncheckedIndexedAccess` — the modulo is in range, but prove it to tsc.
  return SHOP_ACCENTS[total % SHOP_ACCENTS.length] ?? "crimson";
}

/**
 * Merge one shop row with the matching `/auth/me` access entry.
 *
 * `access` is optional because the two payloads are read independently: a shop
 * can arrive from the list a moment before `me` has resolved. When it is
 * missing we say "not restricted" rather than inventing a restriction — the
 * permission sets in `AuthProvider` are still the only thing that decides what
 * the seller can do, and they are empty until `me` lands.
 */
function toSellerShop(wire: SellerShopWire, access?: ShopAccess): SellerShop {
  return {
    id: wire.id,
    slug: wire.slug,
    name: wire.name,
    nameNp: wire.nameNp,
    description: wire.description,
    categoryId: wire.categoryId,

    status: wire.status,
    statusLabel: shopStatusLabel(wire.status),
    statusReason: wire.statusReason,
    verified: wire.verified,
    restricted: access?.restricted ?? false,
    restrictionReason: access?.restrictionReason ?? null,

    area: wire.area,
    fullAddress: wire.fullAddress,
    phone: wire.phone,
    lat: wire.lat,
    lng: wire.lng,
    deliveryRadiusKm: wire.deliveryRadiusKm,

    hours: wire.hours,
    isOpen: wire.isOpen,
    minOrder: wire.minOrder,
    soloMode: wire.soloMode,
    emoji: wire.emoji,
    codEnabled: wire.codEnabled,
    onlinePaymentEnabled: wire.onlinePaymentEnabled,

    ratingAvg: wire.ratingAvg,
    ratingCount: wire.ratingCount,
    productCount: wire._count.products,
    orderCount: wire._count.orders,

    roleName: wire.myRole.name,
    rolePrivileged: wire.myRole.isPrivileged,

    createdAt: wire.createdAt,
    approvedAt: wire.approvedAt,

    accent: accentForShopId(wire.id),
  };
}

/**
 * The whole list, in a fixed order.
 *
 * Live shops first, then by name: the shop a seller works in should not move
 * around because a pending application changed state overnight. `Intl`
 * collation keeps Nepali names in a sensible order rather than by code point.
 */
export function toSellerShops(wire: SellerShopWire[], access: ShopAccess[]): SellerShop[] {
  const byId = new Map(access.map((a) => [a.shopId, a]));
  const rank: Record<ShopLifecycle, number> = { ACTIVE: 0, PENDING: 1, SUSPENDED: 2, REJECTED: 3 };
  return wire
    .map((row) => toSellerShop(row, byId.get(row.id)))
    .sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));
}
