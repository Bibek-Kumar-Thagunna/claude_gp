"use client";

import * as React from "react";
import { ChevronsUpDown, Check, Store, Layers, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { useShops } from "@/components/shop-provider";
import type { SellerShop } from "@/lib/shop-view";

const ACCENT_DOT: Record<string, string> = {
  crimson: "bg-crimson-500",
  green: "bg-[#0B9E6B]",
  marigold: "bg-[#F6A609]",
  blue: "bg-[#2563EB]",
};

/** Accent name → dot colour, falling back to the brand crimson if unrecognised. */
const accentDot = (accent: string | undefined): string =>
  ACCENT_DOT[accent ?? "crimson"] ?? "bg-crimson-500";

/**
 * The second line of a shop row.
 *
 * A shop that is not live has something the seller needs to know, and that
 * outranks its address: a PENDING shop is waiting on GoPasal, a SUSPENDED one
 * cannot trade. `statusLabel` comes from the shop's own lifecycle, so this is
 * the record talking, not a guess.
 */
function shopSub(shop: SellerShop): string {
  if (shop.status !== "ACTIVE") return shop.statusLabel;
  return shop.area ?? "";
}

/** Master-Merchant shop switcher: pick one shop, or "All shops" (consolidated). */
export function ShopSwitcher() {
  const { shops, activeShop, activeShopId, switchShop, loading, error } = useShops();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Three states before there is anything to switch between, and each says what
  // is true rather than showing an empty shop with a name-shaped blank.
  if (loading) {
    return (
      <div className="flex w-full items-center gap-2.5 rounded-xl border border-ink-200 bg-white px-3 py-2.5">
        <span className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-ink-100" />
        <span className="min-w-0 flex-1 space-y-1.5">
          <span className="block h-3 w-24 animate-pulse rounded bg-ink-100" />
          <span className="block h-2.5 w-16 animate-pulse rounded bg-ink-50" />
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex w-full items-start gap-2.5 rounded-xl border border-[#F3C6C6] bg-[#FEF6F6] px-3 py-2.5">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-crimson-600" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink-900">Shops unavailable</span>
          <span className="block text-xs text-ink-500">{error.message}</span>
        </span>
      </div>
    );
  }

  if (shops.length === 0) {
    return (
      <div className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-ink-200 px-3 py-2.5">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-400">
          <Store className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink-900">No shop yet</span>
          <span className="block truncate text-xs text-ink-400">Finish your application to open one</span>
        </span>
      </div>
    );
  }

  // One shop is not a portfolio: there is nothing to consolidate and nothing to
  // switch to, so the control becomes a plain label.
  const single = shops.length === 1 ? shops[0] : undefined;
  const consolidated = activeShopId === null;
  const label = consolidated ? "All shops" : activeShop?.name ?? "Select shop";
  const sub = consolidated ? "Consolidated view" : activeShop ? shopSub(activeShop) : "";

  if (single) {
    return (
      <div className="flex w-full items-center gap-2.5 rounded-xl border border-ink-200 bg-white px-3 py-2.5">
        <span
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white",
            accentDot(single.accent),
          )}
        >
          <Store className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink-900">{single.name}</span>
          <span className="block truncate text-xs text-ink-400">{shopSub(single)}</span>
        </span>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-crimson-200"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white",
            consolidated ? "bg-ink-800" : accentDot(activeShop?.accent),
          )}
        >
          {consolidated ? <Layers className="h-4 w-4" /> : <Store className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink-900">{label}</span>
          <span className="block truncate text-xs text-ink-400">{sub}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-ink-400" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-40 mt-2 w-full overflow-hidden rounded-xl border border-ink-200 bg-white p-1.5 shadow-xl"
        >
          <Option
            active={consolidated}
            onClick={() => {
              switchShop(null);
              setOpen(false);
            }}
            icon={<Layers className="h-4 w-4" />}
            iconBg="bg-ink-800"
            title="All shops"
            sub={`Consolidated across ${shops.length} shops`}
          />
          <div className="my-1 border-t border-ink-100" />
          {shops.map((s) => (
            <Option
              key={s.id}
              active={activeShopId === s.id}
              onClick={() => {
                switchShop(s.id);
                setOpen(false);
              }}
              icon={<Store className="h-4 w-4" />}
              iconBg={accentDot(s.accent)}
              title={s.name}
              sub={shopSub(s)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Option({
  active,
  onClick,
  icon,
  iconBg,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
        active ? "bg-crimson-50" : "hover:bg-ink-50",
      )}
    >
      <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg text-white", iconBg)}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink-900">{title}</span>
        <span className="block truncate text-xs text-ink-400">{sub}</span>
      </span>
      {active && <Check className="h-4 w-4 shrink-0 text-crimson-600" />}
    </button>
  );
}
