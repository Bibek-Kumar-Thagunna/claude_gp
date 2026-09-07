"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { rs } from "@/lib/format";
import { dayLabel, fullDayLabel, labelStride } from "@/lib/analytics-view";
import type { SalesPointWire } from "@/lib/api/analytics";

/**
 * Dependency-free bar chart over the API's daily series.
 *
 * Two deliberate choices:
 *
 * - **Every day the API returned gets a bar**, including the days that sold nothing —
 *   a zero is a fact about that day, and dropping it would compress the calendar and
 *   make a quiet week look busy. For a 90-day window only every tenth *label* is
 *   drawn, which hides no data.
 * - **Dates are formatted from the `YYYY-MM-DD` string**, never through `new Date()`,
 *   because these are Nepal calendar days and UTC parsing would shift them.
 */
export function SalesBarChart({
  data,
  className,
}: {
  data: SalesPointWire[];
  className?: string;
}) {
  const [active, setActive] = React.useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.sales));
  const stride = labelStride(data.length);
  const dense = data.length > 31;
  const gap = dense ? "gap-px" : data.length > 10 ? "gap-1" : "gap-2 sm:gap-3";

  return (
    <div className={cn("w-full", className)}>
      <div className={cn("flex h-52 items-end", gap)}>
        {data.map((d, i) => {
          const h = Math.max(2, (d.sales / max) * 100);
          const on = active === i;
          return (
            <button
              key={d.date}
              type="button"
              className="group relative flex flex-1 flex-col items-center justify-end"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${fullDayLabel(d.date)}: ${rs(d.sales)} from ${d.orders} ${
                d.orders === 1 ? "order" : "orders"
              }`}
            >
              {on && (
                <div className="absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded-lg bg-ink-900 px-2.5 py-1.5 text-center text-xs text-white shadow-lg">
                  <div className="font-semibold">{rs(d.sales)}</div>
                  <div className="text-ink-300">
                    {d.orders} {d.orders === 1 ? "order" : "orders"}
                  </div>
                  <div className="text-ink-400">{dayLabel(d.date)}</div>
                </div>
              )}
              <div
                className={cn(
                  "w-full transition-all duration-300",
                  dense ? "rounded-t-sm" : "rounded-t-lg",
                  on ? "bg-crimson-500" : "bg-crimson-200 group-hover:bg-crimson-300",
                )}
                style={{ height: `${h}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className={cn("mt-2 flex", gap)} aria-hidden="true">
        {data.map((d, i) => (
          <div
            key={d.date}
            className="flex-1 overflow-hidden text-center text-xs font-medium text-ink-400"
          >
            {i % stride === 0 ? dayLabel(d.date) : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
