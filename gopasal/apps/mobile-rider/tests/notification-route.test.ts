import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { routeForNotification } from "../lib/notification-route";

describe("routeForNotification", () => {
  it("opens the job a notification is about", () => {
    assert.equal(routeForNotification({ orderId: "o_1" }), "/job/o_1");
  });
  it("lands on the jobs list for anything else", () => {
    assert.equal(routeForNotification({ type: "SOMETHING" }), "/(tabs)/jobs");
    assert.equal(routeForNotification({ orderId: 42 }), "/(tabs)/jobs");
  });
  it("does nothing without a payload", () => assert.equal(routeForNotification(undefined), null));
});
