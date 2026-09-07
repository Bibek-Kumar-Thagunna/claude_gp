/**
 * Auth endpoints — `apps/api/src/auth/auth.controller.ts`.
 *
 * There is one phone + OTP exchange for the whole platform: no separate staff
 * credential store, and platform access decided entirely by the memberships
 * `GET /auth/me` reports. The only per-console difference is the `surface`
 * recorded on the session server-side, which is why `createAuthClient` takes it
 * as an argument — a sign-in to the admin console stays distinguishable in the
 * session list and the audit trail without the endpoint code existing twice.
 *
 * The OTP code is never in a response; `requestOtp` only reports that a challenge
 * was created, for how long, and whether an SMS was actually delivered. With
 * `SMS_PROVIDER=log` (the local default) `delivered` is false and the code is
 * printed in the API log — the login screen says exactly that rather than
 * implying a text is in flight.
 */

import { rawRequest, type RequestOptions } from "./http";
import type {
  AuthSurface,
  MeResult,
  RequestOtpResult,
  VerifyOtpResult,
} from "./types";

/** Digits only, no country code — the API normalises to `98XXXXXXXX`. */
export function normalisePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  const withoutCountry = digits.startsWith("977") ? digits.slice(3) : digits;
  return withoutCountry.length === 11 && withoutCountry.startsWith("0")
    ? withoutCountry.slice(1)
    : withoutCountry;
}

/** The client-side half of the API's own rule (`/^9\d{9}$/`). */
export function isValidNepalMobile(input: string): boolean {
  return /^9\d{9}$/.test(normalisePhone(input));
}

export type AuthClient = {
  requestOtp: (phone: string, purpose?: string) => Promise<RequestOtpResult>;
  verifyOtp: (phone: string, code: string) => Promise<VerifyOtpResult>;
  /** Whoever the access token belongs to, plus their resolved permissions. */
  fetchMe: (signal?: AbortSignal) => Promise<MeResult>;
  revokeSession: (refreshToken: string) => Promise<{ ok: true }>;
};

/**
 * `authedRequest` is injected rather than imported so that this module has no
 * opinion about which session store it belongs to — the app wires its one store
 * to its one auth client in `lib/api/client.ts`.
 */
export function createAuthClient(config: {
  surface: AuthSurface;
  authedRequest: <T>(path: string, options?: RequestOptions) => Promise<T>;
}): AuthClient {
  const { surface, authedRequest } = config;

  return {
    requestOtp(phone, purpose = "login") {
      return rawRequest<RequestOtpResult>("/auth/otp/request", {
        method: "POST",
        body: { phone: normalisePhone(phone), purpose },
      });
    },

    verifyOtp(phone, code) {
      return rawRequest<VerifyOtpResult>("/auth/otp/verify", {
        method: "POST",
        body: { phone: normalisePhone(phone), code, purpose: "login", surface },
      });
    },

    fetchMe(signal) {
      return authedRequest<MeResult>("/auth/me", { signal });
    },

    /**
     * Revoke the session server-side. Public route (it takes the refresh token in
     * the body) and idempotent, so a token the server has already retired is not
     * an error — which is why the caller can sign out locally regardless of the
     * result.
     */
    revokeSession(refreshToken) {
      return rawRequest<{ ok: true }>("/auth/logout", {
        method: "POST",
        body: { refreshToken },
      });
    },
  };
}
