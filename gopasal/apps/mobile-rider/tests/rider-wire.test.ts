import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cashToCollect,
  dayTotals,
  destination,
  directionsUrl,
  distanceLabel,
  metersBetween,
  riderStep,
  riderTransitionBody,
  shouldPing,
  type RiderDelivery,
} from "../../../packages/native-data/src/rider-wire";

/**
 * The rules the job screen is built from. Each one mirrors a server rule for
 * the RIDER actor, and getting one wrong is not a crash — it is a button that
 * offers a step the server refuses, or worse, hides the one it needs.
 */
function job(
  over: Omit<Partial<RiderDelivery>, "order"> & { order?: Partial<RiderDelivery["order"]> } = {},
): RiderDelivery {
  const { order, ...rest } = over;
  return {
    id: "d1",
    orderId: "o1",
    status: "ASSIGNED",
    destLat: 27.7,
    destLng: 85.3,
    distanceMeters: 1800,
    assignedAt: "2026-09-28T04:00:00.000Z",
    pickedUpAt: null,
    deliveredAt: null,
    failedAt: null,
    returnStartedAt: null,
    returnedAt: null,
    failReason: null,
    returnNote: null,
    podNote: null,
    hasProofPhoto: false,
    codCollected: false,
    codAmount: 0,
    updatedAt: "2026-09-28T04:00:00.000Z",
    ...rest,
    order: {
      code: "GP-1",
      status: "READY",
      recipientName: "Sita",
      recipientPhone: "9800000000",
      area: "Baneshwor",
      landmark: "Blue gate",
      fullAddress: "House 12",
      lat: 27.69,
      lng: 85.33,
      subtotal: 500,
      deliveryFee: 50,
      discount: 0,
      loyaltyDiscount: 0,
      total: 550,
      paymentMethod: "COD",
      paymentStatus: "PENDING",
      note: null,
      placedAt: "2026-09-28T03:50:00.000Z",
      shop: { id: "s1", name: "Ram Kirana", area: "Koteshwor", fullAddress: "Main road", lat: 27.68, lng: 85.34, phone: "9811111111" },
      items: [],
      ...order,
    },
  };
}

describe("riderStep", () => {
  it("walks assigned → picked up → en route with one primary action each", () => {
    assert.equal(riderStep(job()).primary, "pickUp");
    assert.equal(riderStep(job({ status: "PICKED_UP", pickedUpAt: "x" })).primary, "start");
    assert.equal(riderStep(job({ status: "EN_ROUTE", pickedUpAt: "x" })).primary, "handover");
  });

  it("only allows the doorstep photo between pickup and handover", () => {
    assert.equal(riderStep(job()).canAttachProof, false);
    assert.equal(riderStep(job({ status: "PICKED_UP" })).canAttachProof, true);
    assert.equal(riderStep(job({ status: "EN_ROUTE" })).canAttachProof, true);
    assert.equal(riderStep(job({ status: "DELIVERED" })).canAttachProof, false);
  });

  it("sends a failed parcel back to the shop only if it was picked up", () => {
    const carried = riderStep(job({ status: "FAILED", pickedUpAt: "x" }));
    assert.equal(carried.stage, "mustReturn");
    assert.equal(carried.primary, "startReturn");
    const never = riderStep(job({ status: "FAILED" }));
    assert.equal(never.stage, "done");
    assert.equal(never.primary, null);
  });

  it("never offers the shop's own step (returned to shop) to the rider", () => {
    const r = riderStep(job({ status: "RETURNING_TO_SHOP", pickedUpAt: "x" }));
    assert.equal(r.stage, "returning");
    assert.equal(r.primary, null);
    assert.equal(r.canFail, false);
  });
});

describe("destination and directions", () => {
  it("heads to the shop before pickup and while returning, to the customer between", () => {
    assert.equal(destination(job()).kind, "shop");
    assert.equal(destination(job({ status: "EN_ROUTE" })).kind, "customer");
    assert.equal(destination(job({ status: "RETURNING_TO_SHOP", pickedUpAt: "x" })).kind, "shop");
  });

  it("prefers the pin over the written address", () => {
    const url = directionsUrl(destination(job({ status: "EN_ROUTE" })));
    assert.match(url, /destination=27\.69,85\.33/);
    assert.match(url, /travelmode=two-wheeler/);
  });

  it("falls back to the encoded address when there is no pin", () => {
    const url = directionsUrl(
      destination(job({ status: "EN_ROUTE", destLat: null, destLng: null, order: { lat: null, lng: null } })),
    );
    assert.match(url, /destination=House%2012%2C%20Blue%20gate%2C%20Baneshwor/);
  });
});

describe("cash", () => {
  it("collects the COD amount, or the total when the delivery has none recorded", () => {
    assert.equal(cashToCollect(job({ codAmount: 540 })), 540);
    assert.equal(cashToCollect(job()), 550);
    assert.equal(cashToCollect(job({ order: { paymentMethod: "ESEWA" } })), 0);
  });

  it("totals only today's delivered, collected cash", () => {
    const day = new Date("2026-09-28T09:00:00");
    const at = new Date("2026-09-28T08:00:00").toISOString();
    const yesterday = new Date("2026-09-27T20:00:00").toISOString();
    const rows = [
      job({ status: "DELIVERED", deliveredAt: at, codCollected: true, codAmount: 300 }),
      job({ status: "DELIVERED", deliveredAt: at, codCollected: false, codAmount: 0 }),
      job({ status: "DELIVERED", deliveredAt: yesterday, codCollected: true, codAmount: 999 }),
      job({ status: "RETURNED_TO_SHOP", returnedAt: at }),
    ];
    assert.deepEqual(dayTotals(rows, day), { delivered: 2, cash: 300 });
  });
});

describe("riderTransitionBody", () => {
  it("sends only what each step declares, trimmed", () => {
    assert.deepEqual(riderTransitionBody({ status: "PICKED_UP" }), { status: "PICKED_UP" });
    assert.deepEqual(riderTransitionBody({ status: "DELIVERED", podNote: "  gate ", codCollected: true }), {
      status: "DELIVERED",
      podNote: "gate",
      codCollected: true,
    });
    assert.deepEqual(riderTransitionBody({ status: "FAILED", failReason: " no answer " }), {
      status: "FAILED",
      failReason: "no answer",
    });
  });
});

describe("pings", () => {
  const a = { lat: 27.7, lng: 85.3, at: 0 };
  it("always sends the first fix", () => assert.equal(shouldPing(null, a), true));
  it("never faster than every five seconds", () =>
    assert.equal(shouldPing(a, { lat: 27.71, lng: 85.3, at: 4_000 }), false));
  it("sends when moved 25 m or more", () => {
    assert.equal(shouldPing(a, { lat: 27.7003, lng: 85.3, at: 6_000 }), true);
    assert.equal(shouldPing(a, { lat: 27.70005, lng: 85.3, at: 6_000 }), false);
  });
  it("sends after 30 s of silence even when standing still", () =>
    assert.equal(shouldPing(a, { ...a, at: 30_000 }), true));
  it("measures distance on the sphere", () => {
    const m = metersBetween({ lat: 27.7, lng: 85.3 }, { lat: 27.71, lng: 85.3 });
    assert.ok(m > 1100 && m < 1125, String(m));
  });
});

describe("distanceLabel", () => {
  it("rounds sensibly", () => {
    assert.equal(distanceLabel(null), null);
    assert.equal(distanceLabel(847), "850 m");
    assert.equal(distanceLabel(1840), "1.8 km");
    assert.equal(distanceLabel(12_400), "12 km");
  });
});
