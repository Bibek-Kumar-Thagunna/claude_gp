"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { rsCompact, num, dayMonth } from "@/lib/format";
import type { TrendPoint } from "@/lib/data";

type Metric = "gmv" | "orders";

/**
 * Dependency-free area + line chart for the platform trend series.
 * Hovering snaps to the nearest day and shows a crosshair with a tooltip.
 */
export function TrendChart({
  data,
  metric = "gmv",
  className,
  height = 240,
}: {
  data: TrendPoint[];
  metric?: Metric;
  className?: string;
  height?: number;
}) {
  const [active, setActive] = React.useState<number | null>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  const W = 1000;
  const H = 300;
  const padY = 18;

  const values = data.map((d) => (metric === "gmv" ? d.gmv : d.orders));
  const max = Math.max(1, ...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min * 0.82);

  const x = (i: number) => (data.length <= 1 ? 0 : (i / (data.length - 1)) * W);
  const y = (v: number) => H - padY - ((v - min * 0.82) / span) * (H - padY * 2);

  const linePath = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L${W} ${H} L0 ${H} Z`;

  const onMove = (clientX: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setActive(Math.round(ratio * (data.length - 1)));
  };

  const point = active != null ? data[active] ?? null : null;
  // Read the highlighted value off the point itself rather than re-indexing the
  // parallel `values` array, so one existence check covers both.
  const activeValue = point ? (metric === "gmv" ? point.gmv : point.orders) : null;

  return (
    <div className={cn("w-full", className)}>
      <div
        ref={wrapRef}
        className="relative w-full"
        style={{ height }}
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setActive(null)}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          if (touch) onMove(touch.clientX);
        }}
        onTouchMove={(e) => {
          const touch = e.touches[0];
          if (touch) onMove(touch.clientX);
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
          role="img"
          aria-label={`${metric === "gmv" ? "GMV" : "Orders"} over the last ${data.length} days`}
        >
          <defs>
            <linearGradient id="gp-trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E11945" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#E11945" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0.25, 0.5, 0.75].map((g) => (
            <line
              key={g}
              x1="0"
              x2={W}
              y1={padY + g * (H - padY * 2)}
              y2={padY + g * (H - padY * 2)}
              stroke="rgba(24,20,20,0.07)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path d={areaPath} fill="url(#gp-trend-fill)" />
          <path
            d={linePath}
            fill="none"
            stroke="#E11945"
            strokeWidth="2.4"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {active != null && activeValue != null && (
            <>
              <line
                x1={x(active)}
                x2={x(active)}
                y1={padY * 0.4}
                y2={H}
                stroke="#E11945"
                strokeWidth="1"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
              <circle cx={x(active)} cy={y(activeValue)} r="5" fill="#fff" stroke="#E11945" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>

        {point && active != null && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl bg-ink-900 px-3 py-2 text-center text-xs text-white shadow-lg"
            style={{ left: `${(active / Math.max(1, data.length - 1)) * 100}%` }}
          >
            <div className="font-semibold">
              {metric === "gmv" ? rsCompact(point.gmv) : `${num(point.orders)} orders`}
            </div>
            <div className="text-ink-300">{dayMonth(point.day)}</div>
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-between text-xs font-medium text-ink-400">
        <span>{dayMonth(data[0]?.day ?? "")}</span>
        {data.length > 8 && <span>{dayMonth(data[Math.floor(data.length / 2)]?.day ?? "")}</span>}
        <span>{dayMonth(data[data.length - 1]?.day ?? "")}</span>
      </div>
    </div>
  );
}

export default TrendChart;
