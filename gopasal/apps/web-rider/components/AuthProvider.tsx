"use client";

import * as React from "react";
import type { ApiUser, Session, TokenPair } from "@gopasal/api-client";
import { ApiError } from "@gopasal/api-client";
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

type AuthContextValue = {
  status: "loading" | "anonymous" | "authenticated";
  user: ApiUser | null;
  signIn: (tokens: TokenPair, user: ApiUser) => void;
  signOut: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setLocalSession] = React.useState<Session | null>(null);
  const [status, setStatus] = React.useState<AuthContextValue["status"]>("loading");
  const [user, setUser] = React.useState<ApiUser | null>(null);

  React.useEffect(() => {
    const stored = getSession();
    setLocalSession(stored);
    setUser(stored?.user ?? null);
    setStatus(stored ? "authenticated" : "anonymous");
    const stop = subscribe(setLocalSession);
    const stopStorage = watchStorage();
    return () => { stop(); stopStorage(); };
  }, []);

  React.useEffect(() => {
    if (!session) {
      setUser(null);
      setStatus("anonymous");
      return;
    }
    const controller = new AbortController();
    void fetchMe(controller.signal)
      .then((me) => { setUser(me.user); setStatus("authenticated"); })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.isAuth) {
          clearSession();
          setUser(null);
          setStatus("anonymous");
        }
      });
    return () => controller.abort();
  }, [session]);

  const signOut = React.useCallback(async () => {
    const stored = getSession();
    clearSession();
    setUser(null);
    setStatus("anonymous");
    if (stored) try { await revokeSession(stored.refreshToken); } catch { /* local sign-out is final */ }
  }, []);

  const value = React.useMemo<AuthContextValue>(() => ({
    status,
    user,
    signIn: (tokens, nextUser) => {
      setSession(sessionFrom(tokens, nextUser));
      setUser(nextUser);
      setStatus("authenticated");
    },
    signOut,
  }), [status, user, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = React.useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
