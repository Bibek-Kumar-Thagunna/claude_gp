/**
 * Every request the app makes to the GoPasal API.
 *
 * The web client (`@gopasal/api-client`) cannot be reused as-is for two
 * reasons, both structural rather than stylistic: it reads
 * `process.env.NEXT_PUBLIC_API_URL` as a literal member expression because Next
 * inlines that exact text at build time, and it keeps tokens in `localStorage`.
 * Neither exists here. What *is* reused is the wire contract — the types come
 * from that package, so the phone and the browser cannot drift about what the
 * server sends.
 *
 * What this adds, which a browser client does not need:
 *
 *  - **A timeout on every request.** Without one, a request on a dead-but-open
 *    socket — the normal failure mode of a phone that has walked out of range —
 *    hangs until the OS gives up, which can be minutes. The user sees a spinner
 *    and concludes the app is broken.
 *  - **Retry with backoff and jitter, for idempotent verbs only.** A GET that
 *    fails on a patchy link usually succeeds a second later. A POST must never
 *    be retried blindly, because a lost *reply* is indistinguishable from a lost
 *    *request* and the server may already have acted on it. Writes retry only
 *    when the caller supplies an idempotency key, which makes the repeat safe
 *    on the server side.
 *  - **One refresh at a time.** Ten screens mounting at once must not send ten
 *    refreshes: the server rotates the refresh token on each use and treats a
 *    replay as theft, revoking the whole session. Everyone awaits one promise.
 */
import type { ApiUser, TokenPair, VerifyOtpResult } from "@gopasal/api-client/types";

export type { ApiUser, TokenPair, VerifyOtpResult };

/** How long any single attempt may take before it is abandoned. */
const REQUEST_TIMEOUT_MS = 15_000;
/** Reads get this many attempts in total, including the first. */
const MAX_ATTEMPTS = 3;
/** Refresh this far ahead of expiry so a request never races the clock. */
const REFRESH_SKEW_MS = 30_000;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
    /** Field-level detail the API attaches below 500, e.g. `missing`. */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True when trying again later could plausibly succeed. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }

  /** True when the session is the problem and re-authenticating is the fix. */
  get isAuth(): boolean {
    return this.status === 401;
  }
}

/** Thrown when the device is offline and the caller asked not to queue. */
export class OfflineError extends ApiError {
  constructor() {
    super(0, "You're offline. This will be sent when you're back online.");
    this.name = "OfflineError";
  }
}

export type Session = {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms at which the access token stops being accepted. */
  accessExpiresAt: number;
  user: ApiUser;
};

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Skip the Authorization header — for the OTP endpoints. */
  anonymous?: boolean;
  /**
   * Makes a write safely repeatable. The server keys on it and hands back the
   * entity it already created rather than creating another one, so a retry
   * after a lost reply cannot place a second order.
   */
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Attempts for idempotent requests. Writes without a key never retry. */
  maxAttempts?: number;
};

export type HttpConfig = {
  /** API origin, e.g. `https://api.gopasal.com`. No trailing slash, no path. */
  origin: string;
  /** Reads the stored session, or null when signed out. */
  getSession: () => Session | null;
  /** Persists a rotated session, or clears it when null. */
  setSession: (session: Session | null) => void | Promise<void>;
  /** Called when the session is gone for good and the UI must sign out. */
  onSignOut?: () => void;
  /** False stops a request before it is attempted. */
  isConnected?: () => boolean;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Backoff with jitter.
 *
 * The jitter is the point. When a cell tower comes back, every phone that was
 * waiting retries — and if they all wait exactly 400ms then 800ms then 1600ms,
 * they arrive in synchronised waves that knock the API over precisely when it is
 * recovering. Spreading each client randomly across its window turns a wave into
 * a trickle.
 */
function backoffMs(attempt: number): number {
  const base = Math.min(400 * 2 ** (attempt - 1), 4_000);
  return base * (0.5 + Math.random() * 0.5);
}

export function createHttp(config: HttpConfig) {
  const root = () => `${config.origin.replace(/\/+$/, "")}/api/v1`;

  /** The single in-flight refresh, shared by every caller that needs one. */
  let refreshing: Promise<Session | null> | null = null;

  async function refreshSession(): Promise<Session | null> {
    const current = config.getSession();
    if (!current) return null;
    if (refreshing) return refreshing;

    refreshing = (async () => {
      try {
        const res = await fetch(`${root()}/auth/refresh`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ refreshToken: current.refreshToken }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!res.ok) {
          // A refused refresh is terminal: the token was rotated, revoked or
          // expired, and no amount of retrying changes that.
          if (res.status === 401 || res.status === 403) {
            await config.setSession(null);
            config.onSignOut?.();
          }
          return null;
        }
        // `/auth/refresh` returns the pair flat; `/auth/otp/verify` nests it.
        // That is the server's shape and it is kept rather than smoothed over.
        const pair = (await res.json()) as TokenPair;
        const next: Session = {
          accessToken: pair.accessToken,
          refreshToken: pair.refreshToken,
          accessExpiresAt: Date.now() + pair.expiresIn * 1000,
          user: current.user,
        };
        await config.setSession(next);
        return next;
      } catch {
        // A network failure during refresh is *not* a signed-out session — the
        // tokens may well still be good. Keep them and let the caller fail.
        return null;
      } finally {
        refreshing = null;
      }
    })();

    return refreshing;
  }

  async function authHeader(anonymous: boolean): Promise<Record<string, string>> {
    if (anonymous) return {};
    let session = config.getSession();
    if (!session) return {};
    if (session.accessExpiresAt - REFRESH_SKEW_MS <= Date.now()) {
      session = (await refreshSession()) ?? session;
    }
    return { authorization: `Bearer ${session.accessToken}` };
  }

  async function attempt<T>(path: string, options: RequestOptions): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
    // The caller's own abort (a screen unmounting, a search superseded) must
    // also cancel the request, so both signals feed the same controller.
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onExternalAbort);

    try {
      const res = await fetch(`${root()}${path}`, {
        method: options.method ?? "GET",
        headers: {
          ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
          ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
          ...(await authHeader(options.anonymous ?? false)),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });

      const text = await res.text();
      const parsed: unknown = text ? safeJson(text) : null;

      if (!res.ok) {
        const envelope = (parsed ?? {}) as Record<string, unknown>;
        const raw = envelope.message;
        const message = Array.isArray(raw)
          ? raw.filter((m): m is string => typeof m === "string").join("\n")
          : typeof raw === "string"
            ? raw
            : `Request failed (${res.status})`;
        const { statusCode, error, message: _m, path: _p, timestamp, ...details } = envelope;
        void statusCode;
        void error;
        void _m;
        void _p;
        void timestamp;
        throw new ApiError(res.status, message, parsed, details);
      }

      return parsed as T;
    } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      // Abort, DNS failure, refused connection, TLS error: from the user's side
      // these are one situation, and status 0 marks "never reached the server".
      const aborted = cause instanceof Error && cause.name === "AbortError";
      throw new ApiError(
        0,
        aborted ? "That took too long. Check your connection and try again." : "Couldn't reach GoPasal.",
      );
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onExternalAbort);
    }
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (config.isConnected && !config.isConnected()) throw new OfflineError();

    const method = options.method ?? "GET";
    const idempotent = method === "GET" || Boolean(options.idempotencyKey);
    const attempts = idempotent ? (options.maxAttempts ?? MAX_ATTEMPTS) : 1;

    let lastError: unknown;
    for (let i = 1; i <= attempts; i += 1) {
      try {
        return await attempt<T>(path, options);
      } catch (cause) {
        lastError = cause;
        if (!(cause instanceof ApiError)) throw cause;

        // 401 is worth exactly one more go, after refreshing — and only if the
        // refresh actually produced a new session.
        if (cause.isAuth && !options.anonymous && i === 1) {
          const refreshed = await refreshSession();
          if (refreshed) continue;
          config.onSignOut?.();
          throw cause;
        }

        if (!cause.retryable || i === attempts) throw cause;
        await sleep(backoffMs(i));
      }
    }
    throw lastError;
  }

  /**
   * Fetch a private image and hand it back as a data URI.
   *
   * The delivery-proof photo is authenticated — it is a picture of somebody's
   * doorstep, served only to that customer and that shop — so it cannot be
   * given to an `<Image source={{ uri }}>`, which would fetch it again without
   * the bearer token and get a 401. Reading it here and inlining the bytes is
   * the only way the component can show it at all.
   *
   * Returns null on 404, which is the ordinary case: most deliveries have no
   * photo, and that is not an error worth throwing over.
   */
  async function requestDataUri(path: string): Promise<string | null> {
    const headers = await authHeader(false);
    const res = await fetch(`${root()}${path}`, { headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new ApiError(res.status, `Could not load ${path}`);

    const type = res.headers.get("content-type") ?? "image/jpeg";
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    // Chunked, because spreading a multi-megabyte array into `apply` blows the
    // argument limit on exactly the large photos this is for.
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const base64 =
      typeof btoa === "function"
        ? btoa(binary)
        : // Hermes has global btoa; Node (the review harness) needs Buffer.
          (globalThis as { Buffer?: { from(s: string, e: string): { toString(e: string): string } } })
            .Buffer?.from(binary, "binary")
            .toString("base64") ?? "";

    return `data:${type};base64,${base64}`;
  }

  /**
   * The API origin, for the one client that is not HTTP: the realtime socket
   * connects to `<origin>/realtime` and must not be given a second copy of the
   * same configuration to drift from.
   */
  const origin = () => config.origin.replace(/\/+$/, "");

  return { request, requestDataUri, refreshSession, root, origin };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export type Http = ReturnType<typeof createHttp>;
