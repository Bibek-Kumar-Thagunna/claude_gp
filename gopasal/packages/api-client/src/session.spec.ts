import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createSessionStore, type Session } from "./session";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function installWindow(storage = new MemoryStorage()): MemoryStorage {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: storage,
      addEventListener() {},
      removeEventListener() {},
    },
  });
  return storage;
}

const liveSession: Session = {
  accessToken: "short-lived-access",
  refreshToken: "long-lived-refresh",
  accessExpiresAt: Date.now() + 60_000,
  user: {
    id: "user-1",
    phone: "9812345678",
    email: null,
    name: "Person",
    avatarUrl: null,
    locale: "en",
    isPlatformStaff: false,
  },
};

describe("browser session storage", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("keeps live tokens in memory but persists neither bearer credential", () => {
    const storage = installWindow();
    const store = createSessionStore({ storageKey: "session", cookieRefresh: true });
    store.setSession(liveSession);

    assert.equal(store.getSession()?.accessToken, "short-lived-access");
    const persisted = JSON.parse(storage.getItem("session") ?? "null") as Session;
    assert.equal(persisted.accessToken, "");
    assert.equal(persisted.refreshToken, "");
    assert.equal(persisted.accessExpiresAt, 0);
    assert.equal(persisted.user.id, "user-1");
  });

  it("scrubs tokens left by the previous localStorage design on first read", () => {
    const storage = installWindow();
    storage.setItem("session", JSON.stringify(liveSession));
    const store = createSessionStore({ storageKey: "session", cookieRefresh: true });

    assert.equal(store.getSession()?.refreshToken, "");
    const persisted = JSON.parse(storage.getItem("session") ?? "null") as Session;
    assert.equal(persisted.accessToken, "");
    assert.equal(persisted.refreshToken, "");
  });

  it("preserves the bearer-token behavior for explicitly non-cookie consumers", () => {
    const storage = installWindow();
    const store = createSessionStore({ storageKey: "session" });
    store.setSession(liveSession);

    const persisted = JSON.parse(storage.getItem("session") ?? "null") as Session;
    assert.equal(persisted.accessToken, "short-lived-access");
    assert.equal(persisted.refreshToken, "long-lived-refresh");
  });
});
