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
 * ## Why the tokens are in `localStorage`
 *
 * The API hands out bearer tokens in the response body (`POST /auth/otp/verify`)
 * and reads them from the `Authorization` header — there is no cookie in the
 * design, so the browser has to keep them somewhere reachable by JavaScript.
 * `localStorage` is chosen over `sessionStorage` so that a shopkeeper filling in
 * an application, or a reviewer working through a queue, is not signed out by
 * closing a tab, and over an in-memory store because a page reload would then end
 * the session mid-task.
 *
 * That choice is exposed to XSS by construction, and the mitigations that make it
 * acceptable are all server-side and already built: refresh tokens are single-use
 * and rotate on every refresh, replaying an old one is detected and revokes the
 * whole session, and the access token lives 15 minutes. An httpOnly cookie is the
 * right end state — especially for a console with privileged permissions — and it
 * needs an API change (a `Set-Cookie` on verify/refresh plus CSRF protection). It
 * is recorded as a follow-up rather than faked here.
 *
 * ## Refreshing
 *
 * One in-flight refresh at a time, per store. Ten components mounting at once
 * must not send ten refreshes, because the server rotates the token on each one
 * and nine of them would be treated as replay — which revokes the session.
 * `refreshing` holds the single promise everyone awaits.
 */

import { ApiError, rawBlobRequest, rawRequest, type RequestOptions } from "./http";
import type { ApiUser, TokenPair } from "./types";

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
export function createSessionStore(config: { storageKey: string }): SessionStore {
  const { storageKey } = config;

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
      return isSession(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function write(session: Session | null): void {
    if (typeof window === "undefined") return;
    try {
      if (session) window.localStorage.setItem(storageKey, JSON.stringify(session));
      else window.localStorage.removeItem(storageKey);
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
        body: { refreshToken: session.refreshToken },
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
