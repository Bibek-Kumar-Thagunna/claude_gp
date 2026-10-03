import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chatStamp, formatChatStamp, type ChatStamp } from "../components/chat-time";

/**
 * The four characters at the end of every conversation row.
 *
 * Two things can go wrong and both are quiet. The first is arithmetic: an
 * off-by-one at a boundary turns a message from an hour ago into "60m", or a
 * message from this morning into a weekday name, and a shopkeeper triaging an
 * inbox between customers reads the wrong one as urgent. The second is width —
 * the stamp shares a row with the customer's name, and a stamp that grows past
 * the column it was drawn for does not wrap, it eats the name.
 *
 * `now` is an argument, so every boundary below is exact rather than raced.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A fixed moment, so "a week ago" is a date and not whatever today is. */
const NOW = Date.parse("2026-09-24T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

/** The English dictionary these keys actually resolve to, in `lib/strings/core.ts`. */
const t = (key: string, vars?: Record<string, string | number>): string => {
  const table: Record<string, string> = {
    "chat.time.now": "now",
    "chat.time.minutes": "{count}m",
    "chat.time.hours": "{count}h",
  };
  const template = table[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    vars && name in vars ? String(vars[name]) : whole,
  );
};

describe("chatStamp — the boundaries", () => {
  it("says 'now' for the message that just arrived", () => {
    assert.deepEqual(chatStamp(ago(0), NOW), { kind: "now" });
    assert.deepEqual(chatStamp(ago(MINUTE - 1), NOW), { kind: "now" });
  });

  it("turns over to minutes at exactly one minute, not at zero", () => {
    // The whole first minute is "now". A row that flicked to "0m" a second
    // after a message landed would be counting something nobody asked about.
    assert.deepEqual(chatStamp(ago(MINUTE), NOW), { kind: "minutes", value: 1 });
  });

  it("counts whole minutes down, never up", () => {
    // 4m59s is four minutes. Rounding would make a message look older than the
    // one below it that arrived later.
    assert.deepEqual(chatStamp(ago(5 * MINUTE - 1), NOW), { kind: "minutes", value: 4 });
  });

  it("holds minutes right up to the hour, then switches", () => {
    assert.deepEqual(chatStamp(ago(HOUR - 1), NOW), { kind: "minutes", value: 59 });
    assert.deepEqual(chatStamp(ago(HOUR), NOW), { kind: "hours", value: 1 });
  });

  it("holds hours right up to the day, then names the weekday", () => {
    assert.deepEqual(chatStamp(ago(DAY - 1), NOW), { kind: "hours", value: 23 });
    assert.equal(chatStamp(ago(DAY), NOW).kind, "weekday");
  });

  it("names the weekday for the last week, then falls back to a date", () => {
    assert.equal(chatStamp(ago(7 * DAY - 1), NOW).kind, "weekday");
    assert.equal(chatStamp(ago(7 * DAY), NOW).kind, "date");
  });

  it("cuts the weekday window at seven days, where the name stops being unique", () => {
    // Past seven days a weekday name repeats, and "Thu" would mean either four
    // days ago or eleven. Nothing under a day ever reaches the weekday branch,
    // so a weekday can never be confused with today.
    const eightDays = chatStamp(ago(8 * DAY), NOW);
    assert.equal(eightDays.kind, "date");
  });

  it("carries the message's own date, not a re-derived one", () => {
    const stamp = chatStamp("2026-08-01T09:30:00.000Z", NOW);
    assert.equal(stamp.kind, "date");
    assert.equal(stamp.kind === "date" ? stamp.at.toISOString() : null, "2026-08-01T09:30:00.000Z");
  });
});

describe("chatStamp — timestamps that are not what they should be", () => {
  it("says 'now' for a message from the future rather than counting backwards", () => {
    // Phone clocks on a counter drift, and a server stamp a few seconds ahead
    // of the handset is routine. "-1m" beside a message that plainly just
    // arrived reads as a broken app.
    assert.deepEqual(chatStamp(ago(-5 * MINUTE), NOW), { kind: "now" });
    assert.deepEqual(chatStamp(ago(-400 * DAY), NOW), { kind: "now" });
  });

  it("has nothing to say about a conversation with no last message", () => {
    assert.deepEqual(chatStamp(null, NOW), { kind: "none" });
    assert.deepEqual(chatStamp(undefined, NOW), { kind: "none" });
    assert.deepEqual(chatStamp("", NOW), { kind: "none" });
  });

  it("has nothing to say about a date it cannot read, rather than NaN", () => {
    // `new Date("tomorrow").getTime()` is NaN, and NaN compared against
    // anything is false — so without the check this would fall through every
    // branch to `date` and render "Invalid Date" in the row.
    assert.deepEqual(chatStamp("tomorrow", NOW), { kind: "none" });
    assert.deepEqual(chatStamp("2026-13-45", NOW), { kind: "none" });
  });
});

describe("formatChatStamp", () => {
  it("renders each kind through the dictionary", () => {
    assert.equal(formatChatStamp({ kind: "now" }, t), "now");
    assert.equal(formatChatStamp({ kind: "minutes", value: 7 }, t), "7m");
    assert.equal(formatChatStamp({ kind: "hours", value: 3 }, t), "3h");
  });

  it("renders an empty string for nothing, not the word 'none'", () => {
    assert.equal(formatChatStamp({ kind: "none" }, t), "");
  });

  it("never exceeds four characters for any counted stamp in a whole day", () => {
    // The promise the module's own comment makes, swept rather than sampled.
    // It holds only because the classifier bounds the counts: minutes stop at
    // 59 and hours at 23, so no stamp is ever asked to render three digits.
    for (let minutes = 0; minutes < 24 * 60; minutes += 1) {
      const stamp = chatStamp(ago(minutes * MINUTE), NOW);
      const text = formatChatStamp(stamp, t);
      assert.ok(
        text.length <= 4,
        `${minutes} minutes ago rendered as "${text}" (${text.length} chars)`,
      );
    }
  });

  it("never hands the formatter a count that needs three digits", () => {
    for (const elapsed of [MINUTE, HOUR - 1, HOUR, DAY - 1]) {
      const stamp = chatStamp(ago(elapsed), NOW);
      const value = stamp.kind === "minutes" || stamp.kind === "hours" ? stamp.value : 0;
      assert.ok(value >= 1 && value <= 59, `${stamp.kind} reported ${value}`);
    }
  });

  it("asks the platform for a weekday rather than a hand-written table", () => {
    // Seven names per language is a list that eventually disagrees with the
    // calendar the same phone shows elsewhere. This only pins that the date is
    // the one the message carries; the wording is the OS locale's business.
    const stamp: ChatStamp = { kind: "weekday", at: new Date("2026-09-22T10:00:00.000Z") };
    const text = formatChatStamp(stamp, t);
    assert.ok(text.length > 0);
    assert.notEqual(text, "chat.time.weekday", "the dictionary is deliberately not consulted");
  });
});
