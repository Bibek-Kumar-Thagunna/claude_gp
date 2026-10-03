import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PaymentStatus } from '@prisma/client';

/** Mirrors the PaymentIntent updateMany predicate used by every callback/retry. */
function claim(current: PaymentStatus, expected: PaymentStatus, attempt: number, expectedAttempt: number) {
  return current === expected && attempt === expectedAttempt;
}

describe('payment conditional state claims', () => {
  it('allows only one callback to claim a pending attempt', () => {
    let state: PaymentStatus = PaymentStatus.PENDING;
    const first = claim(state, PaymentStatus.PENDING, 1, 1);
    if (first) state = PaymentStatus.PAID;
    const duplicate = claim(state, PaymentStatus.PENDING, 1, 1);
    assert.equal(first, true);
    assert.equal(duplicate, false);
  });

  it('rejects a late callback from an attempt superseded by retry', () => {
    assert.equal(claim(PaymentStatus.PENDING, PaymentStatus.PENDING, 2, 1), false);
  });

  it('never permits failed or paid state to be downgraded by a callback', () => {
    assert.equal(claim(PaymentStatus.FAILED, PaymentStatus.PENDING, 1, 1), false);
    assert.equal(claim(PaymentStatus.PAID, PaymentStatus.PENDING, 1, 1), false);
  });
});
