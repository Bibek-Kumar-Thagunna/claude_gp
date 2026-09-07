"use client";

import * as React from "react";
import Link from "next/link";
import { STORES, CATEGORIES } from "@/lib/data";
import { ShopCard } from "@/components/ShopCard";
import { Reveal } from "@/components/Reveal";
import { useLang } from "@/components/providers";
import { cn } from "@/lib/cn";

export function ShopsExplorer({ initialCategory }: { initialCategory?: string }) {
  const { lang } = useLang();
  const [active, setActive] = React.useState<string>(initialCategory ?? "all");

  const shops = active === "all" ? STORES : STORES.filter((s) => s.category === active);

  return (
    <div className="gp-container py-10">
      <Reveal>
        <h1 className="text-3xl font-bold text-ink-900 md:text-4xl">Shops near you</h1>
        <p className="mt-2 text-ink-600">Browse verified neighbourhood shops across the valley.</p>
      </Reveal>

      {/* filter chips */}
      <div className="mt-6 flex flex-wrap gap-2">
        <Chip active={active === "all"} onClick={() => setActive("all")}>
          All
        </Chip>
        {CATEGORIES.map((c) => (
          <Chip key={c.slug} active={active === c.slug} onClick={() => setActive(c.slug)}>
            {lang === "np" ? c.np : c.en}
          </Chip>
        ))}
      </div>

      {shops.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-lg font-semibold text-ink-800">No shops here yet</p>
          <p className="mt-2 text-ink-500">
            We’re onboarding shops in this category.{" "}
            <Link href="/sell" className="font-semibold text-crimson-600 hover:underline">
              Run one? List it →
            </Link>
          </p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shops.map((store, i) => (
            <Reveal key={store.slug} delay={i}>
              <ShopCard store={store} />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-4 py-2 text-sm font-semibold transition",
        active
          ? "border-crimson-500 bg-crimson-500 text-white shadow-crimson"
          : "border-ink-200 bg-white text-ink-700 hover:border-crimson-300",
      )}
    >
      {children}
    </button>
  );
}

export default ShopsExplorer;
