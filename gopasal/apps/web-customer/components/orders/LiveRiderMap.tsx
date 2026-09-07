"use client";

/**
 * The live delivery map.
 *
 * Deliberately built without a map SDK. One Web-Mercator projection (lib/geo)
 * positions the raster tiles AND the markers drawn over them, so the two layers
 * can never drift apart, and the whole thing runs locally with no credentials:
 *
 *   NEXT_PUBLIC_MAP_PROVIDER=mapbox  + NEXT_PUBLIC_MAPBOX_TOKEN → Mapbox raster
 *   NEXT_PUBLIC_MAP_PROVIDER=osm     (default)                  → OSM raster, no key
 *   NEXT_PUBLIC_MAP_PROVIDER=none    or tiles fail to load      → stylised canvas
 *
 * It reports DISTANCE REMAINING and never an ETA — GoPasal does not promise
 * delivery times, and a map must not smuggle one in through the back door.
 */

import * as React from "react";
import { motion } from "framer-motion";
import { Bike, Store, MapPin, Plus, Minus, Crosshair, WifiOff, History, Radio } from "lucide-react";
import { cn } from "@/lib/cn";
import { TILE, fitView, project, humanDistance, type LatLng } from "@/lib/geo";
import { mapConfig, type MapConfig, type RiderSnapshot } from "@/lib/tracking";

const DEFAULT_W = 760;
const MIN_ZOOM = 9;
const MAX_ZOOM = 18;

type Props = {
  /** Shop pin — where the parcel starts. */
  origin: LatLng;
  /** Delivery pin — where it is going. */
  destination: LatLng;
  /** Live position, or null before the shop starts the delivery. */
  rider?: RiderSnapshot | null;
  route?: LatLng[];
  /** Metres left along the route. Never rendered as a time. */
  metersRemaining?: number | null;
  source?: "socket" | "poll" | "demo";
  vehicle?: "BICYCLE" | "MOTORBIKE" | "SCOOTER" | "WALK";
  className?: string;
  height?: number;
};

function tileUrl(cfg: MapConfig, z: number, x: number, y: number): string | null {
  if (cfg.provider === "mapbox" && cfg.token) {
    return `https://api.mapbox.com/v4/mapbox.streets/${z}/${x}/${y}@2x.png?access_token=${cfg.token}`;
  }
  if (cfg.provider === "osm") return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  return null;
}

/** Index of the route vertex the rider is currently closest to. */
function nearestIndex(route: LatLng[], p: LatLng): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < route.length; i += 1) {
    const dx = route[i]!.lat - p.lat;
    const dy = route[i]!.lng - p.lng;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function LiveRiderMap({
  origin,
  destination,
  rider,
  route,
  metersRemaining,
  source = "demo",
  vehicle = "MOTORBIKE",
  className,
  height = 420,
}: Props) {
  const cfg = React.useMemo(() => mapConfig(), []);
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState({ w: DEFAULT_W, h: height });
  const [zoomAdjust, setZoomAdjust] = React.useState(0);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [tilesBroken, setTilesBroken] = React.useState(false);

  /* a single 404 at the edge of a zoom level is normal; only give up on the
     tile server once several requests in a row have failed */
  const tileErrors = React.useRef(0);
  const onTileError = React.useCallback(() => {
    tileErrors.current += 1;
    if (tileErrors.current >= 6) setTilesBroken(true);
  }, []);

  /* the box measures itself; the first frame uses a fixed size so the server
     HTML and the browser's first paint agree */
  React.useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r && r.width > 0) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const path = React.useMemo(
    () => (route && route.length > 1 ? route : [origin, destination]),
    [route, origin, destination],
  );

  /* fit to the route only — never to the rider, or the map would lurch on
     every ping instead of the rider moving across a steady frame */
  const view = React.useMemo(() => fitView(path, size.w, size.h, 72), [path, size.w, size.h]);
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom + zoomAdjust));
  const worldCenter = React.useMemo(() => project(view.center, zoom), [view.center, zoom]);

  const toScreen = React.useCallback(
    (p: LatLng) => {
      const q = project(p, zoom);
      return {
        x: q.x - worldCenter.x + size.w / 2 + pan.x,
        y: q.y - worldCenter.y + size.h / 2 + pan.y,
      };
    },
    [zoom, worldCenter, size.w, size.h, pan.x, pan.y],
  );

  const tiles = React.useMemo(() => {
    if (tilesBroken || !cfg.tiles) return [];
    const z = Math.max(0, Math.min(MAX_ZOOM, Math.floor(zoom)));
    const scale = Math.pow(2, zoom - z);
    const cz = project(view.center, z);
    const left = cz.x - (size.w / 2 + pan.x) / scale;
    const top = cz.y - (size.h / 2 + pan.y) / scale;
    const n = Math.pow(2, z);
    const out: { key: string; url: string; left: number; top: number; px: number }[] = [];
    const x0 = Math.floor(left / TILE);
    const x1 = Math.floor((left + size.w / scale) / TILE);
    const y0 = Math.floor(top / TILE);
    const y1 = Math.floor((top + size.h / scale) / TILE);
    for (let ty = y0; ty <= y1; ty += 1) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = x0; tx <= x1; tx += 1) {
        const wrapped = ((tx % n) + n) % n;
        const url = tileUrl(cfg, z, wrapped, ty);
        if (!url) continue;
        out.push({
          key: `${z}/${tx}/${ty}`,
          url,
          left: (tx * TILE - left) * scale,
          top: (ty * TILE - top) * scale,
          px: TILE * scale,
        });
      }
    }
    return out;
  }, [cfg, tilesBroken, zoom, view.center, size.w, size.h, pan.x, pan.y]);

  /* ── dragging, so the customer can look around the neighbourhood ────────── */

  const drag = React.useRef<{ id: number; x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  /* ── geometry for the overlay ───────────────────────────────────────────── */

  const pts = React.useMemo(() => path.map(toScreen), [path, toScreen]);
  const shop = pts[0]!;
  const home = pts[pts.length - 1]!;
  const riderPos = rider ? toScreen(rider) : null;
  const cut = rider ? nearestIndex(path, rider) : 0;

  const line = (list: { x: number; y: number }[]) =>
    list.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const travelled = riderPos ? line([...pts.slice(0, cut + 1), riderPos]) : "";
  const ahead = riderPos ? line([riderPos, ...pts.slice(cut + 1)]) : line(pts);

  const offline = Boolean(rider?.offline);
  const stale = Boolean(rider?.stale) && !offline;
  const VehicleIcon = vehicle === "BICYCLE" || vehicle === "WALK" ? MapPin : Bike;

  return (
    <div
      ref={boxRef}
      className={cn(
        "relative overflow-hidden rounded-3xl border border-ink-100 bg-[#EEF2F5] shadow-card",
        "touch-none select-none",
        className,
      )}
      style={{ height }}
      role="group"
      aria-label="Live delivery map"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* a screen reader gets the facts in words; the graphics are decorative */}
      <p className="sr-only">
        {rider
          ? `The runner is on the way${
              metersRemaining != null && Number.isFinite(metersRemaining)
                ? `, with about ${humanDistance(metersRemaining)} of the route left to your address`
                : ""
            }.${offline ? " Their phone is currently offline." : stale ? " This is their last known position." : ""}`
          : "The shop and your delivery address are shown. The runner appears here once the delivery starts."}
      </p>

      {/* ── ground: always drawn, so a missing tile reveals a map, not a hole ── */}
      <FallbackCanvas />

      {/* ── tiles ───────────────────────────────────────────────────────── */}
      {tiles.length > 0 ? (
        <div className="absolute inset-0">
          {tiles.map((t) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={t.key}
              src={t.url}
              alt=""
              draggable={false}
              onError={onTileError}
              className="absolute will-change-transform"
              style={{ left: t.left, top: t.top, width: t.px, height: t.px }}
            />
          ))}
          <div className="pointer-events-none absolute inset-0 bg-white/10" />
        </div>
      ) : null}

      {/* ── route: white casing so it reads over any tile, dashed ahead,
             solid crimson behind ──────────────────────────────────────── */}
      <svg
        className="pointer-events-none absolute inset-0"
        width={size.w}
        height={size.h}
        viewBox={`0 0 ${size.w} ${size.h}`}
        aria-hidden
      >
        <circle cx={home.x} cy={home.y} r={30} fill="#E11945" fillOpacity={0.08} />
        <polyline
          points={ahead}
          fill="none"
          stroke="#ffffff"
          strokeOpacity={0.9}
          strokeWidth={9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points={ahead}
          fill="none"
          stroke="#8C9AAB"
          strokeWidth={4}
          strokeDasharray="2 9"
          strokeLinecap="round"
        />
        {travelled ? (
          <>
            <polyline
              points={travelled}
              fill="none"
              stroke="#ffffff"
              strokeOpacity={0.95}
              strokeWidth={10}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={travelled}
              fill="none"
              stroke="#E11945"
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : null}
      </svg>

      {/* ── pins ────────────────────────────────────────────────────────── */}
      <Marker x={shop.x} y={shop.y}>
        <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-ink-900 text-white shadow-float">
          <Store className="h-4 w-4" />
        </span>
      </Marker>
      <Marker x={home.x} y={home.y}>
        <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-[#0B7E58] text-white shadow-float">
          <MapPin className="h-4 w-4" />
        </span>
      </Marker>

      {/* ── the runner ───────────────────────────────────────────────────── */}
      {riderPos ? (
        <motion.div
          className="pointer-events-none absolute left-0 top-0"
          initial={{ x: riderPos.x, y: riderPos.y }}
          animate={{ x: riderPos.x, y: riderPos.y }}
          transition={{ type: "spring", stiffness: 80, damping: 18, mass: 0.7 }}
        >
          <div className="relative -translate-x-1/2 -translate-y-1/2">
            {!offline ? (
              <motion.span
                className="absolute inset-0 -m-2 rounded-full bg-crimson-500/25"
                animate={{ scale: [1, 2], opacity: [0.55, 0] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
              />
            ) : null}
            <span
              className="absolute inset-0 grid place-items-center"
              style={{ transform: `rotate(${rider?.heading ?? 0}deg)` }}
              aria-hidden
            >
              <svg width="44" height="44" viewBox="0 0 44 44" className="overflow-visible">
                <path
                  d="M22 -4 L27.5 6 L16.5 6 Z"
                  fill={offline ? "#8E9AA6" : stale ? "#B4750B" : "#E11945"}
                  stroke="#ffffff"
                  strokeWidth={1.6}
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span
              className={cn(
                "relative grid h-11 w-11 place-items-center rounded-full border-[3px] border-white shadow-float",
                offline ? "bg-ink-400" : stale ? "bg-[#B4750B]" : "bg-crimson-500",
              )}
            >
              <VehicleIcon className="h-5 w-5 text-white" />
            </span>
          </div>
        </motion.div>
      ) : null}

      {/* ── freshness, top-left ─────────────────────────────────────────── */}
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
            <>
              <WifiOff className="h-3.5 w-3.5" /> Runner&apos;s phone is offline
            </>
          ) : stale ? (
            <>
              <History className="h-3.5 w-3.5" /> Last known position
            </>
          ) : (
            <>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-crimson-500/70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-crimson-500" />
              </span>
              Live location
            </>
          )}
        </span>
        {source === "demo" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-900/75 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
            <Radio className="h-3 w-3" /> Sample movement — no API connected
          </span>
        ) : null}
      </div>

      {/* ── controls, top-right ─────────────────────────────────────────── */}
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <MapButton
          label="Zoom in"
          onClick={() => setZoomAdjust((z) => Math.min(4, z + 1))}
          disabled={zoom >= MAX_ZOOM}
        >
          <Plus className="h-4 w-4" />
        </MapButton>
        <MapButton
          label="Zoom out"
          onClick={() => setZoomAdjust((z) => Math.max(-4, z - 1))}
          disabled={zoom <= MIN_ZOOM}
        >
          <Minus className="h-4 w-4" />
        </MapButton>
        <MapButton
          label="Recentre on the route"
          onClick={() => {
            setZoomAdjust(0);
            setPan({ x: 0, y: 0 });
          }}
        >
          <Crosshair className="h-4 w-4" />
        </MapButton>
      </div>

      {/* ── distance, bottom-left. A fact, never a promised time. ────────── */}
      <div className="pointer-events-none absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)]">
        {riderPos && metersRemaining != null && Number.isFinite(metersRemaining) ? (
          <div className="rounded-2xl bg-white/95 px-3.5 py-2.5 shadow-float backdrop-blur">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">
              Route left to your door
            </p>
            <p className="font-display text-lg font-bold leading-tight text-ink-900">
              {humanDistance(metersRemaining)}
            </p>
            <p className="text-[11px] text-ink-500">
              Distance only — the shop decides the timing.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white/95 px-3.5 py-2 shadow-float backdrop-blur">
            <p className="text-xs font-semibold text-ink-800">Waiting for the runner to set off</p>
            <p className="text-[11px] text-ink-500">
              The map starts moving once the shop hands the parcel over.
            </p>
          </div>
        )}
      </div>

      {/* ── attribution: required by the tile providers ──────────────────── */}
      <p className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-ink-600/90">
        {tiles.length === 0
          ? "Offline map view"
          : cfg.provider === "mapbox"
            ? "© Mapbox © OpenStreetMap"
            : "© OpenStreetMap contributors"}
      </p>
    </div>
  );
}

/* ── small pieces ─────────────────────────────────────────────────────────── */

function Marker({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute" style={{ left: x, top: y }} aria-hidden>
      <div className="-translate-x-1/2 -translate-y-1/2">{children}</div>
    </div>
  );
}

function MapButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      /* stop the press from starting a map drag */
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-xl border border-ink-100 bg-white/95 text-ink-700 shadow-soft backdrop-blur transition",
        disabled ? "opacity-40" : "hover:bg-white hover:text-crimson-600 active:scale-95",
      )}
    >
      {children}
    </button>
  );
}

/**
 * What the map looks like with no tiles at all — a stylised valley canvas so
 * the route, pins and moving runner are still legible offline or with
 * NEXT_PUBLIC_MAP_PROVIDER=none. Purely decorative, hence the fixed geometry.
 */
function FallbackCanvas() {
  return (
    <div className="absolute inset-0 bg-[#F3F6F4]" aria-hidden>
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 400 240">
        <rect width="400" height="240" fill="#F3F6F4" />
        <path d="M0 168 C 70 150 130 186 210 164 C 280 145 340 172 400 158 L400 240 L0 240 Z" fill="#E4EDE6" />
        <path d="M-20 96 C 80 78 150 118 250 92 C 320 74 380 96 420 84" fill="none" stroke="#DCE4E8" strokeWidth="18" />
        <path d="M-20 96 C 80 78 150 118 250 92 C 320 74 380 96 420 84" fill="none" stroke="#F7FAF8" strokeWidth="3" strokeDasharray="10 12" />
        <path d="M120 -20 C 132 60 96 130 140 260" fill="none" stroke="#DCE4E8" strokeWidth="12" />
        <path d="M288 -20 C 276 70 312 140 268 260" fill="none" stroke="#DCE4E8" strokeWidth="12" />
        <g fill="#E8EEEA">
          <rect x="24" y="112" width="34" height="26" rx="3" />
          <rect x="76" y="126" width="28" height="22" rx="3" />
          <rect x="168" y="108" width="40" height="30" rx="3" />
          <rect x="232" y="122" width="30" height="24" rx="3" />
          <rect x="320" y="106" width="44" height="32" rx="3" />
        </g>
        <g fill="#CFE0D4">
          <circle cx="60" cy="196" r="9" />
          <circle cx="196" cy="204" r="7" />
          <circle cx="330" cy="192" r="10" />
        </g>
      </svg>
      <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_0%,rgba(255,255,255,0.55),transparent_60%)]" />
    </div>
  );
}

export default LiveRiderMap;
