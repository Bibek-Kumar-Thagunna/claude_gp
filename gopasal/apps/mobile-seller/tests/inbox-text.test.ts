import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { translate } from "../../../packages/native-ui/src/i18n/translate";
import { strings } from "../lib/strings";
import { inboxText } from "../lib/inbox-text";
import { routeForNotification } from "../lib/notification-route";

const np = (key: string, vars?: Record<string, string | number>, fallback?: string) =>
  translate(strings, "np", key, vars, fallback);

describe("inboxText", () => {
  it("writes a new order in the reader's language", () => {
    const row = inboxText(
      {
        type: "order.incoming",
        title: "New order",
        body: "New order GP-1 just came in.",
        data: { code: "GP-1" },
      },
      np,
    );
    assert.equal(row.title, "नयाँ अर्डर");
    assert.match(row.body ?? "", /GP-1/);
  });

  it("keeps what a person wrote exactly as they wrote it", () => {
    const row = inboxText(
      {
        type: "conversation.incoming",
        title: "New customer message · X",
        body: "Do you have eggs?",
      },
      np,
    );
    assert.equal(row.body, "Do you have eggs?");
  });

  it("leaves a kind it does not know alone", () => {
    const row = inboxText({ type: "something.new", title: "Hello", body: "World" }, np);
    assert.deepEqual(row, { title: "Hello", body: "World" });
  });

  it("points a newly approved seller at the shelf, not the console", () => {
    const row = inboxText(
      {
        type: "application.approved",
        title: "X is on GoPasal",
        body: "Your application was approved. X is live — open the seller console to add your products.",
      },
      (k, v, f) => translate(strings, "en", k, v, f),
    );
    assert.doesNotMatch(row.body ?? "", /console/);
  });
});

describe("routeForNotification", () => {
  it("sends team news to the team, and application news to registration", () => {
    assert.equal(routeForNotification({ type: "invite.accepted" }), "/team");
    assert.equal(routeForNotification({ type: "application.approved" }), "/");
    assert.equal(routeForNotification({ type: "application.changes_requested" }), "/register");
  });
});
