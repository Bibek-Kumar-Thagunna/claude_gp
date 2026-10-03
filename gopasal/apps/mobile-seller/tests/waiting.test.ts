import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agoLabel, minutesSince, urgency, waitingLabel } from "../lib/waiting";

/**
 * "waiting 7 min" — the number that decides whether a shopkeeper looks up.
 *
 * It is the loudest thing on a new order card and it is also the only figure on
 * that card the app computes rather than receives. A wrong one is not a visible
 * failure: it is an order that sat for twenty minutes still drawn in calm brand
 * colour while the customer waited, or a freshly placed order screaming red
 * because a phone clock was two minutes fast.
 *
 * Extracted from `components/OrderCard.tsx` so `now` can be passed in; the hook
 * around it is the clock, this is the arithmetic.
 */

const MINUTE = 60_000;
const NOW = Date.parse("2026-09-24T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("minutesSince", () => {
  it("counts whole minutes since the order was placed", () => {
    assert.equal(minutesSince(ago(7 * MINUTE), NOW), 7);
    assert.equal(minutesSince(ago(90 * MINUTE), NOW), 90);
  });

  it("rounds down, so a card never claims more waiting than has happened", () => {
    assert.equal(minutesSince(ago(MINUTE - 1), NOW), 0);
    assert.equal(minutesSince(ago(2 * MINUTE - 1), NOW), 1);
  });

  it("is zero for an order placed this instant", () => {
    assert.equal(minutesSince(ago(0), NOW), 0);
  });

  it("is zero for a timestamp in the future, never negative", () => {
    // Clock skew between the server and a counter phone is ordinary. Without
    // the clamp this reads "waiting -3 min", which a shopkeeper takes as the
    // app being broken — and `urgency(-3)` would still be "brand", so a card
    // could sit there calmly displaying nonsense.
    assert.equal(minutesSince(ago(-3 * MINUTE), NOW), 0);
    assert.equal(minutesSince(ago(-99 * 60 * MINUTE), NOW), 0);
  });

  it("is zero for a date it cannot read, rather than NaN", () => {
    // NaN propagates: `Math.floor(NaN / 60000)` is NaN, `urgency(NaN)` is
    // "brand", and the card renders "waiting NaN min".
    assert.equal(minutesSince("not a date", NOW), 0);
    assert.equal(minutesSince("2026-02-30T99:00:00Z", NOW), 0);
  });

  it("is zero for a missing date, which is how a partial payload arrives", () => {
    assert.equal(minutesSince(null, NOW), 0);
    assert.equal(minutesSince(undefined, NOW), 0);
    assert.equal(minutesSince("", NOW), 0);
  });

  it("keeps counting past a day rather than wrapping", () => {
    // Stale orders exist — a shop that closed without rejecting a queue. The
    // card should say twenty-four hours, not one.
    assert.equal(minutesSince(ago(25 * 60 * MINUTE), NOW), 25 * 60);
  });
});

/** The English strings these keys resolve to, from `lib/strings/core.ts`. */
const t = (key: string, vars?: Record<string, string | number>): string => {
  const table: Record<string, string> = {
    "queue.justNow": "just now",
    "queue.waiting": "waiting {minutes} min",
    "queue.minutesAgo": "{minutes} min ago",
    "queue.hoursAgo": "{hours} h ago",
  };
  const template = table[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    vars && name in vars ? String(vars[name]) : whole,
  );
};

describe("waitingLabel — what a new order says", () => {
  it("says 'just now' for the first minute rather than 'waiting 0 min'", () => {
    // "waiting 0 min" is arithmetically true and reads as a bug.
    assert.equal(waitingLabel(0, t), "just now");
  });

  it("starts counting at one minute", () => {
    assert.equal(waitingLabel(1, t), "waiting 1 min");
    assert.equal(waitingLabel(7, t), "waiting 7 min");
  });

  it("holds minutes right up to the hour", () => {
    assert.equal(waitingLabel(59, t), "waiting 59 min");
  });

  it("switches to hours at sixty, not at sixty-one", () => {
    assert.equal(waitingLabel(60, t), "1 h ago");
    assert.equal(waitingLabel(61, t), "1 h ago");
    assert.equal(waitingLabel(119, t), "1 h ago");
    assert.equal(waitingLabel(120, t), "2 h ago");
  });

  it("never renders a placeholder, which is what an unfilled variable looks like", () => {
    for (const minutes of [0, 1, 30, 59, 60, 300]) {
      assert.doesNotMatch(waitingLabel(minutes, t), /[{}]/);
    }
  });
});

describe("agoLabel — what an order already in hand says", () => {
  it("is phrased as elapsed time, not as a customer waiting", () => {
    // The order is being packed; nobody is standing there. "waiting 12 min"
    // would be the queue's language applied to work in progress.
    assert.equal(agoLabel(12, t), "12 min ago");
  });

  it("shares the boundaries with waitingLabel, so a card does not jump on accept", () => {
    assert.equal(agoLabel(0, t), "just now");
    assert.equal(agoLabel(59, t), "59 min ago");
    assert.equal(agoLabel(60, t), "1 h ago");
  });
});

describe("urgency — how loudly the number is drawn", () => {
  it("is calm under ten minutes", () => {
    assert.equal(urgency(0), "brand");
    assert.equal(urgency(9), "brand");
  });

  it("warns from ten minutes, which is the shop's promise and not a measurement", () => {
    assert.equal(urgency(10), "warning");
    assert.equal(urgency(19), "warning");
  });

  it("goes red from twenty, where a customer starts wondering if anybody saw it", () => {
    assert.equal(urgency(20), "danger");
    assert.equal(urgency(240), "danger");
  });

  it("never de-escalates as the wait grows", () => {
    // The one property the thresholds must have. An inverted comparison would
    // still pass a spot check at 5 and 25 while drawing 15 minutes calmer than
    // 5 — a colour that gets quieter the longer somebody waits.
    const rank = { brand: 0, warning: 1, danger: 2 } as const;
    let previous = 0;
    for (let minutes = 0; minutes <= 120; minutes += 1) {
      const current = rank[urgency(minutes)];
      assert.ok(current >= previous, `urgency fell back at ${minutes} minutes`);
      previous = current;
    }
  });

  it("does not paint a skewed clock red", () => {
    // Paired with the clamp in `minutesSince`: a future timestamp arrives here
    // as 0, never as a negative that would have to be reasoned about.
    assert.equal(urgency(minutesSince(ago(-30 * MINUTE), NOW)), "brand");
  });
});
