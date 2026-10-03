import * as React from "react";
import { AppState, Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useGopasal } from "@gopasal/native-data";
import { createBackgroundClient, sendPing, shouldPing } from "@gopasal/native-data/rider";
import { apiOrigin } from "./api-origin.expo";

/**
 * Sharing the rider's position — with consent, and only while it is useful.
 *
 * Three layers, each switched on by the one above it:
 *
 *  1. **Consent.** Nothing is read from the GPS until the rider has seen, in
 *     the app's own words, what is shared, with whom and when
 *     (`app/location-consent.tsx`). Google Play requires that prominent
 *     disclosure before a background-location prompt, and it is also simply
 *     what a rider is owed.
 *  2. **Foreground.** While the rider is online and the app is open, fixes go
 *     to `POST /rider/ping` — throttled here (moved 25 m, or 30 s of silence,
 *     never faster than every 5 s) and again by the server.
 *  3. **Background.** Only while a job is in hand, a foreground service (a
 *     visible notification on Android) keeps pinging with the screen off, so
 *     the customer's map keeps moving while the phone is in a pocket. It stops
 *     the moment there is no job, or the rider goes offline.
 */
export const LOCATION_TASK = "gopasal-rider-location";
const CONSENT_KEY = "gopasal.rider.locationConsent";

let lastSent: { lat: number; lng: number; at: number } | null = null;

// The OS wakes this with the app closed, so it must be defined at module
// scope — the root layout imports this file for exactly that side effect.
if (Platform.OS !== "web" && !TaskManager.isTaskDefined(LOCATION_TASK)) {
  TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data) return;
    const { locations } = data as { locations?: Location.LocationObject[] };
    const fix = locations?.[locations.length - 1];
    if (!fix) return;
    const next = { lat: fix.coords.latitude, lng: fix.coords.longitude, at: fix.timestamp };
    if (!shouldPing(lastSent, next)) return;
    try {
      const http = await createBackgroundClient(apiOrigin());
      if (!http) return;
      await sendPing(http, {
        lat: next.lat,
        lng: next.lng,
        heading: fix.coords.heading,
        speed: fix.coords.speed,
        accuracy: fix.coords.accuracy,
      });
      lastSent = next;
    } catch {
      // A dropped ping is replaced by the next one; nothing to recover.
    }
  });
}

export async function hasConsent(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CONSENT_KEY)) === "yes";
  } catch {
    return false;
  }
}

export async function recordConsent(given: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(CONSENT_KEY, given ? "yes" : "no");
  } catch {
    /* nothing to do: the question is simply asked again */
  }
}

/** Ask for "while using" and then, separately (the OS insists), "all the time". */
export async function requestLocation(): Promise<{ foreground: boolean; background: boolean }> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return { foreground: false, background: false };
  if (Platform.OS === "web") return { foreground: true, background: false };
  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    return { foreground: true, background: bg.granted };
  } catch {
    return { foreground: true, background: false };
  }
}

async function startBackground(title: string, body: string): Promise<void> {
  if (Platform.OS === "web") return;
  const bg = await Location.getBackgroundPermissionsAsync();
  if (!bg.granted) return;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) return;
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 10_000,
    distanceInterval: 25,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.OtherNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: title,
      notificationBody: body,
      notificationColor: "#F6A609",
    },
  });
}

async function stopBackground(): Promise<void> {
  if (Platform.OS === "web") return;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined);
  }
}

export type TrackingState =
  | { kind: "off" }
  | { kind: "needsConsent" }
  | { kind: "denied" }
  | { kind: "waiting" }
  | { kind: "live"; accuracy: number | null; sentAt: number | null };

/**
 * Run location sharing for the current state of the rider.
 *
 * `online` is the rider's availability; `onJob` whether a delivery is in hand.
 * Returns what the screen should say about it, and `refresh` for after the
 * consent screen has been answered.
 */
export function useTracking({
  online,
  onJob,
  serviceTitle,
  serviceBody,
}: {
  online: boolean;
  onJob: boolean;
  serviceTitle: string;
  serviceBody: string;
}): { state: TrackingState; refresh: () => void } {
  const { http, user } = useGopasal();
  const [state, setState] = React.useState<TrackingState>({ kind: "off" });
  const [epoch, setEpoch] = React.useState(0);
  const refresh = React.useCallback(() => setEpoch((n) => n + 1), []);

  // Foreground watch.
  React.useEffect(() => {
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    void (async () => {
      if (!user || (!online && !onJob)) {
        setState({ kind: "off" });
        return;
      }
      if (!(await hasConsent())) {
        if (!cancelled) setState({ kind: "needsConsent" });
        return;
      }
      const perm = await Location.getForegroundPermissionsAsync().catch(() => null);
      if (!perm?.granted) {
        if (!cancelled) setState({ kind: "denied" });
        return;
      }
      if (cancelled) return;
      setState({ kind: "waiting" });
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5_000, distanceInterval: 10 },
        (fix) => {
          const next = { lat: fix.coords.latitude, lng: fix.coords.longitude, at: Date.now() };
          const accuracy = fix.coords.accuracy ?? null;
          if (shouldPing(lastSent, next)) {
            lastSent = next;
            void sendPing(http, {
              lat: next.lat,
              lng: next.lng,
              heading: fix.coords.heading,
              speed: fix.coords.speed,
              accuracy,
            })
              .then(() => !cancelled && setState({ kind: "live", accuracy, sentAt: Date.now() }))
              .catch(() => undefined);
          } else if (!cancelled) {
            setState((s) => (s.kind === "live" ? { ...s, accuracy } : { kind: "live", accuracy, sentAt: null }));
          }
        },
      ).catch(() => {
        if (!cancelled) setState({ kind: "denied" });
        return null;
      });
    })();
    return () => {
      cancelled = true;
      // expo-location's web shim throws from `remove()` (its emitter has no
      // `removeSubscription`); a watch that cannot be removed must not take
      // the screen down with it.
      try {
        sub?.remove();
      } catch {
        /* the watch dies with the page on web */
      }
    };
  }, [user, online, onJob, http, epoch]);

  // Background service, only while a job is in hand.
  React.useEffect(() => {
    void (async () => {
      if (user && onJob && (await hasConsent())) await startBackground(serviceTitle, serviceBody);
      else await stopBackground();
    })();
  }, [user, onJob, serviceTitle, serviceBody, epoch]);

  // Coming back to the app re-checks permissions: they may have been changed
  // in Settings while it was away.
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && refresh());
    return () => sub.remove();
  }, [refresh]);

  return { state, refresh };
}

/** Called on sign-out: no job, no consent to keep sharing for someone else. */
export async function stopAllTracking(): Promise<void> {
  lastSent = null;
  await stopBackground();
}
