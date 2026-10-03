import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { routeForNotification } from "../lib/notification-route";

/**
 * The tap that opens the app from a banner.
 *
 * The payload arrives over the air from a push service, so the cases worth
 * covering are the specific-beats-general ordering and every shape of
 * rubbish that could arrive in `data`.
 */

describe("routeForNotification", () => {
  it("opens the exact order", () => {
    assert.equal(routeForNotification({ type: "order.accepted", orderId: "o1" }), "/order/o1");
  });

  it("opens the exact conversation", () => {
    assert.equal(routeForNotification({ type: "message.new", conversationId: "c1" }), "/chat/c1");
  });

  it("prefers the conversation when a message carries its order's id too", () => {
    // A message about an order carries both. The customer tapped a message.
    assert.equal(
      routeForNotification({ type: "message.new", conversationId: "c1", orderId: "o1" }),
      "/chat/c1",
    );
  });

  it("falls back to the list the type names when there is no id", () => {
    assert.equal(routeForNotification({ type: "order.delivered" }), "/(tabs)/orders");
    assert.equal(routeForNotification({ type: "message.new" }), "/(tabs)/messages");
    assert.equal(routeForNotification({ type: "conversation.closed" }), "/(tabs)/messages");
  });

  it("lands an unrecognised type on the notification list, never nowhere", () => {
    assert.equal(routeForNotification({ type: "loyalty.tier_up" }), "/notifications");
    assert.equal(routeForNotification({}), "/notifications");
  });

  it("returns null only when there is no data at all", () => {
    assert.equal(routeForNotification(undefined), null);
  });

  it("ignores ids that are not strings", () => {
    // A push payload is whatever was in the notification. A number id would
    // otherwise build "/order/123" from something never meant as an id.
    assert.equal(routeForNotification({ orderId: 123 }), "/notifications");
    assert.equal(routeForNotification({ conversationId: null, type: "order.x" }), "/(tabs)/orders");
    assert.equal(routeForNotification({ orderId: { id: "o1" } }), "/notifications");
  });

  it("ignores a type that is not a string", () => {
    assert.equal(routeForNotification({ type: 7 }), "/notifications");
  });
});
