"use client";

/**
 * Live tracking data source.
 *
 * Preference order, decided at runtime rather than build time:
 *   1. `NEXT_PUBLIC_API_URL` set → Socket.IO `/realtime`, `order:subscribe`,
 *      then `rider:location` / `order:status` / `delivery:status` pushes.
 *   2. Socket unavailable but API reachable → poll `GET /orders/:id`, whose
 *      `tracking` payload carries the same fields.
 *   3. No API configured → local simulator, so the map is demonstrably alive
 *      with zero keys and zero services running.
 *
 * The first frame is always deterministic (derived from the fixed reference
 * instant), so the server-rendered HTML matches the browser's first paint.
 */

import * as React from "react";
import { haversineMeters } from "./geo";
import { NOW } from "./orders";
import {
  apiBase,
  remainingMeters,
  simulateRider,
  type DeliveryStatus,
  type OrderStatus,
  type RiderSnapshot,
  type TrackedOrder,
  type TrackingFeed,
} from "./tracking";

/** Matches RIDER_LOCATION_STALE_MS / RIDER_OFFLINE_MS defaults on the server. */
const STALE_MS = 30_000;
const OFFLINE_MS = 120_000;
const SIM_TICK_MS = 1_400;
const SIM_STEP = 0.011;
const POLL_MS = 8_000;

function ageFlags(at: string, now: number) {
  const age = now - new Date(at).getTime();
  return { stale: age > STALE_MS, offline: age > OFFLINE_MS };
}

export function useOrderTracking(initial: TrackedOrder): TrackingFeed {
  const route = React.useMemo(
    () => initial.route ?? [initial.origin, initial.destination],
    [initial.route, initial.origin, initial.destination],
  );

  const live = initial.status === "OUT_FOR_DELIVERY";
  const startAt = 0.18;

  const [order, setOrder] = React.useState<TrackedOrder>(initial);
  const [rider, setRider] = React.useState<RiderSnapshot | null>(
    live ? simulateRider(route, startAt, NOW) : null,
  );
  const [source, setSource] = React.useState<TrackingFeed["source"]>("demo");
  const [connected, setConnected] = React.useState(false);
  const progress = React.useRef(startAt);

  /* ── the real thing: socket, then polling ──────────────────────────────── */

  React.useEffect(() => {
    const base = apiBase();
    if (!base || !live) return;

    let cancelled = false;
    let socket: { disconnect: () => void } | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    const applyTracking = (t: {
      status?: OrderStatus;
      deliveryStatus?: DeliveryStatus | null;
      rider?: (RiderSnapshot & { name?: string; phone?: string }) | null;
    }) => {
      if (cancelled) return;
      if (t.status) {
        setOrder((prev) => ({
          ...prev,
          status: t.status ?? prev.status,
          deliveryStatus: t.deliveryStatus ?? prev.deliveryStatus,
        }));
      }
      if (t.rider) {
        const at = t.rider.at ?? new Date().toISOString();
        setRider({ ...t.rider, at, ...ageFlags(at, Date.now()) });
      }
    };

    const startPolling = () => {
      if (poll || cancelled) return;
      setSource("poll");
      const tick = async () => {
        try {
          const res = await fetch(`${base}/orders/${order.id}`, { credentials: "include" });
          if (!res.ok) return;
          const body = (await res.json()) as { tracking?: Parameters<typeof applyTracking>[0] };
          if (body.tracking) applyTracking(body.tracking);
        } catch {
          /* offline — keep the last known position on screen */
        }
      };
      void tick();
      poll = setInterval(tick, POLL_MS);
    };

    (async () => {
      try {
        const { io } = await import("socket.io-client");
        const token =
          typeof window === "undefined" ? null : window.localStorage.getItem("gp_access_token");
        const s = io(`${base}/realtime`, {
          transports: ["websocket"],
          auth: token ? { token } : undefined,
          withCredentials: true,
          reconnectionDelayMax: 10_000,
        });
        socket = s;

        s.on("connect", () => {
          if (cancelled) return;
          setConnected(true);
          setSource("socket");
          s.emit("order:subscribe", { orderId: order.id });
        });
        s.on("rider:location", (p: RiderSnapshot) => {
          const at = p.at ?? new Date().toISOString();
          if (!cancelled) setRider({ ...p, at, ...ageFlags(at, Date.now()) });
        });
        s.on("order:status", (p: { to?: OrderStatus }) => {
          if (!cancelled && p?.to) setOrder((prev) => ({ ...prev, status: p.to as OrderStatus }));
        });
        s.on("delivery:status", (p: { to?: DeliveryStatus }) => {
          if (!cancelled && p?.to)
            setOrder((prev) => ({ ...prev, deliveryStatus: p.to as DeliveryStatus }));
        });
        s.on("disconnect", () => {
          if (!cancelled) setConnected(false);
        });
        // if the socket never opens, fall back rather than showing a dead map
        s.on("connect_error", startPolling);
      } catch {
        startPolling();
      }
    })();

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      socket?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, live]);

  /* ── the simulator, only while nothing real is feeding us ──────────────── */

  React.useEffect(() => {
    if (!live || source !== "demo") return;
    const id = setInterval(() => {
      progress.current = Math.min(0.97, progress.current + SIM_STEP);
      setRider(simulateRider(route, progress.current, new Date()));
    }, SIM_TICK_MS);
    return () => clearInterval(id);
  }, [live, source, route]);

  /* ── freshness ages even when no ping arrives ──────────────────────────── */

  React.useEffect(() => {
    if (!rider) return;
    const id = setInterval(() => {
      setRider((prev) => (prev ? { ...prev, ...ageFlags(prev.at, Date.now()) } : prev));
    }, 5_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rider?.at]);

  const metersRemaining = React.useMemo(() => {
    if (!rider) return null;
    const along = remainingMeters(route, rider);
    const direct = haversineMeters(rider, order.destination);
    // never report less than the straight line — that would flatter the route
    return Math.max(direct, along);
  }, [rider, route, order.destination]);

  return { order, rider, source, connected, metersRemaining };
}
