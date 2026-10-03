import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, focusManager, onlineManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { createHttp, type Http, type Session } from "./http";
import { createSessionStore, type SessionStore } from "./session";
import { createOutbox, type Outbox, type OutboxState } from "./outbox";
import { asyncStorageStore } from "./async-storage-store";

/**
 * One provider that assembles the data layer and hands it to the tree.
 *
 * The three pieces are deliberately separate — transport, session, outbox —
 * because the seller and rider apps need the same three with different screens
 * around them. This file is the wiring, and the wiring is where the mobile
 * behaviour actually comes from:
 *
 *  - **Cached reads are restored from disk before the first render.** A cold
 *    start in a lift shows the shops you saw yesterday, not a spinner. The cache
 *    is persisted through AsyncStorage and rehydrated by
 *    `PersistQueryClientProvider`.
 *  - **Queries do not refire on every screen focus.** The default web behaviour
 *    (refetch whenever the window regains focus) is wrong on a phone, where
 *    navigating back is constant and every refetch costs the user data on a
 *    metered prepaid plan. `staleTime` does the work instead.
 *  - **The outbox flushes when the connection returns**, not on a timer, so a
 *    queued order goes out the moment it can rather than up to a minute later.
 */

export type GopasalContext = {
  http: Http;
  session: SessionStore;
  outbox: Outbox;
  /** The signed-in user, or null. Re-renders consumers on change. */
  user: Session["user"] | null;
  /** False until the stored session has been read from the keystore. */
  ready: boolean;
  /**
   * Ends the session on this phone *and* on the server: the refresh token is
   * revoked, and anything registered with {@link onSignOut} (the push token)
   * runs first, while there is still a session to authenticate it with.
   */
  signOut: () => Promise<void>;
  /** Run `fn` at the start of every sign-out. Returns the unsubscribe. */
  onSignOut: (fn: () => Promise<unknown>) => () => void;
};

/** Never let a dead connection hold the sign-out button hostage. */
function withinMs<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ]);
}

const Ctx = React.createContext<GopasalContext | null>(null);

/**
 * How long a cached answer is treated as fresh.
 *
 * These are deliberately long. Every one of them is a request not made on a
 * connection the user is paying for, and none of this data changes minute to
 * minute — a shop's opening hours do not, a product list does not. Anything
 * that genuinely moves (an order's status, a rider's position) is pushed over
 * the socket instead of polled, so it is not governed by these numbers at all.
 */
export const STALE = {
  /** Catalog: shops, products, categories. */
  catalog: 10 * 60_000,
  /** The user's own things: addresses, saved items, profile. */
  mine: 5 * 60_000,
  /** Order lists and details — superseded by socket events when live. */
  orders: 30_000,
} as const;

export function GopasalProvider({
  origin,
  isConnected,
  children,
}: {
  origin: string;
  /** From the network provider — stops a doomed request before it is sent. */
  isConnected?: () => boolean;
  children: React.ReactNode;
}) {
  const [user, setUser] = React.useState<Session["user"] | null>(null);
  const [ready, setReady] = React.useState(false);

  // Built once. Rebuilding the transport would orphan the in-flight refresh
  // promise, which is the one thing that must be shared across the whole app.
  const core = React.useMemo(() => {
    const session = createSessionStore();
    const http = createHttp({
      origin,
      getSession: () => session.get(),
      setSession: (next) => session.set(next),
      onSignOut: () => void session.clear(),
      isConnected,
    });
    const outbox = createOutbox(http, asyncStorageStore);
    return { session, http, outbox };
    // `isConnected` is read through a closure, so a changing identity must not
    // rebuild the transport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin]);

  const queryClient = React.useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: STALE.catalog,
            gcTime: 7 * 24 * 60 * 60_000,
            retry: false, // the transport owns retry; doing it twice doubles the wait
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            networkMode: "offlineFirst",
          },
          mutations: { retry: false, networkMode: "offlineFirst" },
        },
      }),
    [],
  );

  const persister = React.useMemo(
    () =>
      createAsyncStoragePersister({
        storage: AsyncStorage,
        key: "gopasal.query.v1",
        // Writing the whole cache on every change thrashes the disk on a cheap
        // phone; a second of coalescing costs nothing and is invisible.
        throttleTime: 1_000,
      }),
    [],
  );

  React.useEffect(() => {
    const unsubscribe = core.session.subscribe((s) => setUser(s?.user ?? null));
    void core.session.restore().finally(() => setReady(true));
    return unsubscribe;
  }, [core]);

  // Tell React Query what the app already knows, rather than letting it guess
  // from browser APIs that do not exist here.
  React.useEffect(() => {
    if (!isConnected) return;
    return onlineManager.setEventListener((setOnline) => {
      const id = setInterval(() => setOnline(isConnected()), 2_000);
      return () => clearInterval(id);
    });
  }, [isConnected]);

  // Coming back from the background is the one moment a refetch is clearly
  // worth the bytes: time has passed and the user is looking again.
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      focusManager.setFocused(state === "active");
      if (state === "active") void core.outbox.flush();
    });
    return () => sub.remove();
  }, [core]);

  // Anything queued while offline goes out as soon as the link is back.
  React.useEffect(() => {
    if (!isConnected) return;
    let wasConnected = isConnected();
    const id = setInterval(() => {
      const now = isConnected();
      if (now && !wasConnected) void core.outbox.flush();
      wasConnected = now;
    }, 2_000);
    return () => clearInterval(id);
  }, [core, isConnected]);

  const signOutHooks = React.useRef(new Set<() => Promise<unknown>>());

  const value = React.useMemo<GopasalContext>(
    () => ({
      http: core.http,
      session: core.session,
      outbox: core.outbox,
      user,
      ready,
      signOut: async () => {
        // Before clearing: both of these need the session that is about to go.
        // Unregistering the push token after the fact 401s, and the phone keeps
        // receiving the previous person's order pushes.
        const refreshToken = core.session.get()?.refreshToken;
        await withinMs(Promise.allSettled([...signOutHooks.current].map((fn) => fn())), 4_000);
        if (refreshToken) {
          await withinMs(
            core.http
              .request("/auth/logout", { method: "POST", body: { refreshToken }, anonymous: true })
              .catch(() => undefined),
            4_000,
          );
        }
        await core.session.clear();
        queryClient.clear();
      },
      onSignOut: (fn) => {
        signOutHooks.current.add(fn);
        return () => {
          signOutHooks.current.delete(fn);
        };
      },
    }),
    [core, user, ready, queryClient],
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 7 * 24 * 60 * 60_000 }}
    >
      <Ctx.Provider value={value}>{children}</Ctx.Provider>
    </PersistQueryClientProvider>
  );
}

export function useGopasal(): GopasalContext {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useGopasal must be used inside <GopasalProvider>");
  return ctx;
}

/** The outbox as React state — for the "N changes waiting to send" strip. */
export function useOutbox(): OutboxState {
  const { outbox } = useGopasal();
  const [state, setState] = React.useState<OutboxState>(() => outbox.snapshot());
  React.useEffect(() => outbox.subscribe(setState), [outbox]);
  return state;
}
