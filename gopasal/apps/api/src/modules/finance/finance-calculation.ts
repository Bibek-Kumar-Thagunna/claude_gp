export type FinanceSplit = {
  commissionBase: number;
  commissionAmount: number;
  sellerNetAmount: number;
};

export type DiscountFunding = {
  couponDiscount: number;
  loyaltyDiscount: number;
  platformFundedDiscount: number;
  sellerFundedDiscount: number;
};

/** Platform coupons and GoCoins do not reduce the seller's merchandise proceeds. */
export function discountFunding(input: {
  couponDiscount: number;
  loyaltyDiscount: number;
  couponPlatformFunded: boolean;
}): DiscountFunding {
  const platformCoupon = input.couponPlatformFunded ? input.couponDiscount : 0;
  return {
    couponDiscount: input.couponDiscount,
    loyaltyDiscount: input.loyaltyDiscount,
    platformFundedDiscount: platformCoupon + input.loyaltyDiscount,
    sellerFundedDiscount: input.couponDiscount - platformCoupon,
  };
}

/**
 * NPR is stored as integer rupees. Commission uses deterministic half-up
 * rounding, and applies to merchandise after discount; the self-delivery fee
 * remains with the seller who performs the delivery.
 */
export function calculateFinanceSplit(input: {
  subtotal: number;
  sellerFundedDiscount: number;
  deliveryFee: number;
  commissionRateBps: number;
}): FinanceSplit {
  const commissionBase = Math.max(0, input.subtotal - input.sellerFundedDiscount);
  const commissionAmount = Math.floor(
    (commissionBase * input.commissionRateBps + 5_000) / 10_000,
  );
  return {
    commissionBase,
    commissionAmount,
    sellerNetAmount: commissionBase - commissionAmount + input.deliveryFee,
  };
}

/** Allocate a partial refund between seller proceeds and platform commission. */
export function allocateRefund(
  grossAmount: number,
  commissionAmount: number,
  refundAmount: number,
) {
  if (grossAmount <= 0 || refundAmount <= 0) {
    return { commissionReversal: 0, sellerReversal: 0 };
  }
  const bounded = Math.min(grossAmount, refundAmount);
  const commissionReversal = Math.min(
    commissionAmount,
    Math.floor((bounded * commissionAmount + Math.floor(grossAmount / 2)) / grossAmount),
  );
  return { commissionReversal, sellerReversal: bounded - commissionReversal };
}

/** Incremental accounting reversal for one refund. The final customer refund
 * also removes GoPasal's subsidy, which was never customer cash. */
export function allocateRefundReversal(input: {
  grossAmount: number;
  commissionAmount: number;
  sellerNetAmount: number;
  platformFundedDiscount: number;
  previousRefundAmount: number;
  totalRefundAmount: number;
  orderTotal: number;
}) {
  const before = allocateRefund(
    input.grossAmount,
    input.commissionAmount,
    input.previousRefundAmount,
  );
  const fullRefund = input.totalRefundAmount === input.orderTotal;
  const after = fullRefund
    ? {
        commissionReversal: input.commissionAmount,
        sellerReversal: input.sellerNetAmount,
      }
    : allocateRefund(input.grossAmount, input.commissionAmount, input.totalRefundAmount);
  return {
    fullRefund,
    commissionReversal: after.commissionReversal - before.commissionReversal,
    sellerReversal: after.sellerReversal - before.sellerReversal,
    promotionReversal: fullRefund ? input.platformFundedDiscount : 0,
  };
}

export function assertBalanced(entries: Array<{ debit: number; credit: number }>) {
  const debit = entries.reduce((sum, row) => sum + row.debit, 0);
  const credit = entries.reduce((sum, row) => sum + row.credit, 0);
  if (debit !== credit || debit <= 0) {
    throw new Error(`Unbalanced finance journal (debit=${debit}, credit=${credit})`);
  }
}
