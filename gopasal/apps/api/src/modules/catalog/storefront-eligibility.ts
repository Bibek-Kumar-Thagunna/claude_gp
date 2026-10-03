import { Prisma } from '@prisma/client';

/**
 * A product a customer can actually order now.
 *
 * Variant products need at least one active variant with stock. A product with
 * no active variants is orderable when inventory is either not tracked or the
 * base product has stock. Keeping this predicate in one file prevents the shop
 * directory and the shop page from disagreeing about whether a catalogue is
 * ready.
 */
export const DELIVERABLE_PRODUCT_WHERE: Prisma.ProductWhereInput = {
  isActive: true,
  OR: [
    { variants: { some: { isActive: true, stock: { gt: 0 } } } },
    { variants: { none: { isActive: true } }, trackStock: false },
    { variants: { none: { isActive: true } }, trackStock: true, stock: { gt: 0 } },
  ],
};

/** Approved is not the same as discoverable: fulfilment prerequisites live here. */
export const STOREFRONT_SHOP_WHERE: Prisma.ShopWhereInput = {
  status: 'ACTIVE',
  verified: true,
  lat: { not: null },
  lng: { not: null },
  locationCapturedAt: { not: null },
  products: { some: DELIVERABLE_PRODUCT_WHERE },
};

export type StorefrontBlocker = 'APPROVAL' | 'VERIFIED_LOCATION' | 'DELIVERABLE_PRODUCT';

export type StorefrontReadiness = {
  visible: boolean;
  blockers: StorefrontBlocker[];
  deliverableProductCount: number;
};

export function storefrontReadiness(
  shop: {
    status: string;
    verified: boolean;
    lat: number | null;
    lng: number | null;
    locationCapturedAt: Date | string | null;
  },
  deliverableProductCount: number,
): StorefrontReadiness {
  const blockers: StorefrontBlocker[] = [];
  if (shop.status !== 'ACTIVE' || !shop.verified) blockers.push('APPROVAL');
  if (shop.lat == null || shop.lng == null || !shop.locationCapturedAt) {
    blockers.push('VERIFIED_LOCATION');
  }
  if (deliverableProductCount < 1) blockers.push('DELIVERABLE_PRODUCT');
  return { visible: blockers.length === 0, blockers, deliverableProductCount };
}
