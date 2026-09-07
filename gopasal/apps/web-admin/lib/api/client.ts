/**
 * The admin console's one instance of the shared API client.
 *
 * `@gopasal/api-client` owns the transport, the token store, the refresh rule and
 * the OTP exchange; this file is the only place that says *which* console is
 * calling. Two values differ from the seller console and nothing else does:
 *
 * - `storageKey` — a distinct `localStorage` slot, so a staff member signing into
 *   the admin console on a machine never disturbs a seller session or vice versa.
 * - `surface` — recorded on the session server-side, which is what makes a staff
 *   sign-in distinguishable from a seller sign-in in the session list and the
 *   audit trail.
 *
 * Instantiated once, at module scope, because the store caches the session and
 * holds the single in-flight refresh promise. A second instance on the same key
 * would drift from the first.
 */

import { createApiClient } from "@gopasal/api-client";

const api = createApiClient({ storageKey: "gp-admin-session", surface: "admin" });

export const {
  getSession,
  setSession,
  clearSession,
  sessionFrom,
  subscribe,
  watchStorage,
  refreshSession,
  authedRequest,
  requestOtp,
  verifyOtp,
  fetchMe,
  revokeSession,
} = api;
