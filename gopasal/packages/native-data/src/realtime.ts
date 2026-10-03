import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { useGopasal } from "./GopasalProvider";
import { qk, type Order } from "./customer";

/**
 * The rider's position, live.
 *
 * Tracking used to be polling alone: a request every few seconds for a marker
 * that moves continuously, which is both late and the most expensive thing a
 * phone can do on a mobile connection. The API has had an authenticated
 * Socket.IO room per order since delivery shipped — the web console uses it —
 * and this is the app's side of it.
 *
 * What it does, and why each part is there:
 *
 *  - **Writes into the React Query cache rather than into component state.**
 *    The order screen already renders `order.tracking.rider`; a position that
 *    arrives on the socket is the same fact as one that arrived on the last
 *    poll, so it belongs in the same place. Every consumer updates at once and
 *    nothing has to be threaded through props.
 *  - **Gives back `live`.** The screen polls only while this is false, so a
 *    connected socket costs one request at open and then nothing until the
 *    order changes state.
 *  - **Follows the app's own lifecycle.** A socket held open behind a locked
 *    screen keeps the radio awake for a map nobody is looking at, so it closes
 *    on background and reopens on foreground.
 *  - **Re-reads the token on every reconnect.** The access token is short-lived
 *    and the transport refreshes it in the background; a socket that cached the
 *    token it opened with would authenticate with an expired one and be
 *    rejected for the rest of the delivery.
 */

export type RealtimeState = {
  /** True while a socket is connected *and* subscribed to this order. */
  live: boolean;
};

function realtimeOrigin(apiOrigin: string): string | null {
  try {
    return new URL(apiOrigin).origin;
  } catch {
    return null;
  }
}

export function useOrderRealtime(orderId: string | null | undefined, enabled = true): RealtimeState {
  const { http, session, user } = useGopasal();
  const queryClient = useQueryClient();
  const [live, setLive] = React.useState(false);
  const [foreground, setForeground] = React.useState(() => AppState.currentState !== "background");

  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) =>
      setForeground(state !== "background" && state !== "inactive"),
    );
    return () => sub.remove();
  }, []);

  React.useEffect(() => {
    if (!enabled || !orderId || !user || !foreground) {
      setLive(false);
      return;
    }
    const origin = realtimeOrigin(http.origin());
    if (!origin) return;

    let closed = false;
    let socket: Socket | null = null;

    // Kept as an async body so the socket setup reads in order even though the
    // token read is synchronous.
    void (async () => {
      // A fresh token, not whatever was in memory when the screen mounted.
      const token = session.get()?.accessToken;
      if (!token || closed) return;

      socket = io(`${origin}/realtime`, {
        auth: { token },
        // Websocket only: React Native has no cookies for the polling
        // transport to carry, and long-polling on a phone is the battery cost
        // this hook exists to avoid.
        transports: ["websocket"],
        reconnection: true,
        reconnectionDelay: 900,
        reconnectionDelayMax: 10_000,
      });

      const subscribe = () => {
        socket?.emit("order:subscribe", { orderId }, (reply: { ok?: boolean } | undefined) =>
          setLive(Boolean(reply?.ok)),
        );
      };

      socket.on("connect", subscribe);
      socket.on("disconnect", () => setLive(false));
      socket.on("unauthorized", () => setLive(false));
      socket.on("connect_error", () => setLive(false));

      socket.on(
        "rider:location",
        (event: {
          orderId?: string;
          lat: number;
          lng: number;
          heading?: number | null;
          speed?: number | null;
          at?: string;
        }) => {
          if (event.orderId && event.orderId !== orderId) return;
          setLive(true);
          queryClient.setQueryData<Order>(qk.order(orderId), (current) => {
            // Only ever a position update. If there is no rider on the order
            // yet the next refetch will bring the whole block; inventing one
            // here would mean guessing a name and a phone number.
            if (!current?.tracking?.rider) return current;
            return {
              ...current,
              tracking: {
                ...current.tracking,
                rider: {
                  ...current.tracking.rider,
                  lat: event.lat,
                  lng: event.lng,
                  heading: event.heading ?? current.tracking.rider.heading,
                  speed: event.speed ?? current.tracking.rider.speed,
                  lastPingAt: event.at ?? new Date().toISOString(),
                  stale: false,
                },
              },
            };
          });
        },
      );

      // A state change is more than a position: the whole order is refetched,
      // because the status, the timeline and the proof photo all move with it.
      const refetch = (event: { orderId?: string }) => {
        if (event.orderId && event.orderId !== orderId) return;
        void queryClient.invalidateQueries({ queryKey: qk.order(orderId) });
        void queryClient.invalidateQueries({ queryKey: qk.orders() });
      };
      socket.on("order:status", refetch);
      socket.on("delivery:status", refetch);

      socket.io.on("reconnect_attempt", () => {
        if (socket) socket.auth = { token: session.get()?.accessToken ?? "" };
      });
    })();

    return () => {
      closed = true;
      setLive(false);
      if (socket) {
        socket.emit("order:unsubscribe", { orderId });
        socket.disconnect();
      }
    };
  }, [enabled, orderId, user, foreground, http, session, queryClient]);

  return { live };
}
