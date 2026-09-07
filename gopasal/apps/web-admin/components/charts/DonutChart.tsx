"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";

const TONE_HEX: Record<string, string> = {
  crimson: "#E11945",
  green: "#0B7E58",
  marigold: "#F6A609",
  blue: "#1D4ED8",
  ink: "#4A423F",
  red: "#c02636",
};

export type DonutSlice = { label: string; value: number; tone?: string; display?: string };

/** Dependency-free donut for share-of-total breakdowns (payment mix, order status). */
export function DonutChart({
  slices,
  centerLabel,
  centerValue,
  size = 176,
  thickness = 20,
  className,
}: {
  slices: DonutSlice[];
  centerLabel?: string;
  centerValue?: string;
  size?: number;
  thickness?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const total = Math.max(1, slices.reduce((s, x) => s + x.value, 0));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;

  let offset = 0;

  return (
    <div className={cn("flex flex-col items-center gap-5 sm:flex-row sm:items-center", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Share breakdown">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(24,20,20,0.07)" strokeWidth={thickness} />
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {slices.map((s, i) => {
              const frac = s.value / total;
              const dash = frac * c;
              const el = (
                <motion.circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={TONE_HEX[s.tone ?? "crimson"] ?? TONE_HEX.crimson}
                  strokeWidth={thickness}
                  strokeLinecap="butt"
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-offset}
                  initial={reduce ? undefined : { opacity: 0 }}
                  animate={reduce ? undefined : { opacity: 1 }}
                  transition={{ duration: 0.5, delay: i * 0.09 }}
                />
              );
              offset += dash;
              return el;
            })}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerValue && <span className="text-xl font-bold text-ink-900">{centerValue}</span>}
          {centerLabel && <span className="mt-0.5 text-xs text-ink-500">{centerLabel}</span>}
        </div>
      </div>

      <ul className="w-full space-y-2.5">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: TONE_HEX[s.tone ?? "crimson"] ?? TONE_HEX.crimson }}
                aria-hidden
              />
              <span className="truncate text-ink-700">{s.label}</span>
            </span>
            <span className="shrink-0 font-semibold text-ink-900">
              {s.display ?? `${Math.round((s.value / total) * 1000) / 10}%`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default DonutChart;
