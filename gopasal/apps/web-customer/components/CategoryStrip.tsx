"use client";

import * as React from "react";
import Link from "next/link";
import {
  ShoppingBasket,
  Carrot,
  Pill,
  Croissant,
  Fish,
  Milk,
  PencilRuler,
  Plug,
  type LucideIcon,
} from "lucide-react";
import { CATEGORIES } from "@/lib/data";
import { useLang } from "@/components/providers";
import { motion } from "framer-motion";
import { stagger, fadeUp, inView } from "@/lib/motion";

const ICONS: Record<string, LucideIcon> = {
  ShoppingBasket,
  Carrot,
  Pill,
  Croissant,
  Fish,
  Milk,
  PencilRuler,
  Plug,
};

export function CategoryStrip() {
  const { lang } = useLang();
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      whileInView="show"
      viewport={inView}
      className="grid grid-cols-4 gap-3 sm:gap-4 md:grid-cols-8"
    >
      {CATEGORIES.map((c) => {
        const Icon = ICONS[c.icon] ?? ShoppingBasket;
        return (
          <motion.div key={c.slug} variants={fadeUp}>
            <Link
              href={`/category/${c.slug}`}
              className="group flex flex-col items-center gap-2 rounded-xl p-3 text-center transition hover:bg-white hover:shadow-soft"
            >
              <span
                className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl ${c.hue} text-crimson-600 transition group-hover:scale-110`}
              >
                <Icon className="h-6 w-6" />
              </span>
              <span className="text-xs font-semibold leading-tight text-ink-700">
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
