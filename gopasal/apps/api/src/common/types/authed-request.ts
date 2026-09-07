import type { Request } from 'express';
import type { AuthUser } from './auth-user';

/**
 * An HTTP request as it looks *after* the platform's guards have run.
 *
 * `user` is optional because a request can legitimately reach a handler without
 * one: it is absent on `@Public()` routes and set by the JWT strategy (see
 * `jwt.strategy.ts`) on every other.
 *
 * Declaring the shape here — rather than casting at each site — is what keeps the
 * field typed. A cast would let a typo through silently.
 *
 * There used to be a second field, `shopId`, which `PermissionsGuard` stashed after
 * resolving which shop the caller was acting for, for an `@ActiveShop()` param
 * decorator to read back. No controller ever used it: every shop-scoped route takes
 * the shop as a `:shopId` path parameter, which is also what the guard checks the
 * grant against, so the shop arrives already bound to the URL the permission was
 * evaluated for. Reading it off the request instead would have let a handler and its
 * guard disagree about which shop they meant — and the decorator's own fallback read
 * `X-Shop-Id` straight from the headers for "routes that don't run the permission
 * guard", i.e. an unchecked shop id on exactly the routes with nothing to check it.
 */
export interface AuthedRequest extends Request {
  user?: AuthUser;
}
