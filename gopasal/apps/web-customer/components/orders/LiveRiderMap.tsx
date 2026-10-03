"use client";

import * as React from "react";
import * as maplibregl from "maplibre-gl";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
} from "maplibre-gl";
import { Crosshair, History, Radio, WifiOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { humanDistance, type LatLng } from "@/lib/geo";
import { mapConfig } from "@/lib/api/customer";
import type { RiderSnapshot } from "@/lib/tracking";

type Props = {
  origin: LatLng;
  destination: LatLng;
  rider?: RiderSnapshot | null;
  route?: LatLng[];
  metersRemaining?: number | null;
  source?: "socket" | "poll" | "unavailable";
  vehicle?: "BICYCLE" | "MOTORBIKE" | "SCOOTER" | "WALK";
  className?: string;
  height?: number;
};

const EMPTY_LINE = {
  type: "Feature" as const,
  properties: {},
  geometry: { type: "LineString" as const, coordinates: [] as [number, number][] },
};

function line(points: LatLng[]) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: points.map((point): [number, number] => [point.lng, point.lat]),
    },
  };
}

function nearestIndex(route: LatLng[], point: LatLng): number {
  let closest = 0;
  let best = Number.POSITIVE_INFINITY;
  route.forEach((candidate, index) => {
    const distance = (candidate.lat - point.lat) ** 2 + (candidate.lng - point.lng) ** 2;
    if (distance < best) {
      best = distance;
      closest = index;
    }
  });
  return closest;
}

function markerElement(kind: "shop" | "home" | "rider", vehicle = "MOTORBIKE") {
  const node = document.createElement("div");
  node.setAttribute("aria-hidden", "true");
  node.style.cssText = [
    "display:grid",
    "place-items:center",
    kind === "rider" ? "width:46px" : "width:38px",
    kind === "rider" ? "height:46px" : "height:38px",
    "border:3px solid white",
    "border-radius:999px",
    `background:${kind === "shop" ? "#171923" : kind === "home" ? "#0B7E58" : "#E11945"}`,
    "box-shadow:0 8px 22px rgba(23,25,35,.24)",
    "font-size:20px",
  ].join(";");
  node.textContent =
    kind === "shop" ? "🏪" : kind === "home" ? "⌂" : vehicle === "WALK" ? "●" : "🛵";
  return node;
}

export function LiveRiderMap({
  origin,
  destination,
  rider,
  route,
  metersRemaining,
  source = "unavailable",
  vehicle = "MOTORBIKE",
  className,
  height = 420,
}: Props) {
  const node = React.useRef<HTMLDivElement>(null);
  const map = React.useRef<MapLibreMap | null>(null);
  const shopMarker = React.useRef<MapLibreMarker | null>(null);
  const homeMarker = React.useRef<MapLibreMarker | null>(null);
  const riderMarker = React.useRef<MapLibreMarker | null>(null);
  const [provider, setProvider] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [mapReady, setMapReady] = React.useState(false);
  const path = React.useMemo(
    () => (route && route.length > 1 ? route : [origin, destination]),
    [destination, origin, route],
  );
  const initial = React.useRef({ origin, destination, path });

  const fit = React.useCallback(() => {
    const instance = map.current;
    if (!instance || path.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    path.forEach((point) => bounds.extend([point.lng, point.lat]));
    instance.fitBounds(bounds, { padding: 64, maxZoom: 16, duration: 500 });
  }, [path]);

  React.useEffect(() => {
    if (!node.current || map.current) return;
    let active = true;
    void mapConfig()
      .then((config) => {
        if (!active || !node.current) return;
        const tracking = config.surfaces?.tracking ?? config;
        if (!tracking.styleUrl || tracking.provider === "google") {
          throw new Error("A MapLibre tracking style has not been configured.");
        }
        setProvider(tracking.provider);
        const instance = new maplibregl.Map({
          container: node.current,
          style: tracking.styleUrl,
          center: [initial.current.origin.lng, initial.current.origin.lat],
          zoom: 13,
          attributionControl: false,
        });
        map.current = instance;
        instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        instance.on("load", () => {
          instance.addSource("route-ahead", { type: "geojson", data: EMPTY_LINE });
          instance.addSource("route-travelled", { type: "geojson", data: EMPTY_LINE });
          instance.addLayer({
            id: "route-ahead-casing",
            type: "line",
            source: "route-ahead",
            paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.92 },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          instance.addLayer({
            id: "route-ahead-line",
            type: "line",
            source: "route-ahead",
            paint: { "line-color": "#7B8794", "line-width": 4, "line-dasharray": [1, 2] },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          instance.addLayer({
            id: "route-travelled-casing",
            type: "line",
            source: "route-travelled",
            paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.95 },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          instance.addLayer({
            id: "route-travelled-line",
            type: "line",
            source: "route-travelled",
            paint: { "line-color": "#E11945", "line-width": 5 },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          shopMarker.current = new maplibregl.Marker({ element: markerElement("shop") })
            .setLngLat([initial.current.origin.lng, initial.current.origin.lat])
            .addTo(instance);
          homeMarker.current = new maplibregl.Marker({ element: markerElement("home") })
            .setLngLat([initial.current.destination.lng, initial.current.destination.lat])
            .addTo(instance);
          setError(null);
          setMapReady(true);
          const bounds = new maplibregl.LngLatBounds();
          initial.current.path.forEach((point) => bounds.extend([point.lng, point.lat]));
          instance.fitBounds(bounds, { padding: 64, maxZoom: 16, duration: 0 });
        });
        instance.on("error", () => {
          // A transient tile miss should not cover a functioning map. Reserve
          // the blocking state for a style that could not initialise at all.
          if (!instance.isStyleLoaded()) {
            setError(
              "The street map is temporarily unavailable. Tracking details are still updating.",
            );
          }
        });
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "The street map could not load."),
      );
    return () => {
      active = false;
      riderMarker.current?.remove();
      homeMarker.current?.remove();
      shopMarker.current?.remove();
      map.current?.remove();
      riderMarker.current = null;
      homeMarker.current = null;
      shopMarker.current = null;
      map.current = null;
    };
  }, []);

  React.useEffect(() => {
    const instance = map.current;
    if (!instance?.isStyleLoaded()) return;
    shopMarker.current?.setLngLat([origin.lng, origin.lat]);
    homeMarker.current?.setLngLat([destination.lng, destination.lat]);
    const cut = rider ? nearestIndex(path, rider) : 0;
    const travelled = rider ? [...path.slice(0, cut + 1), rider] : [];
    const ahead = rider ? [rider, ...path.slice(cut + 1)] : path;
    (instance.getSource("route-ahead") as GeoJSONSource | undefined)?.setData(line(ahead));
    (instance.getSource("route-travelled") as GeoJSONSource | undefined)?.setData(
      travelled.length > 1 ? line(travelled) : EMPTY_LINE,
    );
    if (rider) {
      const marker = riderMarker.current ?? new maplibregl.Marker({
          element: markerElement("rider", vehicle),
          rotationAlignment: "map",
        }).addTo(instance);
      riderMarker.current = marker;
      marker
        .setLngLat([rider.lng, rider.lat])
        .setRotation(Number.isFinite(rider.heading) ? rider.heading! : 0);
      const element = marker.getElement();
      element.style.opacity = rider.offline ? "0.62" : "1";
      element.style.filter = rider.stale ? "sepia(.6)" : "none";
    } else {
      riderMarker.current?.remove();
      riderMarker.current = null;
    }
  }, [destination.lat, destination.lng, mapReady, origin.lat, origin.lng, path, rider, vehicle]);

  const offline = Boolean(rider?.offline);
  const stale = Boolean(rider?.stale) && !offline;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-ink-100 bg-[#EEF2F5] shadow-card",
        className,
      )}
      style={{ height }}
      role="group"
      aria-label="Live delivery map"
    >
      <div ref={node} className="absolute inset-0" />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-[#F3F6F4] p-6 text-center">
          <div>
            <p className="font-bold text-ink-800">Map unavailable</p>
            <p className="mt-1 max-w-sm text-sm text-ink-500">{error}</p>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-soft backdrop-blur",
            offline
              ? "bg-ink-900/85 text-white"
              : stale
                ? "bg-[#FFF3DF]/95 text-[#8a5a00]"
                : "bg-white/95 text-crimson-700",
          )}
        >
          {offline ? (
            <><WifiOff className="h-3.5 w-3.5" /> Runner&apos;s phone is offline</>
          ) : stale ? (
            <><History className="h-3.5 w-3.5" /> Last known position</>
          ) : rider ? (
            <><span className="h-2 w-2 animate-pulse rounded-full bg-crimson-500" /> Live location</>
          ) : (
            "Waiting for the runner"
          )}
        </span>
        {source === "unavailable" && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-900/75 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
            <Radio className="h-3 w-3" /> Tracking feed unavailable
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={fit}
        aria-label="Recentre map on delivery route"
        className="absolute right-3 top-28 grid h-10 w-10 place-items-center rounded-xl border border-ink-100 bg-white text-ink-700 shadow-soft hover:text-crimson-600"
      >
        <Crosshair className="h-4 w-4" />
      </button>

      <div className="pointer-events-none absolute bottom-5 left-3 max-w-[75%] rounded-2xl bg-white/95 px-3.5 py-2.5 shadow-float backdrop-blur">
        {rider && metersRemaining != null && Number.isFinite(metersRemaining) ? (
          <>
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Route left</p>
            <p className="font-display text-lg font-bold leading-tight text-ink-900">
              {humanDistance(metersRemaining)}
            </p>
          </>
        ) : (
          <p className="text-xs font-semibold text-ink-800">The live marker appears after dispatch.</p>
        )}
      </div>

      <p className="absolute bottom-1 right-2 rounded bg-white/75 px-1 text-[10px] text-ink-600 backdrop-blur">
        {provider === "baato" ? (
          <><a href="https://baato.io" target="_blank" rel="noreferrer" className="font-semibold">Baato</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></>
        ) : (
          "Map data attribution"
        )}
      </p>
    </div>
  );
}

export default LiveRiderMap;
