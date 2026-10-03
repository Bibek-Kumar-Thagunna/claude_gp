/**
 * Transport for every call a GoPasal browser console makes to the API.
 *
 * This file used to exist twice — once in `apps/web-seller/lib/api/http.ts` and
 * once in `apps/web-admin/lib/api/http.ts`, with a note in each saying a fix in
 * one had to be applied to the other. It is now here, once, and both consoles
 * import it. Nothing about the two copies differed except their comments.
 *
 * The env convention is `web-customer/lib/tracking.ts#apiBase()`'s, kept exactly:
 * `NEXT_PUBLIC_API_URL` holds the API **origin**, a `__PLACEHOLDER__` value
 * counts as unset, and trailing slashes are trimmed. The `/api/v1` part is
 * added here rather than being baked into the env var, because the server owns
 * that shape (`setGlobalPrefix('api')` + URI versioning, default version 1) and
 * a caller that hardcodes it in configuration will silently break on v2.
 *
 * `process.env.NEXT_PUBLIC_API_URL` is written as a literal member expression on
 * purpose: Next.js inlines that exact text at build time, so reading it through
 * a variable or `globalThis.process` would leave it `undefined` in the browser.
 *
 * Everything in this file is transport only: no React, no storage, no domain
 * types. Authentication is layered on top by `session.ts`.
 */

/** API origin, or `null` when the console has not been pointed at an API yet. */
export function apiOrigin(): string | null {
  const url = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!url || url.startsWith("__")) return null;
  return url.replace(/\/+$/, "");
}

/** Versioned root, e.g. `http://localhost:4000/api/v1`. */
export function apiRoot(): string | null {
  const origin = apiOrigin();
  return origin ? `${origin}/api/v1` : null;
}

/** True when the console is configured to talk to a real API. */
export function apiConfigured(): boolean {
  return apiOrigin() !== null;
}

/**
 * The message shown when nothing is configured. This is deliberately not a
 * fallback to sample data: someone who thinks they filed an application — or
 * approved one — that never left the browser is worse off than someone who is
 * told to fix the setup.
 */
export const NO_API_MESSAGE =
  "This console is not connected to the GoPasal API. Set NEXT_PUBLIC_API_URL and reload.";

/**
 * A failed API call, carrying the whole error envelope.
 *
 * The API answers refusals with `{ statusCode, error, message, ...extras }`,
 * where `extras` is machine-readable detail the handler attached — for a refused
 * onboarding submit or a refused approval that is `missing` and
 * `missingDocuments`, i.e. exactly what the applicant still owes. Those keys are
 * the reason this class exists instead of `throw new Error(message)`: the wizard
 * and the review screen have to name the absent fields and document slots, and a
 * flattened sentence cannot do that.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly kind: string;
  /** Every non-envelope key from the response body. */
  readonly details: Record<string, unknown>;
  /** Set when the failure was the network or CORS, not an HTTP status. */
  readonly offline: boolean;

  constructor(init: {
    status: number;
    kind?: string;
    message: string;
    details?: Record<string, unknown>;
    offline?: boolean;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.kind = init.kind ?? "Error";
    this.details = init.details ?? {};
    this.offline = init.offline ?? false;
  }

  /** A `string[]` detail key (`missing`, `missingDocuments`), or `[]`. */
  list(key: string): string[] {
    const raw = this.details[key];
    if (!Array.isArray(raw)) return [];
    return raw.filter((v): v is string => typeof v === "string");
  }

  get isAuth(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** A conflict means the server's state moved on — the UI should re-read. */
  get isConflict(): boolean {
    return this.status === 409;
  }

  get isValidation(): boolean {
    return this.status === 400 || this.status === 413 || this.status === 422;
  }
}

const ENVELOPE_KEYS = new Set(["statusCode", "error", "message", "path", "timestamp"]);

/** `message` may be a string or ValidationPipe's `string[]`. */
function readMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const msg = (body as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
    if (Array.isArray(msg)) {
      const lines = msg.filter((m): m is string => typeof m === "string");
      if (lines.length) return lines.join(" ");
    }
    const err = (body as { error?: unknown }).error;
    if (typeof err === "string" && err.trim()) return err;
  }
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status >= 500) return "The GoPasal API had a problem. Please try again in a moment.";
  return `Request failed (${status}).`;
}

function readDetails(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (!ENVELOPE_KEYS.has(key)) out[key] = value;
  }
  return out;
}

async function readBody(res: Response): Promise<unknown> {
  const type = res.headers.get("content-type") ?? "";
  try {
    if (type.includes("json")) return await res.json();
    const text = await res.text();
    return text ? { message: text } : null;
  } catch {
    return null;
  }
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Serialised as JSON. Ignored when `form` is given. */
  body?: unknown;
  /** Sent as multipart; the browser sets the boundary, so we must not. */
  form?: FormData;
  /** Bearer token to send, when the route needs one. */
  token?: string | null;
  signal?: AbortSignal;
  headers?: Record<string, string>;
};

/**
 * One request, no auth logic. Returns `undefined` for 204/empty bodies, so
 * callers that expect nothing can type themselves as `Promise<void>`.
 */
export async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const root = apiRoot();
  if (!root) {
    throw new ApiError({ status: 0, kind: "NotConfigured", message: NO_API_MESSAGE, offline: true });
  }

  const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let payload: BodyInit | undefined;
  if (options.form) {
    payload = options.form;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(options.body);
  }

  let res: Response;
  try {
    res = await fetch(`${root}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: payload,
      signal: options.signal,
      cache: "no-store",
      // Browser refresh tokens are host-only HttpOnly cookies. Native clients
      // use a separate transport and continue to send refresh tokens directly.
      credentials: "include",
    });
  } catch (err) {
    // An aborted request is the caller unmounting, not a failure to report.
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError({
      status: 0,
      kind: "NetworkError",
      message: "Could not reach the GoPasal API. Check your connection and try again.",
      offline: true,
    });
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    if (res.ok) return undefined as T;
  }

  const body = await readBody(res);
  if (!res.ok) {
    const kind = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
    throw new ApiError({
      status: res.status,
      kind: typeof kind === "string" ? kind : "Error",
      message: readMessage(body, res.status),
      details: readDetails(body),
    });
  }
  return body as T;
}

/** Absolute URL for a route that returns bytes rather than JSON. */
export function apiUrl(path: string): string {
  const root = apiRoot();
  return root ? `${root}${path}` : path;
}

/**
 * One request for *bytes* — a KYC document, a photo — rather than JSON.
 *
 * It exists because {@link rawRequest} always parses the body, so anything binary
 * had to be fetched by hand. Two consoles did exactly that, and in doing so
 * stepped around the refresh rule in `session.ts`: they read the access token
 * once, sent it raw, and turned the resulting 401 into "could not open the
 * document". A reviewer who had been reading an application for a quarter of an
 * hour was told the file was unavailable when the only thing that had expired was
 * their token. Downloads now go through the same door as everything else.
 *
 * A refusal is still an {@link ApiError} built from the JSON envelope, because the
 * API answers a rejected download with JSON even though a successful one is bytes.
 */
export async function rawBlobRequest(path: string, options: RequestOptions = {}): Promise<Blob> {
  const root = apiRoot();
  if (!root) {
    throw new ApiError({ status: 0, kind: "NotConfigured", message: NO_API_MESSAGE, offline: true });
  }

  const headers: Record<string, string> = { ...options.headers };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let res: Response;
  try {
    res = await fetch(`${root}${path}`, {
      method: options.method ?? "GET",
      headers,
      signal: options.signal,
      cache: "no-store",
      credentials: "include",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError({
      status: 0,
      kind: "NetworkError",
      message: "Could not reach the GoPasal API. Check your connection and try again.",
      offline: true,
    });
  }

  if (!res.ok) {
    const body = await readBody(res);
    const kind = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
    throw new ApiError({
      status: res.status,
      kind: typeof kind === "string" ? kind : "Error",
      message: readMessage(body, res.status),
      details: readDetails(body),
    });
  }
  return await res.blob();
}
