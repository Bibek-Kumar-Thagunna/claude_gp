import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { strings } from "../lib/strings";

/**
 * The rider dictionary: every key a screen asks for exists, in both
 * languages, with the same placeholders — the silent mistakes that compile.
 */
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("rider dictionary", () => {
  const entries = Object.entries(strings);
  const root = join(__dirname, "..");
  const files = [
    ...sources(join(root, "app")),
    ...sources(join(root, "components")),
    ...sources(join(root, "lib")).filter((f) => !f.includes("strings")),
    ...sources(join(root, "../../packages/native-ui/src")),
  ];

  it("has every key the screens ask for", () => {
    const missing = new Set<string>();
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)) if (!strings[m[1]!]) missing.add(m[1]!);
      for (const m of text.matchAll(/"((?:problem|handover\.who|notRider|tab)\.[a-zA-Z0-9.]+)"/g)) {
        if (!strings[m[1]!]) missing.add(m[1]!);
      }
    }
    assert.deepEqual([...missing], []);
  });

  it("names every vehicle", () => {
    for (const v of ["BICYCLE", "MOTORBIKE", "SCOOTER", "WALK", "VAN"]) assert.ok(strings[`vehicle.${v}`], v);
  });

  it("has English and Nepali for every rider key", () => {
    for (const [key, entry] of entries) {
      assert.ok(entry.en?.trim(), `${key} has no English`);
      if (key !== "auth.phone.placeholder") assert.ok(entry.np?.trim(), `${key} has no Nepali`);
    }
  });

  it("keeps the same placeholders in Nepali as in English", () => {
    for (const [key, entry] of entries) {
      if (entry.np) assert.deepEqual(placeholders(entry.np), placeholders(entry.en ?? ""), key);
    }
  });

  it("writes numbers with Western digits", () => {
    for (const [key, entry] of entries) if (entry.np) assert.doesNotMatch(entry.np, /[०-९]/, key);
  });
});
