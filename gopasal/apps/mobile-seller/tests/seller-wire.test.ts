import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashKey } from "@tanstack/react-query";
import {
  isShopScopedKey,
  orderQueryKey,
  orderQueryString,
  productQueryString,
  qk,
  reviewQueryString,
  stockDelta,
  transitionBody,
} from "../../../packages/native-data/src/seller-wire";
import type { OrderQuery, OrderStatus, TransitionInput } from "../../../packages/native-data/src/seller";

/**
 * The addressing and the arithmetic behind every seller request.
 *
 * Three separate ways to lose a shopkeeper's afternoon live in this file:
 *
 *  - **A cache key that two shops can both produce.** A manager who runs two
 *    branches switches between them in one app session, over one cache. If any
 *    key stopped distinguishing them, the queue would hand one branch's orders
 *    to the other branch's counter — and it would look right, because the
 *    orders are real.
 *  - **A stock delta with the sign the wrong way round.** The route takes a
 *    signed adjustment, not a total, so a flipped subtraction does not fail.
 *    It adds six to a shelf somebody was emptying.
 *  - **A transition body missing its reason.** `reason` is required on reject
 *    and cancel, and an undeclared key is a 400 under `forbidNonWhitelisted` —
 *    so the shape of this small object is whether an order moves at all.
 *
 * `hashKey` is React Query's own, imported rather than reimplemented: a
 * collision test against a hand-written hash would only prove the hand-written
 * hash agrees with itself.
 */

/** Every key the factory can build, for one shop. */
function allKeysFor(shopId: string): readonly (readonly unknown[])[] {
  return [
    qk.ordersRoot(shopId),
    qk.orders(shopId),
    qk.orders(shopId, { status: ["PLACED"] }),
    qk.orders(shopId, { status: ["DELIVERED"], page: 2 }),
    qk.order(shopId, "order-1"),
    qk.order(shopId, "order-2"),
    qk.productsRoot(shopId),
    qk.products(shopId),
    qk.products(shopId, { stock: "out" }),
    qk.conversations(shopId),
    qk.conversation(shopId, "conv-1"),
    qk.finance(shopId),
    qk.analytics(shopId, "7d"),
    qk.analytics(shopId, "30d"),
    qk.riders(shopId),
    qk.reviewsRoot(shopId),
    qk.reviews(shopId),
    qk.reviews(shopId, { rating: [1, 2] }),
  ];
}

describe("query keys — telling two shops apart", () => {
  it("gives no two questions, across two shops, the same key", () => {
    // The sweep that matters. A manager with two branches runs both through one
    // cache in one session, and a single duplicate here is one shop reading the
    // other's answers.
    const keys = [...allKeysFor("shop-a"), ...allKeysFor("shop-b")];
    const seen = new Map<string, readonly unknown[]>();

    for (const key of keys) {
      const hash = hashKey(key);
      const clash = seen.get(hash);
      assert.equal(clash, undefined, `${JSON.stringify(key)} collides with ${JSON.stringify(clash)}`);
      seen.set(hash, key);
    }
    assert.equal(seen.size, keys.length);
  });

  it("puts the shop id in every shop-scoped key", () => {
    for (const key of allKeysFor("shop-a")) {
      assert.ok(key.includes("shop-a"), `${JSON.stringify(key)} does not name its shop`);
    }
  });

  it("does not let one shop id be a prefix of another's key", () => {
    // Keys are compared element by element, not as text — but only because the
    // id is its own element. "shop-1" and "shop-10" are the case that would
    // break if a key were ever built by joining segments into a string.
    assert.notEqual(hashKey(qk.ordersRoot("shop-1")), hashKey(qk.ordersRoot("shop-10")));
    assert.notEqual(hashKey(qk.order("shop-1", "0-x")), hashKey(qk.order("shop-10", "x")));
  });

  it("keeps one order's detail apart from the list it appears in", () => {
    assert.notEqual(hashKey(qk.order("s", "o1")), hashKey(qk.orders("s")));
    assert.notEqual(hashKey(qk.conversation("s", "c1")), hashKey(qk.conversations("s")));
  });

  it("makes the list root a true prefix of its pages, which is how invalidation works", () => {
    // `invalidateQueries({ queryKey: qk.ordersRoot(shopId) })` after a
    // transition relies on this. If the root stopped being a prefix, an
    // accepted order would stay in the New group until the screen was left.
    const root = qk.ordersRoot("s");
    const page = qk.orders("s", { page: 3 });
    assert.deepEqual(page.slice(0, root.length), [...root]);
    assert.ok(page.length > root.length);
  });

  it("namespaces every key under 'seller', away from the customer cache", () => {
    // Both surfaces are the same package and can be loaded in one process. A
    // bare ["orders"] key on either side would answer the other's question.
    for (const key of [...allKeysFor("s"), qk.all(), qk.shops()]) {
      assert.equal(key[0], "seller");
    }
  });
});

describe("query keys — when two requests should share one cache entry", () => {
  it("gives the same key to the same statuses listed in a different order", () => {
    // Two screens ask for the working queue with the statuses written in
    // whatever order reads well. Without the sort they fetch the same page
    // twice and show two copies of the same data drifting apart.
    assert.equal(
      hashKey(qk.orders("s", { status: ["PACKED", "PLACED"] })),
      hashKey(qk.orders("s", { status: ["PLACED", "PACKED"] })),
    );
  });

  it("treats an empty search box as no search", () => {
    assert.equal(hashKey(qk.orders("s", { q: "   " })), hashKey(qk.orders("s")));
    assert.equal(hashKey(qk.orders("s", { q: "" })), hashKey(qk.orders("s")));
  });

  it("treats an empty status list as no filter, not as 'match nothing'", () => {
    assert.equal(hashKey(qk.orders("s", { status: [] })), hashKey(qk.orders("s")));
    assert.equal(hashKey(qk.reviews("s", { rating: [] })), hashKey(qk.reviews("s")));
  });

  it("trims a pasted search term to the term the server will search for", () => {
    assert.equal(hashKey(qk.orders("s", { q: " GP-1042 " })), hashKey(qk.orders("s", { q: "GP-1042" })));
  });

  it("still separates two different searches", () => {
    assert.notEqual(hashKey(qk.orders("s", { q: "rice" })), hashKey(qk.orders("s", { q: "oil" })));
  });

  it("fills in the defaults, so page one is page one however it was asked for", () => {
    assert.deepEqual(orderQueryKey({}), {
      page: 1,
      limit: 20,
      q: null,
      status: null,
      sort: "newest",
    });
    assert.equal(hashKey(qk.orders("s", { page: 1 })), hashKey(qk.orders("s")));
  });

  it("does not sort the caller's own array out from under them", () => {
    // `[...query.status].sort()` rather than `query.status.sort()`. The screen
    // holds these arrays as module constants; sorting in place would silently
    // rewrite the order the queue renders its groups in.
    const statuses: readonly OrderStatus[] = ["PLACED", "ACCEPTED", "OUT_FOR_DELIVERY"];
    const given: OrderStatus[] = [...statuses];
    qk.orders("s", { status: given });
    assert.deepEqual(given, [...statuses]);
  });
});

describe("query strings — what actually goes on the wire", () => {
  it("always sends page, limit and sort, so the server never guesses", () => {
    assert.equal(orderQueryString({}), "?page=1&limit=20&sort=newest");
    assert.equal(productQueryString({}), "?page=1&limit=30&sort=recent");
    assert.equal(reviewQueryString({}), "?page=1&limit=20&sort=newest");
  });

  it("omits an empty search rather than sending q=", () => {
    // The API trims and ignores it, but sending it makes the URL — and so the
    // cache entry keyed on it — differ from the identical request without it.
    assert.doesNotMatch(orderQueryString({ q: "  " }), /q=/);
    assert.doesNotMatch(productQueryString({ q: "" }), /q=/);
  });

  it("sends the statuses comma-separated and sorted", () => {
    assert.match(orderQueryString({ status: ["PLACED", "ACCEPTED"] }), /status=ACCEPTED%2CPLACED/);
  });

  it("escapes a search term instead of breaking the URL with it", () => {
    // Shopkeepers paste order codes, and customers have names with spaces and
    // ampersands. An unescaped "&" would split into a parameter the DTO does
    // not declare, which is a 400.
    const url = orderQueryString({ q: "Ram & Sons" });
    assert.match(url, /q=Ram\+%26\+Sons/);
    assert.equal(url.split("&").length, 4, "one parameter per field, no smuggled extras");
  });

  it("sends answered=false, which is a filter and not an absence", () => {
    // `Answered` is the literal string "false", not a boolean. If this ever
    // became a boolean, `if (key.answered)` would quietly drop the filter and
    // the Unanswered tab would show every review the shop has.
    assert.match(reviewQueryString({ answered: "false" }), /answered=false/);
    assert.match(reviewQueryString({ answered: "true" }), /answered=true/);
    assert.doesNotMatch(reviewQueryString({}), /answered=/);
  });

  it("omits an empty rating list rather than sending rating=", () => {
    // `rating=` is a 400 — the DTO wants integers — and an empty `in` clause
    // server-side matches nothing, so the screen would go blank.
    assert.doesNotMatch(reviewQueryString({ rating: [] }), /rating=/);
    assert.match(reviewQueryString({ rating: [2, 1] }), /rating=1%2C2/);
  });

  it("sends the no-category sentinel, which is a real filter value", () => {
    assert.match(productQueryString({ categoryId: "none" }), /categoryId=none/);
  });

  it("omits the shelf filters that were not asked for", () => {
    const url = productQueryString({ stock: "out" });
    assert.match(url, /stock=out/);
    assert.doesNotMatch(url, /status=/);
    assert.doesNotMatch(url, /categoryId=/);
  });

  it("agrees with the cache key about what the request is", () => {
    // The key and the URL are built from the same normalisation on purpose. If
    // they ever diverged, two requests sharing a cache entry would be fetching
    // different pages — the worst of both.
    const a: OrderQuery = { status: ["PACKED", "PLACED"], q: " rice " };
    const b: OrderQuery = { status: ["PLACED", "PACKED"], q: "rice" };
    assert.equal(hashKey(qk.orders("s", a)), hashKey(qk.orders("s", b)));
    assert.equal(orderQueryString(a), orderQueryString(b));
  });
});

describe("isShopScopedKey — what a shop switch throws away", () => {
  it("drops everything that was an answer about a shop", () => {
    for (const key of allKeysFor("shop-a")) {
      assert.equal(isShopScopedKey(key), true, `${JSON.stringify(key)} would survive a switch`);
    }
  });

  it("spares the shop list, which is the menu the switcher is rendering", () => {
    // Invalidating it would blank the list under the shopkeeper's thumb,
    // mid-tap, and it is a question about the seller rather than about a shop.
    assert.equal(isShopScopedKey(qk.shops()), false);
  });

  it("leaves the customer cache alone entirely", () => {
    // Both surfaces can be loaded in one process. A predicate that matched on
    // position rather than on the "seller" prefix would empty a shopper's cart
    // when a shopkeeper changed branch.
    for (const key of [["orders"], ["cart"], ["shops", "shop-a"], []]) {
      assert.equal(isShopScopedKey(key), false, `${JSON.stringify(key)} is not ours to drop`);
    }
  });
});

describe("stockDelta — the arithmetic the shelf depends on", () => {
  it("sends what must be added to reach the new count", () => {
    assert.equal(stockDelta(12, 18), 6);
  });

  it("sends a negative when the shelf has gone down", () => {
    // The sign is the whole thing. Reversed, counting a shelf down from twelve
    // to nine would add three instead of removing three, and the error
    // compounds every time anybody counts.
    assert.equal(stockDelta(12, 9), -3);
  });

  it("is zero when nothing changed, which is the save the sheet disables", () => {
    assert.equal(stockDelta(12, 12), 0);
  });

  it("reaches zero from any count, because emptying a shelf is the common case", () => {
    assert.equal(stockDelta(40, 0), -40);
  });

  it("is measured from the number the shopkeeper saw, not from zero", () => {
    // Two people counting the same shelf produce two deltas that both apply —
    // the honest outcome. A helper that ignored `from` and sent the total would
    // silently discard one of them.
    assert.notEqual(stockDelta(12, 18), 18);
  });
});

describe("transitionBody — the body each order transition sends", () => {
  it("carries the reason on a rejection, which the customer reads", () => {
    // `RejectOrderDto.reason` has no `@IsOptional()`. An empty body is a 400,
    // and the reason is stored on the order and shown to the customer.
    assert.deepEqual(
      transitionBody({ orderId: "o1", action: "reject", reason: "Out of stock" }),
      { reason: "Out of stock" },
    );
  });

  it("carries the reason on a cancellation too", () => {
    assert.deepEqual(transitionBody({ orderId: "o1", action: "cancel", reason: "Shop closing" }), {
      reason: "Shop closing",
    });
  });

  it("sends an empty body for a transition with nothing to say", () => {
    // `{}` rather than `{ note: undefined }`. Both serialise the same, but an
    // undeclared key that ever became defined would be a 400 under
    // `forbidNonWhitelisted`.
    for (const action of ["accept", "pack", "dispatch"] as const) {
      assert.deepEqual(transitionBody({ orderId: "o1", action }), {});
    }
  });

  it("carries a note when there is one", () => {
    assert.deepEqual(transitionBody({ orderId: "o1", action: "accept", note: "20 minutes" }), {
      note: "20 minutes",
    });
  });

  it("does not send an empty note, which the DTO would reject as too short", () => {
    assert.deepEqual(transitionBody({ orderId: "o1", action: "pack", note: "" }), {});
  });

  it("never sends a note and a reason together", () => {
    // The DTOs are exclusive: `TransitionNoteDto` has no `reason` and
    // `RejectOrderDto` has no `note`, so either extra key is a 400 on a request
    // the shopkeeper is watching a customer wait for.
    const inputs: TransitionInput[] = [
      { orderId: "o1", action: "accept", note: "n" },
      { orderId: "o1", action: "reject", reason: "r" },
      { orderId: "o1", action: "cancel", reason: "r" },
      { orderId: "o1", action: "dispatch" },
    ];
    for (const input of inputs) {
      const body = transitionBody(input);
      assert.ok(Object.keys(body).length <= 1, `${input.action} sent ${JSON.stringify(body)}`);
      assert.ok(!("orderId" in body), "the order id is a path segment, not a field");
      assert.ok(!("action" in body), "the action is a path segment, not a field");
    }
  });

  it("builds a fresh body each time rather than sharing one object", () => {
    const first = transitionBody({ orderId: "o1", action: "reject", reason: "A" });
    const second = transitionBody({ orderId: "o2", action: "reject", reason: "B" });
    assert.equal(first.reason, "A", "a second rejection must not rewrite the first's reason");
    assert.notEqual(first, second);
  });
});
