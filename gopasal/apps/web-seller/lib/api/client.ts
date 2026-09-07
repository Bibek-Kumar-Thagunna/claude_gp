/**
 * The seller console's one instance of the shared API client.
 *
 * `@gopasal/api-client` owns the transport, the token store, the refresh rule and
 * the OTP exchange; this file is the only place that says *which* console is
 * calling. Two values differ from the admin console and nothing else does:
 *
 * - `storageKey` — a distinct `localStorage` slot, so signing into the seller
 *   console on a machine never disturbs an admin session or vice versa.
 * - `surface` — recorded on the session server-side, which is what makes a seller
 *   sign-in distinguishable from a staff sign-in in the session list and the
 *   audit trail.
 *
 * Instantiated once, at module scope, because the store caches the session and
 * holds the single in-flight refresh promise. A second instance on the same key
 * would drift from the first.
 */

import { ApiError, createApiClient } from "@gopasal/api-client";

const api = createApiClient({ storageKey: "gp-seller-session", surface: "seller" });

export const {
  getSession,
  setSession,
  clearSession,
  sessionFrom,
  subscribe,
  watchStorage,
  refreshSession,
  authedRequest,
  authedBlob,
  requestOtp,
  verifyOtp,
  fetchMe,
  revokeSession,
} = api;

/**
 * Any thrown value, as the `ApiError` the error panels render.
 *
 * Every screen holds its failure as `ApiError | null` and treats `null` as "nothing
 * went wrong". So `catch (err) { setError(err instanceof ApiError ? err : null) }` —
 * which is what eight of them used to do — turns anything that is not an `ApiError`
 * into *success with no data*: the panel disappears and an empty list is rendered as
 * though the shop had nothing in it. That is exactly the substitution the console is
 * not allowed to make.
 *
 * `rawRequest` only ever throws `ApiError` or an `AbortError`, so the reachable
 * non-`ApiError` case is a bug on our side of the boundary — a view-model mapper
 * throwing on a shape the API changed, most likely — and that is precisely the
 * failure that must not be shown as "no results". `status: 0` is the same marker the
 * transport uses for "never got an HTTP answer".
 *
 * Callers must still return early on an abort before calling this: a cancelled
 * request is not a failure and has no error to show.
 */
export function asApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  return new ApiError({
    status: 0,
    kind: "ClientError",
    message: err instanceof Error && err.message ? err.message : String(err),
  });
}
