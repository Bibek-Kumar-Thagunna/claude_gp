import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { orderActions } from "../../../packages/native-data/src/seller-delivery-wire";
import type { DeliveryStatus } from "../../../packages/native-data/src/seller";

/**
 * Which buttons an order gets, after the counter as well as before it.
 *
 * Every wrong answer here is a visible failure: a button the API refuses with a
 * 400, or — worse, and silent — an order nobody can move. The second is the one
 * this function was written to end: an order out for delivery used to have no
 * buttons at all, so a shop delivering its own orders could never close one.
 */
type LegStatus = DeliveryStatus;
const leg = (
  status: LegStatus,
  extra: { riderId?: string | null; pickedUpAt?: string | null } = {},
) => ({
  status,
  riderId: extra.riderId === undefined ? "r1" : extra.riderId,
  pickedUpAt: extra.pickedUpAt ?? null,
});

describe("orderActions", () => {
  it("offers accept and reject on a new order, and nothing on the leg", () => {
    const a = orderActions("PLACED", leg("UNASSIGNED", { riderId: null }));
    assert.equal(a.accept, true);
    assert.equal(a.reject, true);
    assert.equal(a.nextLeg, null);
    assert.equal(a.markFailed, false);
  });

  it("will not dispatch a packed order without a rider", () => {
    assert.equal(orderActions("PACKED", leg("UNASSIGNED", { riderId: null })).dispatch, false);
    assert.equal(orderActions("PACKED", leg("ASSIGNED")).dispatch, true);
  });

  it("walks the leg after dispatch: picked up, on the way, delivered", () => {
    assert.equal(orderActions("OUT_FOR_DELIVERY", leg("ASSIGNED")).nextLeg, "PICKED_UP");
    assert.equal(
      orderActions("OUT_FOR_DELIVERY", leg("PICKED_UP", { pickedUpAt: "t" })).nextLeg,
      "EN_ROUTE",
    );
    assert.equal(
      orderActions("OUT_FOR_DELIVERY", leg("EN_ROUTE", { pickedUpAt: "t" })).nextLeg,
      "DELIVERED",
    );
  });

  it("does not offer 'on the way' before the order is dispatched", () => {
    // EN_ROUTE cascades the order with actor SYSTEM, which PACKED refuses.
    assert.equal(orderActions("PACKED", leg("PICKED_UP", { pickedUpAt: "t" })).nextLeg, null);
  });

  it("lets a delivery fail while the rider has it, and not after", () => {
    assert.equal(orderActions("OUT_FOR_DELIVERY", leg("EN_ROUTE")).markFailed, true);
    assert.equal(orderActions("OUT_FOR_DELIVERY", leg("ASSIGNED")).markFailed, true);
    assert.equal(orderActions("DELIVERED", leg("DELIVERED")).markFailed, false);
    assert.equal(orderActions("OUT_FOR_DELIVERY", leg("FAILED")).markFailed, false);
  });

  it("brings a parcel back when it had been picked up", () => {
    const failed = orderActions("OUT_FOR_DELIVERY", leg("FAILED", { pickedUpAt: "t" }));
    assert.equal(failed.nextLeg, "RETURNING_TO_SHOP");
    assert.equal(failed.assignRider, false, "a parcel still out there cannot be reassigned");
    assert.equal(
      orderActions("OUT_FOR_DELIVERY", leg("RETURNING_TO_SHOP", { pickedUpAt: "t" })).nextLeg,
      "RETURNED_TO_SHOP",
    );
  });

  it("frees a failure before pickup for another rider straight away", () => {
    const a = orderActions("OUT_FOR_DELIVERY", leg("FAILED"));
    assert.equal(a.nextLeg, null);
    assert.equal(a.assignRider, true);
    assert.equal(a.cancel, false);
  });

  it("once the parcel is back, offers a redelivery or a cancel", () => {
    const a = orderActions("OUT_FOR_DELIVERY", leg("RETURNED_TO_SHOP", { pickedUpAt: "t" }));
    assert.equal(a.assignRider, true);
    assert.equal(a.cancel, true);
    assert.equal(a.nextLeg, null);
  });

  it("offers nothing on a closed order", () => {
    for (const status of ["DELIVERED", "CANCELLED", "REJECTED"] as const) {
      const a = orderActions(status, leg("ASSIGNED"));
      assert.deepEqual(
        [
          a.accept,
          a.pack,
          a.dispatch,
          a.cancel,
          a.assignRider,
          a.unassignRider,
          a.markFailed,
          a.nextLeg,
        ],
        [false, false, false, false, false, false, false, null],
        status,
      );
    }
  });
});
