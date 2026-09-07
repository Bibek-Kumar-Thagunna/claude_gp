"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";

const TONE_BAR: Record<string, string> = {
  crimson: "bg-crimson-500",
  green: "bg-[#0B7E58]",
  marigold: "bg-[#F6A609]",
  blue: "bg-[#1D4ED8]",
  ink: "bg-ink-500",
  red: "bg-[#c02636]",
};

export type BarRow = {
  label: string;
  value: number;
  /** Right-hand formatted display value. */
  display: string;
  hint?: string;
  tone?: string;
};

/** Horizontal ranked bars — used for category, city and payment breakdowns. */
export function BarList({ rows, className }: { rows: BarRow[]; className?: string }) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <ul className={cn("space-y-3.5", className)}>
      {rows.map((r, i) => (
        <li key={r.label}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-semibold text-ink-800">{r.label}</span>
            <span className="shrink-0 text-sm font-bold text-ink-900">{r.display}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
            <motion.div
              className={cn("h-full rounded-full", TONE_BAR[r.tone ?? "crimson"] ?? TONE_BAR.crimson)}
              initial={reduce ? undefined : { width: 0 }}
              whileInView={reduce ? undefined : { width: `${(r.value / max) * 100}%` }}
              style={reduce ? { width: `${(r.value / max) * 100}%` } : undefined}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.7, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          {r.hint && <p className="mt-1 text-xs text-ink-400">{r.hint}</p>}
        </li>
      ))}
    </ul>
  );
}

export default BarList;
