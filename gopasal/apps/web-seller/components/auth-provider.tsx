"use client";

/**
 * The real signed-in seller.
 *
 * `ShopProvider` (in `shop-provider.tsx`) owns which shops exist and which one is
 * in scope, loaded from `GET /seller/shops`. `SellerProvider` (in `providers.tsx`)
 * owns authorization scoping and the language toggle, and nothing else — the two
 * fixture collections it used to hold are gone, along with every other fixture in
 * this console. This provider owns the two things every screen leans on: who
 * is signed in, and what the API says they may do — `access.shops[].permissions`
 * from `GET /auth/me`, whose dotted keys are the same ones the API's own guard
 * checks.
 *
 * There is deliberately no "pretend signed in" branch and no fallback role. If
 * there is no session, or the API cannot be reached, the console says so and
 * offers sign-in — it does not fall through to a sample seller, because a
 * console that looks signed in when it is not teaches the wrong thing about
 * every screen after it. The same reasoning rules out an `owner` short-circuit
 * in `canInShop`: `RbacService.describe` has already expanded a privileged role
 * to every key *and* subtracted whatever the shop's lifecycle forbids, so a
 * local "owners can do anything" branch would hand a SUSPENDED shop its buttons
 * back and turn a clean refusal into a failure mid-task. Membership here is a
 * plain set lookup, nothing more.
 */

import * as React from "react";
import { ApiError, type Session } from "@gopasal/api-client";
import {
  asApiError,
  clearSession,
  fetchMe,
  getSession,
  revokeSession,
  sessionFrom,
  setSession,
  subscribe,
  watchStorage,
} from "@/lib/api/client";
import type { ApiUser, MeResult, ShopAccess, TokenPair } from "@/lib/api/types";

export type AuthStatus = "loading" | "anonymous" | "authenticated";

type AuthCtx = {
  status: AuthStatus;
  user: ApiUser | null;
  /** Resolved access from `GET /auth/me`; null until it has been read once. */
  me: MeResult | null;
  /** Non-null when `me` could not be read — network, or a server error. */
  error: ApiError | null;
  /** Shops this account can act on, whatever their lifecycle state. */
  shops: ShopAccess[];
  /** True once at least one shop is live — i.e. the dashboard is worth showing. */
  hasLiveShop: boolean;
  /** Default-deny check against one shop. No owner bypass — see the note above. */
  canInShop: (shopId: string, key: string) => boolean;
  /** True when the key is held on at least one shop. */
  canAnywhere: (key: string) => boolean;
  /** Role name for display, from the membership. Owners may have no row. */
  roleNameForShop: (shopId: string) => string | null;
  /** Every distinct role name this account holds, for display only. */
  roleNames: string[];
  signIn: (tokens: TokenPair, user: ApiUser) => Promise<MeResult | null>;
  signOut: () => Promise<void>;
  reload: () => Promise<MeResult | null>;
};


const AuthContext = React.createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setLocalSession] = React.useState<Session | null>(null);
  const [status, setStatus] = React.useState<AuthStatus>("loading");
  const [me, setMe] = React.useState<MeResult | null>(null);
  const [error, setError] = React.useState<ApiError | null>(null);

  // Read storage after mount only: doing it during render would make the server
  // and client disagree and blow up hydration.
  React.useEffect(() => {
    const stored = getSession();
    setLocalSession(stored);
    if (!stored) setStatus("anonymous");
    let hasSession = Boolean(stored);
    const stopSubscribe = subscribe((next) => {
      const hadSession = hasSession;
      hasSession = Boolean(next);
      setLocalSession(next);
      if (!next) {
        setMe(null);
        setError(null);
        setStatus("anonymous");
      } else if (!hadSession) {
        setStatus("loading");
      }
    });
    const stopStorage = watchStorage();
    return () => {
      stopSubscribe();
      stopStorage();
    };
  }, []);

  const load = React.useCallback(async (signal?: AbortSignal): Promise<MeResult | null> => {
    if (!getSession()) {
      setMe(null);
      setStatus("anonymous");
      return null;
    }
    try {
      const result = await fetchMe(signal);
      setMe(result);
      setError(null);
      setStatus("authenticated");
      return result;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return null;
      // 401 here means the refresh token is spent too — `authedRequest` has
      // already tried. Anything else leaves the session alone so a flaky
      // connection does not sign the seller out.
      if (err instanceof ApiError && err.isAuth) {
        clearSession();
        setMe(null);
        setStatus("anonymous");
        return null;
      }
      setError(asApiError(err));
      setStatus("authenticated");
      return null;
    }
  }, []);

  // Browser refresh credentials are HttpOnly. After a reload the persisted
  // shell has a user snapshot but deliberately has no JavaScript-readable
  // access token; the first request must still run so it can rotate the cookie.
  const sessionKey = session?.user.id ?? null;
  React.useEffect(() => {
    if (!sessionKey) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [sessionKey, load]);

  const signIn = React.useCallback(
    async (tokens: TokenPair, user: ApiUser): Promise<MeResult | null> => {
      setSession(sessionFrom(tokens, user));
      setStatus("loading");
      return await load();
    },
    [load],
  );

  const signOut = React.useCallback(async (): Promise<void> => {
    const stored = getSession();
    // Clear locally first: the seller asked to be signed out, and that must not
    // depend on the network. The server call is best-effort and idempotent.
    clearSession();
    setMe(null);
    setError(null);
    setStatus("anonymous");
    if (stored) {
      try {
        await revokeSession(stored.refreshToken);
      } catch {
        /* already revoked, or offline — the local session is gone either way */
      }
    }
  }, []);

  const shops = React.useMemo(() => me?.access.shops ?? [], [me]);
  const hasLiveShop = React.useMemo(() => shops.some((s) => s.status === "ACTIVE"), [shops]);

  // One set per shop, plus the union. Built once per `me` so a check inside a
  // render loop is a hash lookup rather than a scan of an array of strings.
  const grantedByShop = React.useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const shop of shops) map.set(shop.shopId, new Set(shop.permissions));
    return map;
  }, [shops]);

  const grantedAnywhere = React.useMemo(() => {
    const set = new Set<string>();
    for (const shop of shops) for (const key of shop.permissions) set.add(key);
    return set;
  }, [shops]);

  /*
   * Two readers of these sets used to be on the context and had no consumer: a
   * `permissionsForShop(shopId)` that handed a screen the whole list of keys for a
   * shop, and a `unionPermissions` array of every key held anywhere.
   *
   * Nothing asks "what may I do?" — every caller asks "may I do this, here?",
   * which is `canInShop`. That is the safer shape as well as the used one: a list
   * of keys invites a screen to make its own decision from it, and the two
   * plausible mistakes are exactly the ones this provider exists to prevent —
   * treating the union as authority for a particular shop, or caching a list from
   * before `reload()` re-read `/auth/me` after an approval.
   */
  const canInShop = React.useCallback(
    (shopId: string, key: string) => grantedByShop.get(shopId)?.has(key) ?? false,
    [grantedByShop],
  );

  const canAnywhere = React.useCallback((key: string) => grantedAnywhere.has(key), [grantedAnywhere]);

  // `access.shops[].owner` is `role.isPrivileged` on the caller's membership, not
  // the `Shop.ownerId` column — `RbacService.loadContext()` reads memberships and
  // nothing else, and shop approval upserts the Owner membership, so an owner
  // does have a row. The fallback below therefore almost never fires; it is kept
  // because a privileged membership with no name in `memberships.shops` should
  // still say something truthful rather than nothing.
  const roleByShop = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const m of me?.memberships.shops ?? []) map.set(m.shopId, m.role.name);
    for (const shop of shops) if (shop.owner && !map.has(shop.shopId)) map.set(shop.shopId, "Owner");
    return map;
  }, [me, shops]);

  const roleNameForShop = React.useCallback(
    (shopId: string) => roleByShop.get(shopId) ?? null,
    [roleByShop],
  );

  const roleNames = React.useMemo(() => [...new Set(roleByShop.values())], [roleByShop]);

  const value = React.useMemo<AuthCtx>(
    () => ({
      status,
      user: me?.user ?? session?.user ?? null,
      me,
      error,
      shops,
      hasLiveShop,
      canInShop,
      canAnywhere,
      roleNameForShop,
      roleNames,
      signIn,
      signOut,
      reload: () => load(),
    }),
    [
      status,
      me,
      session,
      error,
      shops,
      hasLiveShop,
      canInShop,
      canAnywhere,
      roleNameForShop,
      roleNames,
      signIn,
      signOut,
      load,
    ],
  );


  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Where a signed-in account should land.
 *
 * A live shop means the dashboard. Anything else — no membership at all, or one
 * whose shop is still `PENDING` — means onboarding, which is the screen that can
 * explain the actual state.
 */
export function landingPath(me: MeResult | null): string {
  if (!me) return "/onboarding";
  if (me.access.shops.some((s) => s.status === "ACTIVE")) return "/dashboard";
  return "/onboarding";
}
