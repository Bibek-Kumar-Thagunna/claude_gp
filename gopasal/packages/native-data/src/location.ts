/**
 * Where the customer says they are.
 *
 * Every discovery call the app makes is location-qualified — `/discovery/home`,
 * `/shops`, the delivery check — and the API requires `lat`/`lng` on all of
 * them. So the app must always have *a* point. The question is only how honest
 * it is about where that point came from, and this module answers it with a
 * `source` field that travels with the coordinates:
 *
 *  - `"address"` — a saved delivery address. The best answer; it is where the
 *    order is actually going.
 *  - `"gps"` — a device fix the customer asked for.
 *  - `"search"` — a place they picked from autocomplete.
 *  - `"default"` — nobody has told us anything yet, so the feed is centred on
 *    Kathmandu. The UI must say so rather than implying we know where they are,
 *    which is why `isDefault` is exposed separately from the point itself.
 *
 * The choice is persisted in ordinary storage — it is a convenience, not a
 * secret, and it needs to be readable on the first frame so the home feed does
 * not flash a different city before hydrating.
 *
 * No geocoding happens here. Turning a point into a name costs a billable
 * request, so a label is only ever stored alongside a point that someone
 * already named for us (an address, a search result). See
 * `docs/maps-cost-policy.md`.
 */
import * as React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "gopasal.delivery-point";

export type PointSource = "address" | "gps" | "search" | "default";

export type DeliveryPoint = {
  lat: number;
  lng: number;
  /** Short, human place name for the header chip. Never reverse-geocoded. */
  label: string;
  source: PointSource;
  /** Present when the point came from a saved address, so checkout can preselect it. */
  addressId?: string | null;
};

/**
 * Kathmandu's centre, used only until the customer tells us otherwise.
 *
 * A national app needs somewhere to start and this is where the shops are. It is
 * labelled as a guess everywhere it is shown.
 */
export const FALLBACK_POINT: DeliveryPoint = {
  lat: 27.7172,
  lng: 85.324,
  label: "Kathmandu",
  source: "default",
};

/** ~110 m. The resolution discovery queries are cached at. */
export function snap(point: { lat: number; lng: number }) {
  return { lat: Number(point.lat.toFixed(3)), lng: Number(point.lng.toFixed(3)) };
}

/* ── store ────────────────────────────────────────────────────────────────── */

type Listener = () => void;

let current: DeliveryPoint = FALLBACK_POINT;
let hydrated = false;
let hydrating: Promise<void> | null = null;
const listeners = new Set<Listener>();

// `useSyncExternalStore` compares snapshots by identity, so the snapshot has to
// be a stable object that only changes when the value does.
let snapshot = { point: current, hydrated };

function emit() {
  snapshot = { point: current, hydrated };
  for (const l of listeners) l();
}

function valid(value: unknown): value is DeliveryPoint {
  if (!value || typeof value !== "object") return false;
  const p = value as DeliveryPoint;
  return (
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180 &&
    typeof p.label === "string"
  );
}

export function hydrateDeliveryPoint(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (valid(parsed)) current = parsed;
      }
    } catch {
      // A corrupt or unreadable entry is not worth failing a launch over; the
      // fallback point is a perfectly usable starting state.
    }
    hydrated = true;
    emit();
  })();
  return hydrating;
}

export async function setDeliveryPoint(point: DeliveryPoint): Promise<void> {
  current = point;
  hydrated = true;
  emit();
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(point));
  } catch {
    // In-memory state already updated; persistence is best-effort.
  }
}

export async function clearDeliveryPoint(): Promise<void> {
  current = FALLBACK_POINT;
  emit();
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* best effort */
  }
}

export function getDeliveryPoint(): DeliveryPoint {
  return current;
}

/* ── hook ─────────────────────────────────────────────────────────────────── */

function subscribe(listener: Listener) {
  listeners.add(listener);
  void hydrateDeliveryPoint();
  return () => {
    listeners.delete(listener);
  };
}

export function useDeliveryPoint() {
  const state = React.useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );

  return {
    point: state.point,
    /** True while the feed is centred on a guess rather than on the customer. */
    isDefault: state.point.source === "default",
    hydrated: state.hydrated,
    setPoint: setDeliveryPoint,
    clear: clearDeliveryPoint,
  };
}
