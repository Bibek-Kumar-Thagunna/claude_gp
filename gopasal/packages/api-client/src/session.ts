/**
 * The signed-in user's session: where the tokens live, how they are refreshed,
 * and the one function every authenticated call goes through.
 *
 * `createSessionStore` exists rather than a set of module-level functions because
 * the *only* thing that differed between the seller and admin copies of this file
 * was the `localStorage` key. Making that an argument removes the duplication
 * without pretending the two consoles share a session: each app instantiates one
 * store with its own key, so signing into the admin console on a machine never
 * disturbs a seller session and vice versa. Each store keeps its own module-free
 * closure state — one cache, one listener set, one in-flight refresh.
 *
 * ## What is persisted
 *
 * Browser clients use a host-only HttpOnly, SameSite=Strict refresh cookie. The
 * live access token stays in this module's closure and neither bearer token is
 * written to web storage. `localStorage` contains only the user snapshot plus
 * blank token fields, which lets the UI restore its signed-in shell after a tab
 * closes; the first authenticated call then rotates the cookie and obtains a new
 * short-lived access token. Native clients do not use this store and keep their
 * refresh tokens in operating-system secure storage.
 *
 * ## Refreshing
 *
 * One in-flight refresh at a time, per store. Ten components mounting at once
 * must not send ten refreshes, because the server rotates the token on each one
 * and nine of them would be treated as replay — which revokes the session.
 * `refreshing` holds the single promise everyone awaits.
 */

import { ApiError, rawBlobRequest, rawRequest, type RequestOptions } from "./http";
import type { ApiUser, AuthSurface, TokenPair } from "./types";

/** Refresh this far ahead of expiry so a request never races the clock. */
const REFRESH_SKEW_MS = 30_000;

export type Session = {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms at which the access token stops being accepted. */
  accessExpiresAt: number;
  user: ApiUser;
};

type Listener = (session: Session | null) => void;

export type SessionStore = {
  /** The session as currently known, loading it from storage on first use. */
  getSession: () => Session | null;
  setSession: (next: Session | null) => void;
  clearSession: () => void;
  /** Build a session from a fresh token pair. */
  sessionFrom: (tokens: TokenPair, user: ApiUser) => Session;
  subscribe: (listener: Listener) => () => void;
  /** Keep tabs in step; returns the unsubscribe function. */
  watchStorage: () => () => void;
  refreshSession: () => Promise<Session | null>;
  authedRequest: <T>(path: string, options?: RequestOptions) => Promise<T>;
  /** For routes that answer with bytes; same refresh rule as `authedRequest`. */
  authedBlob: (path: string, options?: RequestOptions) => Promise<Blob>;
};

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<Session>;
  return (
    typeof v.accessToken === "string" &&
    typeof v.refreshToken === "string" &&
    typeof v.accessExpiresAt === "number" &&
    !!v.user &&
    typeof v.user === "object" &&
    typeof (v.user as ApiUser).id === "string"
  );
}

const UNAUTHENTICATED = new ApiError({
  status: 401,
  kind: "Unauthorized",
  message: "Please sign in to continue.",
});

/**
 * One session store, keyed by `storageKey`. Call this once per app — two stores
 * on the same key would each hold their own cache of the same slot and drift.
 */
export function createSessionStore(config: {
  storageKey: string;
  cookieRefresh?: boolean;
  surface?: AuthSurface;
}): SessionStore {
  const { storageKey, cookieRefresh = false, surface } = config;

  let current: Session | null = null;
  let loaded = false;
  let refreshing: Promise<Session | null> | null = null;
  const listeners = new Set<Listener>();

  function read(): Session | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!isSession(parsed)) return null;
      if (!cookieRefresh) return parsed;
      // One-time migration from the old bearer-in-localStorage design. Existing
      // sessions must sign in again because JavaScript cannot mint an HttpOnly
      // cookie, but the old credentials are removed immediately on first load.
      const sanitized = { ...parsed, accessToken: "", refreshToken: "", accessExpiresAt: 0 };
      if (parsed.accessToken || parsed.refreshToken || parsed.accessExpiresAt !== 0) {
        window.localStorage.setItem(storageKey, JSON.stringify(sanitized));
      }
      return sanitized;
    } catch {
      return null;
    }
  }

  function write(session: Session | null): void {
    if (typeof window === "undefined") return;
    try {
      if (session) {
        // Persist only enough to restore the signed-in UI. In browser-cookie
        // mode neither bearer token is readable from storage; the first API
        // call after a reload rotates the HttpOnly refresh cookie.
        const stored = cookieRefresh
          ? { ...session, accessToken: "", refreshToken: "", accessExpiresAt: 0 }
          : session;
        window.localStorage.setItem(storageKey, JSON.stringify(stored));
      } else window.localStorage.removeItem(storageKey);
    } catch {
      /* private mode / quota — the session then lasts only as long as this page */
    }
  }

  function emit(): void {
    for (const listener of listeners) listener(current);
  }

  function getSession(): Session | null {
    if (!loaded) {
      current = read();
      loaded = true;
    }
    return current;
  }

  function setSession(next: Session | null): void {
    current = next;
    loaded = true;
    write(next);
    emit();
  }

  function clearSession(): void {
    setSession(null);
  }

  function sessionFrom(tokens: TokenPair, user: ApiUser): Session {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessExpiresAt: Date.now() + Math.max(0, tokens.expiresIn) * 1000,
      user,
    };
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  /**
   * Signing out in one tab must not leave another tab holding a token it will
   * only discover is dead on the next click.
   */
  function watchStorage(): () => void {
    if (typeof window === "undefined") return () => undefined;
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== storageKey) return;
      current = read();
      loaded = true;
      emit();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }

  /**
   * Exchange the refresh token for a new pair. Resolves to `null` when the
   * session is gone for good, in which case it has already been cleared.
   */
  async function runRefresh(session: Session): Promise<Session | null> {
    try {
      const pair = await rawRequest<TokenPair>("/auth/refresh", {
        method: "POST",
        body: cookieRefresh ? {} : { refreshToken: session.refreshToken },
        ...(cookieRefresh
          ? {
              headers: {
                "X-GoPasal-Auth-Mode": "cookie",
                ...(surface ? { "X-GoPasal-Auth-Surface": surface } : {}),
              },
            }
          : {}),
      });
      const next = sessionFrom(pair, session.user);
      setSession(next);
      return next;
    } catch (err) {
      // A network blip must not sign anyone out — only the server saying the
      // token is no good does that.
      if (err instanceof ApiError && err.offline) throw err;
      clearSession();
      return null;
    }
  }

  function refreshSession(): Promise<Session | null> {
    const session = getSession();
    if (!session) return Promise.resolve(null);
    if (!refreshing) {
      refreshing = runRefresh(session).finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  /**
   * An authenticated call: refresh first if the access token is about to expire,
   * and retry exactly once if the server rejects it anyway (clock skew, or a
   * session revoked and re-established in another tab).
   *
   * Written once, over a `run(token)` callback, so that a JSON request and a byte
   * download cannot drift apart on *when* they refresh. They did drift: document
   * downloads used to read the token by hand and never refresh at all.
   */
  async function withFreshToken<T>(run: (token: string) => Promise<T>): Promise<T> {
    let session = getSession();
    if (!session) throw UNAUTHENTICATED;

    if (session.accessExpiresAt - Date.now() < REFRESH_SKEW_MS) {
      session = await refreshSession();
      if (!session) throw UNAUTHENTICATED;
    }

    try {
      return await run(session.accessToken);
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) throw err;
      const renewed = await refreshSession();
      if (!renewed) throw UNAUTHENTICATED;
      return await run(renewed.accessToken);
    }
  }

  function authedRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return withFreshToken((token) => rawRequest<T>(path, { ...options, token }));
  }

  /** The same rule, for a route that answers with bytes (a KYC document). */
  function authedBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
    return withFreshToken((token) => rawBlobRequest(path, { ...options, token }));
  }

  return {
    getSession,
    setSession,
    clearSession,
    sessionFrom,
    subscribe,
    watchStorage,
    refreshSession,
    authedRequest,
    authedBlob,
  };
}
