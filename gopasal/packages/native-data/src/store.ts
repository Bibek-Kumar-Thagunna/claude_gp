/**
 * The key/value store the durable queue writes to.
 *
 * Narrowed to the three calls the outbox makes, and named as an interface
 * rather than imported as a module, for one reason: the outbox's whole job is
 * to survive things — a dropped request, the app being killed, the battery
 * going — and none of that can be tested against a store that only exists
 * inside a running React Native app. AsyncStorage is still the real
 * implementation; it is simply passed in rather than reached for.
 */
export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

/**
 * An in-memory store, for tests and for any runtime without persistence.
 *
 * Behaves like the real one including the part that matters: a value written
 * and read back is a *string*, so a test cannot accidentally pass by handing
 * an object around that the real store would have had to serialise.
 */
export function memoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const map = new Map(Object.entries(initial));
  return {
    async getItem(key) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    async setItem(key, value) {
      map.set(key, String(value));
    },
    async removeItem(key) {
      map.delete(key);
    },
  };
}
