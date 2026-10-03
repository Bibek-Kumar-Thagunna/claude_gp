"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { rs } from "@/lib/format";
import { dayLabel, fullDayLabel } from "@/lib/analytics-view";
import type { SalesPointWire } from "@/lib/api/analytics";

/** Responsive revenue area chart with pointer/touch inspection and honest zero-day spacing. */
export function SalesBarChart({ data, className }: { data: SalesPointWire[]; className?: string }) {
  const [active, setActive] = React.useState<number | null>(null);
  const frame = React.useRef<HTMLDivElement>(null);
  const gradientId = React.useId().replaceAll(":", "");
  const width = 1000;
  const height = 260;
  const top = 18;
  const bottom = 20;
  const values = data.map((row) => row.sales);
  const max = Math.max(1, ...values);
  const x = (index: number) => data.length <= 1 ? width / 2 : index / (data.length - 1) * width;
  const y = (value: number) => height - bottom - value / max * (height - top - bottom);
  const line = values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(2)} ${y(value).toFixed(2)}`).join(" ");
  const area = data.length ? `${line} L${x(data.length - 1)} ${height - bottom} L${x(0)} ${height - bottom} Z` : "";
  const inspect = (clientX: number) => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect || data.length === 0) return;
    setActive(Math.round(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * (data.length - 1)));
  };
  const point = active == null ? null : data[active] ?? null;

  return <div className={cn("w-full", className)}>
    <div ref={frame} className="relative h-64 w-full touch-pan-y" onMouseMove={(event) => inspect(event.clientX)} onMouseLeave={() => setActive(null)} onTouchStart={(event) => { const touch = event.touches[0]; if (touch) inspect(touch.clientX); }} onTouchMove={(event) => { const touch = event.touches[0]; if (touch) inspect(touch.clientX); }}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-label={`Delivered sales in rupees for ${data.length} Nepal days`}>
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E11945" stopOpacity="0.25" /><stop offset="100%" stopColor="#E11945" stopOpacity="0.02" /></linearGradient></defs>
        {[0, .25, .5, .75, 1].map((position) => <line key={position} x1="0" x2={width} y1={top + position * (height - top - bottom)} y2={top + position * (height - top - bottom)} stroke="rgba(24,20,20,.08)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        {area && <path d={area} fill={`url(#${gradientId})`} />}
        {line && <path d={line} fill="none" stroke="#E11945" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
        {point && active != null && <><line x1={x(active)} x2={x(active)} y1={top} y2={height - bottom} stroke="#E11945" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" /><circle cx={x(active)} cy={y(point.sales)} r="5" fill="white" stroke="#E11945" strokeWidth="2.5" vectorEffect="non-scaling-stroke" /></>}
      </svg>
      {point && active != null && <div className="pointer-events-none absolute top-0 z-10 min-w-32 -translate-x-1/2 rounded-xl bg-ink-900 px-3 py-2 text-center text-xs text-white" style={{ left: `${active / Math.max(1, data.length - 1) * 100}%` }}><strong className="block text-sm">{rs(point.sales)}</strong><span className="text-ink-300">{point.orders} {point.orders === 1 ? "order" : "orders"}</span><span className="block text-ink-400">{fullDayLabel(point.date)}</span></div>}
    </div>
    <div className="mt-1 flex justify-between text-xs font-medium text-ink-400"><span>{dayLabel(data[0]?.date ?? "")}</span>{data.length > 8 && <span>{dayLabel(data[Math.floor(data.length / 2)]?.date ?? "")}</span>}<span>{dayLabel(data[data.length - 1]?.date ?? "")}</span></div>
    <div className="mt-3 flex items-center gap-2 text-xs text-ink-500"><span className="h-0.5 w-5 bg-crimson-500" /> Delivered sales (NPR)</div>
  </div>;
}
