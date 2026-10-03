import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { translate } from "../../../packages/native-ui/src/i18n/translate";
import { strings } from "../lib/strings";
import { roleDescription, roleName } from "../lib/role-name";

/**
 * The dictionary is data a person edits by hand, in two scripts, across seven
 * files. The mistakes that matter are the silent ones: a `{count}` that became
 * `{गन्ती}` in the Nepali renders the literal braces on a shopkeeper's screen;
 * a Devanagari digit slips past the house rule; an area file that forgot to be
 * spread into the index leaves every key in it falling back to English. None of
 * those fail to compile. They fail here.
 */
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("seller dictionary", () => {
  const entries = Object.entries(strings);

  it("is assembled from every area file", () => {
    for (const prefix of [
      "register.",
      "settings.",
      "team.",
      "promo.",
      "product.",
      "delivery.",
      "queue.",
    ]) {
      assert.ok(
        entries.some(([key]) => key.startsWith(prefix)),
        `no ${prefix}* keys — is its file spread into lib/strings/index.ts?`,
      );
    }
  });

  it("has English for every key", () => {
    for (const [key, entry] of entries) assert.ok(entry.en?.trim(), `${key} has no English`);
  });

  it("keeps the same placeholders in Nepali as in English", () => {
    for (const [key, entry] of entries) {
      if (!entry.np || !entry.en) continue;
      assert.deepEqual(placeholders(entry.np), placeholders(entry.en), key);
    }
  });

  it("writes numbers with Western digits", () => {
    for (const [key, entry] of entries) {
      if (entry.np) assert.doesNotMatch(entry.np, /[०-९]/, key);
    }
  });

  it("is mostly Nepali — a guard against a whole area losing its translations", () => {
    const translated = entries.filter(([, e]) => e.np).length;
    assert.ok(translated / entries.length > 0.95, `${translated} of ${entries.length} have Nepali`);
  });
});

describe("roleName", () => {
  const t = (key: string, vars?: Record<string, string | number>, fallback?: string) =>
    translate(strings, "np", key, vars, fallback);

  it("translates a ready-made template", () => {
    assert.equal(
      roleName({ name: "Owner", shopId: null, description: "Full control of the shop" }, t),
      "मालिक",
    );
    assert.equal(
      roleDescription(
        { name: "Manager", shopId: null, description: "Runs day-to-day operations" },
        t,
      ),
      "दैनिक काम चलाउँछ",
    );
  });

  it("translates a membership's role, which has only a name", () => {
    assert.equal(roleName({ name: "Delivery" }, t), "डेलिभरी");
  });

  it("translates a shop's copy while it is still the template word for word", () => {
    assert.equal(
      roleName({ name: "Manager", shopId: "s1", description: "Runs day-to-day operations" }, t),
      "म्यानेजर",
    );
  });

  it("leaves a shop's own role exactly as the owner wrote it", () => {
    assert.equal(
      roleName({ name: "Manager", shopId: "s1", description: "Evenings only" }, t),
      "Manager",
    );
    assert.equal(roleName({ name: "Cashier", shopId: "s1", description: null }, t), "Cashier");
    assert.equal(
      roleDescription({ name: "Cashier", shopId: "s1", description: " Till " }, t),
      "Till",
    );
  });
});
