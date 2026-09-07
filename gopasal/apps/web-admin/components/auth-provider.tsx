"use client";

/**
 * The real signed-in platform staff member.
 *
 * This provider owns the two facts that must never be guessed on an internal
 * console: who is signed in, and what the API says they may do. Both come from
 * `GET /auth/me` — `access.platform` is the resolved permission list (already
 * expanded to every key when `access.superAdmin` is true), and its dotted keys
 * are the same ones the API's own guard checks.
 *
 * There is deliberately no "pretend signed in" branch and no fallback role. A
 * console that shows an Approve button to someone the API will refuse is worse
 * than one that shows nothing: it turns a permission error into a surprise at
 * the worst moment. `AdminProvider` reads `can` from here for exactly that
 * reason — the fixture role catalogue in `lib/rbac.ts` is now only the editor's
 * material, not the source of truth for access.
 */

import * as React from "react";
import { ApiError, type Session } from "@gopasal/api-client";
import {
  clearSession,
  fetchMe,
  getSession,
  revokeSession,
  sessionFrom,
  setSession,
  subscribe,
  watchStorage,
} from "@/lib/api/client";
import type { ApiUser, MeResult, TokenPair } from "@/lib/api/types";

export type AuthStatus = "loading" | "anonymous" | "authenticated";

type AuthCtx = {
  status: AuthStatus;
  user: ApiUser | null;
  /** Resolved access from `GET /auth/me`; null until it has been read once. */
  me: MeResult | null;
  /** Non-null when `me` could not be read — network, or a server error. */
  error: ApiError | null;
  /** Platform permission keys this account holds, as the API resolved them. */
  permissions: string[];
  superAdmin: boolean;
  /** True when this account has any platform standing at all. */
  isStaff: boolean;
  /** Default-deny: unknown key, no session, or no `/auth/me` yet ⇒ false. */
  hasPermission: (key: string) => boolean;
  /** The name of the platform role, for display only. */
  roleName: string | null;
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
    const stopSubscribe = subscribe(setLocalSession);
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
      // connection does not sign the reviewer out mid-queue.
      if (err instanceof ApiError && err.isAuth) {
        clearSession();
        setMe(null);
        setStatus("anonymous");
        return null;
      }
      setError(err instanceof ApiError ? err : new ApiError({ status: 0, message: String(err) }));
      setStatus("authenticated");
      return null;
    }
  }, []);

  const sessionKey = session?.accessToken ?? null;
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
    // Clear locally first: the person asked to be signed out, and that must not
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

  const permissions = React.useMemo(() => me?.access.platform ?? [], [me]);
  const granted = React.useMemo(() => new Set(permissions), [permissions]);
  const superAdmin = me?.access.superAdmin ?? false;

  const hasPermission = React.useCallback(
    (key: string) => superAdmin || granted.has(key),
    [superAdmin, granted],
  );

  const value = React.useMemo<AuthCtx>(
    () => ({
      status,
      user: me?.user ?? session?.user ?? null,
      me,
      error,
      permissions,
      superAdmin,
      isStaff: superAdmin || permissions.length > 0,
      hasPermission,
      roleName: me?.memberships.platform?.role.name ?? (superAdmin ? "Super Admin" : null),
      signIn,
      signOut,
      reload: () => load(),
    }),
    [status, me, session, error, permissions, superAdmin, hasPermission, signIn, signOut, load],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
