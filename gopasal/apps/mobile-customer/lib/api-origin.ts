/**
 * Which API this build talks to.
 *
 * Staging and production carry a real URL from `app.config.ts` and this is a
 * one-line lookup. Development is the interesting case.
 *
 * A dev build runs on a handset, on the same wifi as the laptop running the
 * API. `http://localhost:4000` on that handset is the handset, so the app talks
 * to nothing — and the failure looks like "the network is down", not like a
 * configuration mistake, which is why it survives so long. The laptop's LAN
 * address is the right answer and it changes with the network, so hardcoding it
 * only moves the problem.
 *
 * Expo already knows that address: Metro told the app where to fetch its own
 * bundle from. `hostUri` is `192.168.1.24:8081`, so the API is the same host on
 * the API's port. Nothing to configure, and it follows the laptop from a café
 * to the office.
 *
 * Deliberately not a fallback chain that ends in localhost on a device: if the
 * host cannot be worked out, the app says so once in the log rather than
 * quietly pointing at itself.
 */

export const DEV_API_PORT = 4000;

export type ApiOriginInputs = {
  /** `extra.apiUrl` from the build, absent in development by design. */
  apiUrl?: unknown;
  /** `expoConfig.hostUri` — "192.168.1.24:8081" — absent in a store build. */
  hostUri?: string | null;
  platform: "web" | "ios" | "android" | string;
  /** Called once, by the caller's choice, when there is nothing to go on. */
  onUnresolved?: () => void;
};

/**
 * Pure: everything this needs is handed to it.
 *
 * The inputs come from `expo-constants` and `react-native`, neither of which
 * loads outside an app, and the rule they feed is the one that decides whether
 * a build can reach its server at all. Keeping the rule separate from the
 * globals is what makes it checkable.
 */
export function resolveApiOrigin(inputs: ApiOriginInputs): string {
  // `typeof`, not truthiness: Expo serialises an absent `extra` value as `{}`,
  // and an empty object is truthy but has no `.replace`.
  const { apiUrl, hostUri, platform, onUnresolved } = inputs;
  if (typeof apiUrl === "string" && apiUrl.trim().length > 0) {
    return apiUrl.trim().replace(/\/+$/, "");
  }

  // Development. On web the page and the API share a machine, so localhost is
  // both correct and the only thing a browser will allow without CORS pain.
  if (platform === "web") return `http://localhost:${DEV_API_PORT}`;

  const host = metroHost(hostUri);
  if (host) return `http://${host}:${DEV_API_PORT}`;

  onUnresolved?.();
  return `http://localhost:${DEV_API_PORT}`;
}

/**
 * The host part of a Metro address.
 *
 * `hostUri` is `192.168.1.24:8081`, sometimes with a path, occasionally with
 * no port at all. Everything after the first `/` or `:` goes.
 */
export function metroHost(hostUri?: string | null): string | null {
  if (!hostUri) return null;
  const host = hostUri.split("/")[0]?.split(":")[0]?.trim();
  return host && host.length > 0 ? host : null;
}
