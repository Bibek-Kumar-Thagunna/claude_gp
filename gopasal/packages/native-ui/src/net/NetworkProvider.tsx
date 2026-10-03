/**
 * What the app believes about the network, and why it believes it.
 *
 * The naive version of this asks the OS "is there a connection?" and trusts the
 * answer. On the connections this app is actually used on — a shared café wifi
 * that resolves nothing, a 3G cell that has a bar of signal and 40% packet loss,
 * a phone handing off between towers on the back of a motorbike — the OS says
 * "connected" throughout and every request still times out. An app that shows a
 * spinner for thirty seconds in that state and then a red error has not handled
 * poor connectivity; it has merely detected it late.
 *
 * So there are two signals here, and they mean different things:
 *
 *  - **Link state**, from the OS. Cheap, instant, and only ever trustworthy in
 *    the negative: if it says there is no interface, there is genuinely nothing
 *    to try, and the app can say so immediately instead of waiting for a
 *    timeout.
 *  - **Reachability**, from a real request to our own API. The only thing that
 *    answers the question the user cares about, which is not "is wifi on" but
 *    "can I place my order". It also gives a round-trip time, and a link that
 *    answers in four seconds is worth telling the user about before they start
 *    checkout.
 *
 * The result is four states rather than a boolean, because "offline" and
 * "technically connected but nothing is getting through" need different words
 * and different recovery for the person holding the phone.
 */
import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Network from "expo-network";

export type NetStatus =
  /** The OS has no usable interface. Nothing will work; say so at once. */
  | "offline"
  /** Reachable and answering promptly. */
  | "online"
  /** Reachable, but slowly enough that the user should be warned. */
  | "slow"
  /** The OS claims a link, but our API is not answering. The liar case. */
  | "unreachable";

export type NetworkState = {
  status: NetStatus;
  /** True for `online` and `slow` — i.e. worth attempting a request. */
  isConnected: boolean;
  /** Last successful round trip in ms, or null if we have not had one. */
  latencyMs: number | null;
  /** When the status last changed, for "offline for 2 minutes" style copy. */
  changedAt: number;
  /** Force an immediate reachability probe — the retry button calls this. */
  recheck: () => Promise<NetStatus>;
};

const NetworkContext = React.createContext<NetworkState | null>(null);

/** Above this round-trip, the connection is "slow" and the UI should soften. */
const SLOW_MS = 1_800;
/** A probe that has not answered by here is treated as a failure. */
const PROBE_TIMEOUT_MS = 6_000;
/** Healthy polling interval. Rare, because the listener does the real work. */
const POLL_HEALTHY_MS = 30_000;
/** While broken, poll faster so recovery feels immediate — but back off. */
const POLL_BROKEN_MS = 4_000;

export function NetworkProvider({
  children,
  probeUrl,
}: {
  children: React.ReactNode;
  /** A cheap, unauthenticated endpoint on our own API. */
  probeUrl: string;
}) {
  const [status, setStatus] = React.useState<NetStatus>("online");
  const [latencyMs, setLatencyMs] = React.useState<number | null>(null);
  const [changedAt, setChangedAt] = React.useState(() => Date.now());

  // Held in refs because the polling loop must read the current values without
  // being torn down and rebuilt — restarting the timer on every status change
  // is how a "recovering" poll ends up never actually firing.
  const statusRef = React.useRef(status);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const probingRef = React.useRef(false);

  const apply = React.useCallback((next: NetStatus, latency: number | null) => {
    setLatencyMs(latency);
    if (statusRef.current !== next) {
      statusRef.current = next;
      setStatus(next);
      setChangedAt(Date.now());
    }
  }, []);

  const probe = React.useCallback(async (): Promise<NetStatus> => {
    // One probe at a time. Ten screens mounting at once must not produce ten
    // requests on a link that is already struggling.
    if (probingRef.current) return statusRef.current;
    probingRef.current = true;
    try {
      const link = await Network.getNetworkStateAsync().catch(() => null);
      if (link && link.isConnected === false) {
        apply("offline", null);
        return "offline";
      }

      const started = Date.now();
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), PROBE_TIMEOUT_MS);
      try {
        // `cache: no-store` matters: a cached 200 from ten minutes ago would
        // report a dead link as healthy, which is the one answer that must
        // never be wrong.
        // No custom headers. `cache: "no-store"` already stops a cached 200 from
        // ten minutes ago reporting a dead link as healthy, and adding a
        // `cache-control` header on top turns this into a non-simple request —
        // which buys a CORS preflight, i.e. a second round trip, on the one
        // call whose whole purpose is to be the cheapest possible probe.
        const res = await fetch(probeUrl, {
          method: "GET",
          signal: abort.signal,
          cache: "no-store",
        });
        const elapsed = Date.now() - started;
        // Any HTTP answer proves the path works. A 404 from our own API still
        // means packets are flowing, which is what is being measured here —
        // testing for `res.ok` would call a deployed-but-changed route an
        // outage.
        if (res.status > 0) {
          apply(elapsed > SLOW_MS ? "slow" : "online", elapsed);
          return elapsed > SLOW_MS ? "slow" : "online";
        }
        apply("unreachable", null);
        return "unreachable";
      } catch {
        // Aborted, DNS failure, refused, TLS error: from the user's side these
        // are one situation — the app cannot do its job right now.
        apply(link?.isConnected === false ? "offline" : "unreachable", null);
        return statusRef.current;
      } finally {
        clearTimeout(timeout);
      }
    } finally {
      probingRef.current = false;
    }
  }, [apply, probeUrl]);

  // Poll, at a rate that depends on how healthy things are. A broken link is
  // checked often because the user is waiting for it to come back; a healthy
  // one is checked rarely because every probe costs battery and data on a
  // metered Nepali prepaid plan.
  React.useEffect(() => {
    let cancelled = false;
    const loop = async () => {
      if (cancelled) return;
      const next = await probe();
      if (cancelled) return;
      const healthy = next === "online" || next === "slow";
      timerRef.current = setTimeout(loop, healthy ? POLL_HEALTHY_MS : POLL_BROKEN_MS);
    };
    void loop();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [probe]);

  // The OS telling us the link changed is worth an immediate probe: this is what
  // makes walking back into wifi range feel instant rather than up to four
  // seconds late.
  React.useEffect(() => {
    const sub = Network.addNetworkStateListener(({ isConnected }) => {
      if (isConnected === false) apply("offline", null);
      else void probe();
    });
    return () => sub.remove();
  }, [apply, probe]);

  // Coming back from the background is the other moment the cached answer is
  // most likely to be stale — the phone may have changed network entirely while
  // the app was away.
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") void probe();
    });
    return () => sub.remove();
  }, [probe]);

  const value = React.useMemo<NetworkState>(
    () => ({
      status,
      isConnected: status === "online" || status === "slow",
      latencyMs,
      changedAt,
      recheck: probe,
    }),
    [status, latencyMs, changedAt, probe],
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkState {
  const ctx = React.useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork must be used inside <NetworkProvider>");
  return ctx;
}

/** Convenience for the common case: may I attempt a request right now? */
export function useIsConnected(): boolean {
  return useNetwork().isConnected;
}
