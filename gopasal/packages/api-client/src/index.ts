/**
 * `@gopasal/api-client` — the browser half of the GoPasal API, shared by the
 * seller and admin consoles.
 *
 * What lives here is everything that was, until now, copied byte-for-byte between
 * the two apps: the transport, the error envelope, the token store, the refresh
 * rule, logout, and the wire types the API serialises identically for both.
 *
 * What deliberately does **not** live here is any single endpoint that belongs to
 * one surface. `/seller/onboarding/applications/*` stays in
 * `apps/web-seller/lib/api/onboarding.ts` and
 * `/admin/onboarding/applications/*` stays in
 * `apps/web-admin/lib/api/onboarding-review.ts`, each with its own view types.
 * A shared package that grew to know about both would just be the monolith again
 * with an extra directory.
 *
 * ## Using it
 *
 * Each app instantiates exactly once, in `lib/api/client.ts`:
 *
 * ```ts
 * export const api = createApiClient({ storageKey: "gp-admin-session", surface: "admin" });
 * ```
 *
 * Two things are configurable and nothing else. `storageKey` keeps the two
 * consoles' sessions apart on the same machine; `surface` is what the API records
 * against the session, so an admin sign-in is distinguishable in the session list
 * and the audit trail. Everything else is identical by design — if a third value
 * ever needs to differ per app, that is a signal the code belongs in the app.
 */

export {
  ApiError,
  NO_API_MESSAGE,
  apiConfigured,
  apiOrigin,
  apiRoot,
  apiUrl,
  rawBlobRequest,
  rawRequest,
  type RequestOptions,
} from "./http";

export {
  createSessionStore,
  type Session,
  type SessionStore,
} from "./session";

export {
  createAuthClient,
  isValidNepalMobile,
  normalisePhone,
  type AuthClient,
} from "./auth";

export {
  APPLICATION_STATUSES,
  AUTH_SURFACES,
  DOCUMENT_KINDS,
  PAYOUT_METHODS,
  SEARCH_MAX_LENGTH,
  type ApiUser,
  type ApplicationCategory,
  type ApplicationDocument,
  type ApplicationStatus,
  type AuthSurface,
  type DocumentKind,
  type DocumentReviewState,
  type MeResult,
  type Paginated,
  type PayoutMethod,
  type RequestOtpResult,
  type ShopAccess,
  type ShopLifecycle,
  type TokenPair,
  type VerifyOtpResult,
} from "./types";

import { createAuthClient, type AuthClient } from "./auth";
import { createSessionStore, type SessionStore } from "./session";
import type { AuthSurface } from "./types";

export type ApiClient = SessionStore & AuthClient;

/**
 * One session store plus one auth client, wired together.
 *
 * Returned flat rather than as `{ session, auth }` because callers do not care
 * which half a function came from — `authedRequest` and `fetchMe` are both just
 * "the API, as this signed-in user".
 */
export function createApiClient(config: {
  storageKey: string;
  surface: AuthSurface;
}): ApiClient {
  const session = createSessionStore({ storageKey: config.storageKey });
  const auth = createAuthClient({
    surface: config.surface,
    authedRequest: session.authedRequest,
  });
  return { ...session, ...auth };
}
