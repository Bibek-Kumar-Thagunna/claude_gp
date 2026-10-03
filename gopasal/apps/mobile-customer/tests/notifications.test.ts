import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { notificationRows } from "../../../packages/native-data/src/notification-wire";

/**
 * `GET /notifications` answers `{ unread, items }`. The inbox used to read it as
 * an array or a `{ data }` page and so showed nothing, ever — the kind of bug
 * that passes every type check because the response is typed by the reader.
 */
describe("notificationRows", () => {
  const row = { id: "n1", title: "Order on its way", body: "…", createdAt: "2026-09-26T05:00:00Z" };

  it("reads the API's { unread, items } shape", () => {
    assert.equal(notificationRows({ unread: 1, items: [row] }).length, 1);
  });

  it("still reads a bare array or a { data } page", () => {
    assert.equal(notificationRows([row]).length, 1);
    assert.equal(notificationRows({ data: [row] }).length, 1);
  });

  it("lifts the order out of data, so tapping it opens the order", () => {
    const [n] = notificationRows({ items: [{ ...row, data: { orderId: "o1", code: "GP-1" } }] });
    assert.equal(n.orderId, "o1");
    assert.equal(n.data?.code, "GP-1");
  });

  it("is empty, not a crash, on anything else", () => {
    assert.deepEqual(notificationRows(null), []);
    assert.deepEqual(notificationRows({ items: "nope" }), []);
    assert.deepEqual(notificationRows({ unread: 0, items: [] }), []);
  });
});
