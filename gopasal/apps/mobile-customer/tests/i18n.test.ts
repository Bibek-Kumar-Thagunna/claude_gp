import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  interpolate,
  translate,
  type Dictionary,
} from "../../../packages/native-ui/src/i18n/translate";

/**
 * What the app says when the dictionary does not have the answer.
 *
 * The happy path is a map lookup and is not where apps break. These cover the
 * states that actually ship: a Nepali string nobody has written yet, a key
 * that does not exist, and an interpolation whose variable is missing.
 */

const dict: Dictionary = {
  "cart.title": { en: "Your cart", np: "तपाईंको कार्ट" },
  "cart.items": { en: "Items ({count})", np: "सामान ({count})" },
  "shop.new": { en: "New shop" }, // deliberately not translated yet
  "cart.belowMin": { en: "Add रु {amount} to reach रु {min}", np: "रु {min} पुग्न रु {amount} थप्नुहोस्" },
};

describe("translate", () => {
  it("returns the requested language", () => {
    assert.equal(translate(dict, "np", "cart.title"), "तपाईंको कार्ट");
    assert.equal(translate(dict, "en", "cart.title"), "Your cart");
  });

  it("falls back to English when the Nepali is missing, silently", () => {
    let missed: string | null = null;
    const out = translate(dict, "np", "shop.new", undefined, undefined, (k) => (missed = k));
    assert.equal(out, "New shop");
    assert.equal(missed, null, "an untranslated string is a gap, not a bug — it must not warn");
  });

  it("reports a key that is not in the dictionary at all", () => {
    const missed: string[] = [];
    const out = translate(dict, "np", "nope.missing", undefined, undefined, (k) => missed.push(k));
    assert.equal(out, "nope.missing");
    assert.deepEqual(missed, ["nope.missing"]);
  });

  it("prefers a caller's fallback over the raw key", () => {
    const out = translate(dict, "np", "nope.missing", undefined, "Something sensible");
    assert.equal(out, "Something sensible");
  });

  it("interpolates the caller's fallback too", () => {
    const out = translate(dict, "np", "nope.missing", { n: 3 }, "You have {n}");
    assert.equal(out, "You have 3");
  });

  it("substitutes variables in either language", () => {
    assert.equal(translate(dict, "en", "cart.items", { count: 4 }), "Items (4)");
    assert.equal(translate(dict, "np", "cart.items", { count: 4 }), "सामान (4)");
  });

  it("keeps Western digits in Nepali, because a price tag in Kathmandu does", () => {
    const out = translate(dict, "np", "cart.belowMin", { amount: 140, min: 500 });
    assert.match(out, /140/);
    assert.match(out, /500/);
    assert.doesNotMatch(out, /[०-९]/);
  });

  it("fills placeholders by name, not by position", () => {
    // The Nepali reverses the order of the two amounts. If this ever
    // interpolated positionally, the customer would be told to add रु 500 to
    // reach रु 140.
    const out = translate(dict, "np", "cart.belowMin", { amount: 140, min: 500 });
    assert.equal(out, "रु 500 पुग्न रु 140 थप्नुहोस्");
  });
});

describe("interpolate", () => {
  it("leaves a placeholder alone when the variable is missing", () => {
    // Visibly broken gets reported; "Add रु  more" reads as prose and does not.
    assert.equal(interpolate("Add रु {amount} more", {}), "Add रु {amount} more");
  });

  it("passes the text through untouched when there are no variables", () => {
    assert.equal(interpolate("Plain text {here}"), "Plain text {here}");
  });

  it("renders a zero rather than dropping it", () => {
    assert.equal(interpolate("{count} left", { count: 0 }), "0 left");
  });

  it("replaces every occurrence of the same placeholder", () => {
    assert.equal(interpolate("{a} and {a}", { a: "x" }), "x and x");
  });
});
