"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";

/**
 * Delivery-coverage preview for a shop.
 *
 * Renders real raster tiles when a tile URL is configured, and falls back to an
 * abstract grid so the console works fully offline / before keys are added.
 * Configure with:
 *   NEXT_PUBLIC_MAP_TILE_URL=https://{provider}/{z}/{x}/{y}.png?key=__REPLACE_ME__
 */
const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL;

/** Slippy-map tile maths (Web Mercator). */
function lonToTileX(lon: number, z: number) {
  return ((lon + 180) / 360) * Math.pow(2, z);
}
function latToTileY(lat: number, z: number) {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z);
}

export function CoverageMap({
  lat,
  lng,
  radiusKm,
  label,
  className,
  height = 260,
}: {
  lat: number;
  lng: number;
  radiusKm: number;
  label?: string;
  className?: string;
  height?: number;
}) {
  const reduce = useReducedMotion();

  // Pick a zoom where the radius comfortably fits the viewport.
  const zoom = radiusKm <= 2 ? 14 : radiusKm <= 4 ? 13 : 12;
  const tileSize = 256;
  const cols = 3;
  const rows = 3;

  const cx = lonToTileX(lng, zoom);
  const cy = latToTileY(lat, zoom);
  const x0 = Math.floor(cx) - 1;
  const y0 = Math.floor(cy) - 1;

  // Metres per pixel at this latitude/zoom → radius in pixels.
  const mPerPx = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  const radiusPx = (radiusKm * 1000) / mPerPx;

  const viewW = cols * tileSize;
  const viewH = rows * tileSize;
  const pinX = (cx - x0) * tileSize;
  const pinY = (cy - y0) * tileSize;

  const tiles: { key: string; url: string; left: number; top: number }[] = [];
  if (TILE_URL) {
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const tx = x0 + i;
        const ty = y0 + j;
        tiles.push({
          key: `${tx}-${ty}`,
          url: TILE_URL.replace("{z}", String(zoom)).replace("{x}", String(tx)).replace("{y}", String(ty)),
          left: i * tileSize,
          top: j * tileSize,
        });
      }
    }
  }

  return (
    <div
      className={cn("relative overflow-hidden rounded-2xl border border-ink-100 bg-ink-50", className)}
      style={{ height }}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: viewW,
          height: viewH,
          transform: `translate(${-pinX}px, ${-pinY}px)`,
          marginLeft: 0,
          marginTop: 0,
        }}
      >
        {/* Tiles (when configured) */}
        {tiles.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={t.key}
            src={t.url}
            alt=""
            width={tileSize}
            height={tileSize}
            className="absolute select-none"
            style={{ left: t.left, top: t.top }}
            loading="lazy"
          />
        ))}

        {/* Abstract fallback grid */}
        {!TILE_URL && (
          <svg width={viewW} height={viewH} className="absolute inset-0" aria-hidden>
            <defs>
              <pattern id="gp-map-grid" width="48" height="48" patternUnits="userSpaceOnUse">
                <path d="M48 0H0V48" fill="none" stroke="rgba(24,20,20,0.07)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width={viewW} height={viewH} fill="#f2efee" />
            <rect width={viewW} height={viewH} fill="url(#gp-map-grid)" />
            <path
              d={`M0 ${viewH * 0.42} Q ${viewW * 0.3} ${viewH * 0.34}, ${viewW * 0.52} ${viewH * 0.48} T ${viewW} ${viewH * 0.4}`}
              fill="none"
              stroke="rgba(24,20,20,0.13)"
              strokeWidth="7"
            />
            <path
              d={`M${viewW * 0.36} 0 L${viewW * 0.44} ${viewH}`}
              fill="none"
              stroke="rgba(24,20,20,0.1)"
              strokeWidth="5"
            />
          </svg>
        )}

        {/* Radius ring + shop pin, anchored on the shop coordinates */}
        <div className="absolute" style={{ left: pinX, top: pinY }}>
          <motion.span
            className="absolute rounded-full border-2 border-crimson-500/60 bg-crimson-500/12"
            style={{
              width: radiusPx * 2,
              height: radiusPx * 2,
              left: -radiusPx,
              top: -radiusPx,
            }}
            initial={reduce ? undefined : { scale: 0.7, opacity: 0 }}
            animate={reduce ? undefined : { scale: 1, opacity: 1 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          />
          <span
            className="absolute h-3.5 w-3.5 rounded-full border-2 border-white bg-crimson-600 shadow"
            style={{ left: -7, top: -7 }}
          />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-white via-white/85 to-transparent px-4 pb-3 pt-8">
        <div>
          {label && <p className="text-sm font-bold text-ink-900">{label}</p>}
          <p className="text-xs text-ink-500">
            Delivers within {radiusKm} km · set by the shop
          </p>
        </div>
        {!TILE_URL && (
          <span className="rounded-full bg-ink-900/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
            Map key not set
          </span>
        )}
      </div>
    </div>
  );
}

export default CoverageMap;
