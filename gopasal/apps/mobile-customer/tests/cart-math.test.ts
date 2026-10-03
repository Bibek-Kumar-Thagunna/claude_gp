import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyQtyChange } from "../../../packages/native-data/src/cart-math";
import type { Cart, CartLine } from "../../../packages/native-data/src/customer";

/**
 * The only arithmetic the app is allowed to do.
 *
 * Everywhere else the server prices the basket. This runs for the half-second
 * between tapping `+` and the write landing, and it is the figure the customer
 * is looking at while they decide whether to check out — so the cases that
 * matter are the ones where lines and total could disagree.
 */

const line = (over: Partial<CartLine> = {}): CartLine =>
  ({
    id: "line-1",
    productId: "p1",
    name: "Basmati Rice",
    unitPrice: 180,
    qty: 1,
    lineTotal: 180,
    ...over,
  }) as CartLine;

const cart = (items: CartLine[], minOrder = 0): Cart =>
  ({
    id: "cart-1",
    shop: null,
    items,
    itemCount: items.reduce((n, i) => n + i.qty, 0),
    subtotal: items.reduce((n, i) => n + i.lineTotal, 0),
    minOrder,
    meetsMinOrder: false,
    updatedAt: "2026-09-20T00:00:00.000Z",
  }) as Cart;

describe("applyQtyChange", () => {
  it("reprices the line it changed and leaves the others alone", () => {
    const before = cart([line(), line({ id: "line-2", unitPrice: 95, qty: 2, lineTotal: 190 })]);
    const after = applyQtyChange(before, "line-1", 3);

    assert.equal(after.items[0]!.qty, 3);
    assert.equal(after.items[0]!.lineTotal, 540);
    assert.deepEqual(after.items[1], before.items[1]);
  });

  it("keeps the subtotal equal to the sum of the lines", () => {
    const after = applyQtyChange(
      cart([line(), line({ id: "line-2", unitPrice: 95, qty: 2, lineTotal: 190 })]),
      "line-1",
      4,
    );
    assert.equal(
      after.subtotal,
      after.items.reduce((n, i) => n + i.lineTotal, 0),
    );
    assert.equal(after.subtotal, 720 + 190);
  });

  it("counts units, not lines", () => {
    const after = applyQtyChange(cart([line({ qty: 1 }), line({ id: "line-2", qty: 1 })]), "line-1", 5);
    assert.equal(after.items.length, 2);
    assert.equal(after.itemCount, 6);
  });

  it("removes the line at zero — the minus button at one is a delete", () => {
    const after = applyQtyChange(cart([line(), line({ id: "line-2" })]), "line-1", 0);
    assert.equal(after.items.length, 1);
    assert.equal(after.items[0]!.id, "line-2");
  });

  it("treats a negative quantity as a removal rather than a negative total", () => {
    const after = applyQtyChange(cart([line()]), "line-1", -3);
    assert.deepEqual(after.items, []);
    assert.equal(after.subtotal, 0);
    assert.equal(after.itemCount, 0);
  });

  it("does not invent a line for an id that is not in the cart", () => {
    const before = cart([line()]);
    const after = applyQtyChange(before, "nope", 9);
    assert.deepEqual(after.items, before.items);
    assert.equal(after.subtotal, before.subtotal);
  });

  it("says the minimum is met only once it actually is", () => {
    const below = applyQtyChange(cart([line()], 500), "line-1", 2); // 360
    assert.equal(below.meetsMinOrder, false);

    const exact = applyQtyChange(cart([line()], 540), "line-1", 3); // 540
    assert.equal(exact.meetsMinOrder, true, "the minimum is a floor, not a threshold to beat");
  });

  it("does not claim an empty basket meets the minimum", () => {
    // Zero >= zero is true, and a shop with no minimum would otherwise let an
    // empty cart through to a checkout that cannot price anything.
    const emptied = applyQtyChange(cart([line()], 0), "line-1", 0);
    assert.equal(emptied.items.length, 0);
    assert.equal(emptied.meetsMinOrder, false);
  });

  it("does not mutate the cart it was given", () => {
    const before = cart([line()]);
    const snapshot = JSON.parse(JSON.stringify(before));
    applyQtyChange(before, "line-1", 7);
    assert.deepEqual(before, snapshot);
  });
});
