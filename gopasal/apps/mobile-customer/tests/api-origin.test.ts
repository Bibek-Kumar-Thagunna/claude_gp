import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { metroHost, resolveApiOrigin } from "../lib/api-origin";

/**
 * Which server the build talks to.
 *
 * This was `http://localhost:4000` hardcoded, which on a handset is the
 * handset — a bug that is invisible on the web export and total on a phone.
 * These are the cases that made it worth extracting.
 */

describe("resolveApiOrigin", () => {
  it("uses the configured URL when the build has one", () => {
    assert.equal(
      resolveApiOrigin({ apiUrl: "https://api.gopasal.com", platform: "android" }),
      "https://api.gopasal.com",
    );
  });

  it("strips trailing slashes, so paths do not double up", () => {
    assert.equal(
      resolveApiOrigin({ apiUrl: "https://api.gopasal.com///", platform: "ios" }),
      "https://api.gopasal.com",
    );
  });

  it("ignores an empty object, which is how Expo serialises an absent value", () => {
    // Truthy, and with no `.replace` — this threw on the first request before
    // the check became a `typeof`.
    assert.equal(
      resolveApiOrigin({ apiUrl: {}, hostUri: "192.168.1.24:8081", platform: "android" }),
      "http://192.168.1.24:4000",
    );
  });

  it("ignores a blank string", () => {
    assert.equal(
      resolveApiOrigin({ apiUrl: "   ", hostUri: "10.0.0.5:8081", platform: "ios" }),
      "http://10.0.0.5:4000",
    );
  });

  it("derives the laptop's address from the Metro host on a device", () => {
    assert.equal(
      resolveApiOrigin({ hostUri: "192.168.1.24:8081", platform: "android" }),
      "http://192.168.1.24:4000",
    );
  });

  it("uses localhost on web, where the page and the API share a machine", () => {
    assert.equal(
      resolveApiOrigin({ hostUri: "192.168.1.24:8081", platform: "web" }),
      "http://localhost:4000",
    );
  });

  it("says so once when there is nothing to go on", () => {
    let told = 0;
    const out = resolveApiOrigin({ platform: "android", onUnresolved: () => (told += 1) });
    assert.equal(out, "http://localhost:4000");
    assert.equal(told, 1, "a device pointed at itself must not fail silently");
  });

  it("does not complain when it resolved something", () => {
    let told = 0;
    resolveApiOrigin({ hostUri: "192.168.1.24:8081", platform: "ios", onUnresolved: () => (told += 1) });
    resolveApiOrigin({ apiUrl: "https://api.gopasal.com", platform: "ios", onUnresolved: () => (told += 1) });
    assert.equal(told, 0);
  });
});

describe("metroHost", () => {
  it("takes the host out of a Metro address", () => {
    assert.equal(metroHost("192.168.1.24:8081"), "192.168.1.24");
  });

  it("copes with a path and with no port", () => {
    assert.equal(metroHost("192.168.1.24:8081/_expo/loading"), "192.168.1.24");
    assert.equal(metroHost("192.168.1.24"), "192.168.1.24");
  });

  it("is null for nothing, rather than an empty host", () => {
    assert.equal(metroHost(undefined), null);
    assert.equal(metroHost(null), null);
    assert.equal(metroHost(""), null);
    assert.equal(metroHost(":8081"), null);
  });
});
