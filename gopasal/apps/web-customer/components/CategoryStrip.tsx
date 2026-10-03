"use client";

import * as React from "react";
import Link from "next/link";
import {
  ShoppingBasket,
  Carrot,
  Pill,
  Croissant,
  Fish,
  LaptopMinimal,
  Printer,
  CookingPot,
  type LucideIcon,
} from "lucide-react";
import { listCategories } from "@/lib/api/customer";
import type { Category } from "@/lib/data";
import { useLang } from "@/components/providers";
import { motion } from "framer-motion";
import { stagger, fadeUp, inView } from "@/lib/motion";

const CATEGORY_VISUALS: Record<string, { icon: LucideIcon; gradient: string; glow: string }> = {
  grocery: { icon: ShoppingBasket, gradient: "from-amber-400 to-orange-500", glow: "shadow-orange-200/70" },
  vegetables: { icon: Carrot, gradient: "from-emerald-400 to-green-600", glow: "shadow-emerald-200/70" },
  pharmacy: { icon: Pill, gradient: "from-rose-500 to-red-600", glow: "shadow-rose-200/70" },
  "meat-fish": { icon: Fish, gradient: "from-sky-400 to-blue-600", glow: "shadow-sky-200/70" },
  bakery: { icon: Croissant, gradient: "from-orange-400 to-amber-600", glow: "shadow-amber-200/70" },
  electronics: { icon: LaptopMinimal, gradient: "from-indigo-500 to-violet-600", glow: "shadow-indigo-200/70" },
  "print-copy": { icon: Printer, gradient: "from-violet-500 to-purple-700", glow: "shadow-violet-200/70" },
  restaurant: { icon: CookingPot, gradient: "from-fuchsia-500 to-crimson-600", glow: "shadow-pink-200/70" },
};

export function CategoryStrip() {
  const { lang } = useLang();
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    const controller = new AbortController();
    void listCategories(controller.signal).then(setCategories).catch((cause: unknown) => {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : "Could not load categories");
      }
    });
    return () => controller.abort();
  }, []);
  if (error) return <p className="rounded-xl bg-crimson-50 p-4 text-sm text-crimson-700">{error}</p>;
  if (categories.length === 0) return <p className="text-sm text-ink-500">Loading categories…</p>;
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      whileInView="show"
      viewport={inView}
      className="grid grid-cols-4 gap-3 sm:gap-4 md:grid-cols-8"
    >
      {categories.map((c) => {
        const visual = CATEGORY_VISUALS[c.slug] ?? {
          icon: ShoppingBasket,
          gradient: "from-slate-500 to-slate-700",
          glow: "shadow-slate-200/70",
        };
        const Icon = visual.icon;
        return (
          <motion.div key={c.slug} variants={fadeUp}>
            <Link
              href={`/category/${c.slug}`}
              className="group flex h-full flex-col items-center gap-3 rounded-2xl border border-transparent bg-white/60 px-2 py-3 text-center transition duration-200 hover:-translate-y-1 hover:border-ink-100 hover:bg-white hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-300"
            >
              <span
                className={`relative inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-[1.35rem] bg-gradient-to-br ${visual.gradient} shadow-lg ${visual.glow} transition duration-200 group-hover:scale-105 group-hover:shadow-xl`}
              >
                <span className="absolute -right-2 -top-3 h-8 w-8 rounded-full bg-white/20" />
                <span className="absolute -bottom-4 -left-2 h-10 w-10 rounded-full bg-black/10" />
                <Icon className="relative h-8 w-8 text-white drop-shadow-sm" strokeWidth={2.15} aria-hidden />
              </span>
              <span className="text-xs font-bold leading-tight text-ink-800 transition-colors group-hover:text-crimson-700">
                {lang === "np" ? c.np : c.en}
              </span>
            </Link>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

export default CategoryStrip;
