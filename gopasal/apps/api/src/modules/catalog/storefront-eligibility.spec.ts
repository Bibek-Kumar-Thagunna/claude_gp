import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DELIVERABLE_PRODUCT_WHERE,
  STOREFRONT_SHOP_WHERE,
  storefrontReadiness,
} from './storefront-eligibility';

const readyShop = {
  status: 'ACTIVE',
  verified: true,
  lat: 27.7,
  lng: 85.3,
  locationCapturedAt: new Date('2026-09-09T10:00:00Z'),
};

describe('customer storefront eligibility', () => {
  it('keeps an approved shop private until both fulfilment prerequisites exist', () => {
    assert.deepEqual(
      storefrontReadiness({ ...readyShop, lat: null, lng: null, locationCapturedAt: null }, 0),
      {
        visible: false,
        blockers: ['VERIFIED_LOCATION', 'DELIVERABLE_PRODUCT'],
        deliverableProductCount: 0,
      },
    );
  });

  it('becomes visible only with a verified pin and an orderable product', () => {
    assert.deepEqual(storefrontReadiness(readyShop, 1), {
      visible: true,
      blockers: [],
      deliverableProductCount: 1,
    });
  });

  it('requires approval independently of location and catalogue readiness', () => {
    assert.deepEqual(storefrontReadiness({ ...readyShop, status: 'PENDING', verified: false }, 3), {
      visible: false,
      blockers: ['APPROVAL'],
      deliverableProductCount: 3,
    });
  });

  it('uses the same concrete predicates for list and detail queries', () => {
    assert.equal(STOREFRONT_SHOP_WHERE.products && 'some' in STOREFRONT_SHOP_WHERE.products
      ? STOREFRONT_SHOP_WHERE.products.some
      : null, DELIVERABLE_PRODUCT_WHERE);
    assert.deepEqual(DELIVERABLE_PRODUCT_WHERE.OR, [
      { variants: { some: { isActive: true, stock: { gt: 0 } } } },
      { variants: { none: { isActive: true } }, trackStock: false },
      { variants: { none: { isActive: true } }, trackStock: true, stock: { gt: 0 } },
    ]);
  });
});
