import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allocateRefund, allocateRefundReversal, assertBalanced, calculateFinanceSplit, discountFunding } from './finance-calculation';

describe('finance calculation', () => {
  it('calculates commission on discounted merchandise and leaves self-delivery fee with seller', () => {
    assert.deepEqual(calculateFinanceSplit({ subtotal: 1_000, sellerFundedDiscount: 100, deliveryFee: 50, commissionRateBps: 1_000 }), {
      commissionBase: 900,
      commissionAmount: 90,
      sellerNetAmount: 860,
    });
  });

  it('uses deterministic half-up integer rounding', () => {
    assert.equal(calculateFinanceSplit({ subtotal: 105, sellerFundedDiscount: 0, deliveryFee: 0, commissionRateBps: 1_000 }).commissionAmount, 11);
  });

  it('snapshots platform coupon and loyalty funding without reducing seller proceeds', () => {
    const funding = discountFunding({ couponDiscount: 100, loyaltyDiscount: 20, couponPlatformFunded: true });
    assert.deepEqual(funding, {
      couponDiscount: 100,
      loyaltyDiscount: 20,
      platformFundedDiscount: 120,
      sellerFundedDiscount: 0,
    });
    assert.equal(calculateFinanceSplit({ subtotal: 1_000, sellerFundedDiscount: funding.sellerFundedDiscount, deliveryFee: 50, commissionRateBps: 1_000 }).sellerNetAmount, 950);
  });

  it('allocates refunds without losing a rupee', () => {
    const result = allocateRefund(1_000, 100, 333);
    assert.equal(result.commissionReversal + result.sellerReversal, 333);
    assert.deepEqual(result, { commissionReversal: 33, sellerReversal: 300 });
  });

  it('unwinds the platform subsidy only when the customer reaches a full refund', () => {
    const partial = allocateRefundReversal({
      grossAmount: 900,
      commissionAmount: 100,
      sellerNetAmount: 900,
      platformFundedDiscount: 100,
      previousRefundAmount: 0,
      totalRefundAmount: 300,
      orderTotal: 900,
    });
    assert.equal(partial.promotionReversal, 0);
    assert.equal(partial.commissionReversal + partial.sellerReversal, 300);

    const final = allocateRefundReversal({
      grossAmount: 900,
      commissionAmount: 100,
      sellerNetAmount: 900,
      platformFundedDiscount: 100,
      previousRefundAmount: 300,
      totalRefundAmount: 900,
      orderTotal: 900,
    });
    assert.equal(final.promotionReversal, 100);
    assert.equal(final.commissionReversal + final.sellerReversal, 700);
    assert.equal(final.commissionReversal + final.sellerReversal, 600 + final.promotionReversal);
  });

  it('rejects unbalanced or empty journals', () => {
    assert.doesNotThrow(() => assertBalanced([{ debit: 100, credit: 0 }, { debit: 0, credit: 100 }]));
    assert.throws(() => assertBalanced([{ debit: 99, credit: 0 }, { debit: 0, credit: 100 }]), /Unbalanced/);
    assert.throws(() => assertBalanced([]), /Unbalanced/);
  });
});
