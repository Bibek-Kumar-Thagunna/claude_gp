"use client";

import * as React from "react";
import { io, type Socket } from "socket.io-client";
import { customerApi } from "@/lib/api/customer";
import { getSession } from "@/lib/api/client";
import { orderView } from "./orders";
import { haversineMeters } from "./geo";
import {
  remainingMeters,
  type RiderSnapshot,
  type TrackedOrder,
  type TrackingFeed,
} from "./tracking";

const POLL_MS = 12_000;

function realtimeOrigin(): string | null {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!configured || configured.startsWith("__")) return null;
  try {
    return new URL(configured).origin;
  } catch {
    return null;
  }
}

/** Poll the authenticated order detail; the API is the only tracking source. */
export function useOrderTracking(initial: TrackedOrder): TrackingFeed {
  const [order, setOrder] = React.useState(initial);
  const [rider, setRider] = React.useState<RiderSnapshot | null>(null);
  const [connected, setConnected] = React.useState(false);
  const [socketConnected, setSocketConnected] = React.useState(false);
  const route = React.useMemo(
    () =>
      order.route ?? (order.origin && order.destination ? [order.origin, order.destination] : []),
    [order],
  );

  const refresh = React.useCallback(async () => {
    try {
      const row = await customerApi.order(initial.id);
      setOrder(orderView(row));
      const live = row.tracking?.rider;
      setRider(
        live
          ? {
              lat: live.lat,
              lng: live.lng,
              at: live.lastPingAt ?? new Date().toISOString(),
              stale: live.stale,
            }
          : null,
      );
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, [initial.id]);

  React.useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [refresh]);

  React.useEffect(() => {
    const origin = realtimeOrigin();
    const token = getSession()?.accessToken;
    if (!origin || !token) return;

    const socket: Socket = io(`${origin}/realtime`, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 8_000,
    });
    const subscribe = () => {
      socket.emit(
        "order:subscribe",
        { orderId: initial.id },
        (reply: { ok?: boolean } | undefined) => setSocketConnected(Boolean(reply?.ok)),
      );
    };
    socket.on("connect", subscribe);
    socket.on("disconnect", () => setSocketConnected(false));
    socket.on("unauthorized", () => setSocketConnected(false));
    socket.on(
      "rider:location",
      (event: RiderSnapshot & { orderId?: string }) => {
        if (event.orderId !== initial.id) return;
        setRider({
          lat: event.lat,
          lng: event.lng,
          heading: event.heading,
          speed: event.speed,
          accuracy: event.accuracy,
          at: event.at,
          stale: false,
          offline: false,
        });
        setSocketConnected(true);
      },
    );
    const refreshStatus = (event: { orderId?: string }) => {
      if (event.orderId === initial.id) void refresh();
    };
    socket.on("order:status", refreshStatus);
    socket.on("delivery:status", refreshStatus);
    socket.io.on("reconnect_attempt", () => {
      socket.auth = { token: getSession()?.accessToken ?? "" };
    });
    return () => {
      socket.emit("order:unsubscribe", { orderId: initial.id });
      socket.disconnect();
      setSocketConnected(false);
    };
  }, [initial.id, refresh]);

  const metersRemaining = React.useMemo(
    () =>
      rider && order.destination
        ? Math.max(
            haversineMeters(rider, order.destination),
            route.length > 1 ? remainingMeters(route, rider) : 0,
          )
        : null,
    [rider, order.destination, route],
  );

  return {
    order,
    rider,
    source: socketConnected ? "socket" : connected ? "poll" : "unavailable",
    connected: socketConnected || connected,
    metersRemaining,
    refresh,
  };
}
