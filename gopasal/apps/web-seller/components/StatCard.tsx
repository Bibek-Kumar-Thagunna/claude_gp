import * as React from "react";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Tone } from "@/components/primitives";

const TONE_ICON: Record<Tone, string> = {
  crimson: "bg-crimson-50 text-crimson-600",
  green: "bg-[#EAF7EF] text-[#0B7E58]",
  marigold: "bg-[#FFF3DF] text-[#8a5a00]",
  blue: "bg-[#EAF1FE] text-[#1D4ED8]",
  ink: "bg-ink-100 text-ink-600",
  red: "bg-red-50 text-[#c02636]",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "crimson",
  delta,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  delta?: number; // percent change; positive = up
  hint?: string;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className="gp-stat">
      <div className="flex items-start justify-between">
        <span className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl", TONE_ICON[tone])}>
          <Icon className="h-5 w-5" />
        </span>
        {delta != null && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
              up ? "bg-[#EAF7EF] text-[#0B7E58]" : "bg-red-50 text-[#c02636]",
            )}
          >
            {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold text-ink-900">{value}</p>
      <p className="mt-0.5 text-sm text-ink-500">{label}</p>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}
