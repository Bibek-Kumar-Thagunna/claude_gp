import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { routeForNotification } from "../lib/notification-route";

/**
 * The tap that opens a shop counter from a banner.
 *
 * This runs while the app is cold, on data that came over the air from a push
 * service, and whatever it returns is the first screen a shopkeeper sees. The
 * cost of getting it wrong is not a crash — it is an order nobody accepted
 * because the tap landed on a list, or on nothing at all, and a customer
 * waiting for food that was never started.
 *
 * Two things are therefore worth pinning hard: the precedence between the ids
 * a payload can carry, and the promise that no shape of rubbish returns a
 * route that is not a real screen in this app.
 */

/** Every route this function is allowed to produce, as `app/` actually lays out. */
const REAL_SCREENS = [
  "/(tabs)/queue",
  "/(tabs)/messages",
  "/(tabs)/money",
  "/reviews",
] as const;

describe("routeForNotification — where a real notification lands", () => {
  it("opens the order itself when an order arrives, not the queue", () => {
    // This is where the seller app deliberately parts company with the
    // customer's. The shopkeeper tapped *this* order; the next thing they want
    // is the Accept button, not a list to hunt it down in.
    assert.equal(routeForNotification({ type: "order.new", orderId: "o1" }), "/order/o1");
    assert.equal(routeForNotification({ type: "order.cancelled", orderId: "o2" }), "/order/o2");
  });

  it("opens the conversation a message belongs to", () => {
    assert.equal(
      routeForNotification({ type: "message.new", conversationId: "c1" }),
      "/chat/c1",
    );
  });

  it("prefers the conversation when a message about an order carries both ids", () => {
    // Messaging attaches the order to the thread, so a message about an order
    // arrives with both. The shopkeeper tapped a message; they want the reply
    // box, not the order sheet.
    assert.equal(
      routeForNotification({ type: "message.new", conversationId: "c1", orderId: "o1" }),
      "/chat/c1",
    );
  });

  it("trusts the id over the type, because the id is the more specific fact", () => {
    // A payload whose type was renamed server-side still routes correctly as
    // long as it carries an id. Reading the type first would strand it on a
    // list that the shopkeeper then has to search.
    assert.equal(routeForNotification({ type: "payout.settled", orderId: "o9" }), "/order/o9");
  });

  it("falls back to the list the type names when there is no id", () => {
    assert.equal(routeForNotification({ type: "order.placed" }), "/(tabs)/queue");
    assert.equal(routeForNotification({ type: "message.new" }), "/(tabs)/messages");
    assert.equal(routeForNotification({ type: "conversation.closed" }), "/(tabs)/messages");
    assert.equal(routeForNotification({ type: "review.created" }), "/reviews");
    assert.equal(routeForNotification({ type: "payout.paid" }), "/(tabs)/money");
    assert.equal(routeForNotification({ type: "settlement.ready" }), "/(tabs)/money");
  });

  it("matches on the prefix, so a new event name in a family still lands right", () => {
    // The API adds event types faster than the app ships. A family prefix means
    // `order.something_new` reaches the queue instead of the default.
    assert.equal(routeForNotification({ type: "order.auto_rejected" }), "/(tabs)/queue");
    assert.equal(routeForNotification({ type: "review.replied" }), "/reviews");
  });

  it("does not mistake a similar word for a family", () => {
    // "orders.digest" and "ordering.tips" are not the `order.` family. They are
    // unknown, and unknown has a defined home.
    assert.equal(routeForNotification({ type: "orders.digest" }), "/(tabs)/queue");
    assert.equal(routeForNotification({ type: "reviewer.invited" }), "/(tabs)/queue");
  });
});

describe("routeForNotification — payloads that are not what they claim", () => {
  it("lands an unrecognised type on the queue, which is a screen that explains itself", () => {
    assert.equal(routeForNotification({ type: "loyalty.tier_up" }), "/(tabs)/queue");
    assert.equal(routeForNotification({}), "/(tabs)/queue");
  });

  it("returns null only when there is no data at all", () => {
    // `getLastNotificationResponseAsync()` resolves null on a launch that was
    // not a tap. Null here means "do not navigate"; the shopkeeper is where
    // they meant to be.
    assert.equal(routeForNotification(undefined), null);
  });

  it("ignores ids that are not strings", () => {
    // `data` is whatever was in the notification. A number id would otherwise
    // build "/order/123" out of something never meant as an id — and a
    // stringified object would build "/chat/[object Object]".
    assert.equal(routeForNotification({ orderId: 123, type: "order.new" }), "/(tabs)/queue");
    assert.equal(
      routeForNotification({ conversationId: { id: "c1" }, type: "message.new" }),
      "/(tabs)/messages",
    );
    assert.equal(routeForNotification({ orderId: null, type: "order.new" }), "/(tabs)/queue");
    assert.equal(routeForNotification({ orderId: ["o1"], type: "order.new" }), "/(tabs)/queue");
    assert.equal(routeForNotification({ conversationId: true }), "/(tabs)/queue");
  });

  it("ignores a type that is not a string rather than calling startsWith on it", () => {
    // `(7).startsWith` is not a function, and this runs on a cold start with no
    // error boundary above it: the throw would be the launch.
    assert.equal(routeForNotification({ type: 7 }), "/(tabs)/queue");
    assert.equal(routeForNotification({ type: null }), "/(tabs)/queue");
    assert.equal(routeForNotification({ type: ["order.new"] }), "/(tabs)/queue");
  });

  it("falls back on an empty id rather than routing to a bare list path", () => {
    // "/order/" is not "/order/[id]" — it is a route this app does not have,
    // and expo-router would push a blank screen with no way back.
    assert.equal(routeForNotification({ orderId: "", type: "order.new" }), "/(tabs)/queue");
    assert.equal(
      routeForNotification({ conversationId: "", type: "message.new" }),
      "/(tabs)/messages",
    );
  });

  it("never returns a route this app does not have", () => {
    const payloads: Record<string, unknown>[] = [
      {},
      { type: "" },
      { type: "order." },
      { type: "..." },
      { type: "message" },
      { type: 0 },
      { type: false },
      { type: {} },
      { orderId: 0 },
      { conversationId: 0 },
      { type: "review", orderId: NaN },
      { type: "settlement", conversationId: [] },
    ];

    for (const data of payloads) {
      const route = routeForNotification(data);
      assert.ok(
        route !== null && (REAL_SCREENS as readonly string[]).includes(route),
        `${JSON.stringify(data)} routed to ${route}`,
      );
    }
  });

  it("does not let a prototype key masquerade as an id", () => {
    // `{}.constructor` is a function, not a string, so the typeof guard is what
    // stops "/order/function Object() {...}" ever being built.
    assert.equal(routeForNotification({ orderId: {}.constructor }), "/(tabs)/queue");
  });
});
