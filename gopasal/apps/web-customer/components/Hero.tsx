"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Search, MapPin, ShieldCheck, Store as StoreIcon, MessageCircle } from "lucide-react";
import { useLang } from "@/components/providers";
import { t } from "@/lib/i18n";
import { Button } from "@/components/primitives";
import { PhoneMockup } from "@/components/PhoneMockup";
import { fadeUp, stagger } from "@/lib/motion";

const STATS = [
  { icon: StoreIcon, value: "1,200+", label: "Local shops" },
  { icon: MapPin, value: "18", label: "Cities" },
  { icon: ShieldCheck, value: "Verified", label: "Trusted sellers" },
];

export function Hero() {
  const { lang } = useLang();

  return (
    <section className="relative overflow-x-clip">
      {/* NOTE: overflow-x-clip (not overflow-hidden) — clips the decorative
          blobs horizontally so they can't cause sideways scroll, while leaving
          the vertical axis visible. overflow-hidden was slicing the phone's
          blurred contact shadow flat at the section's bottom edge, which
          rendered as a hard horizontal line just below the device. */}
      {/* layered premium crimson background — masked to dissolve into the paper
          body at the bottom so the pattern/gradient never ends in a hard line */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-crimson-glow [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_50%,transparent_90%)] [mask-image:linear-gradient(to_bottom,#000_0%,#000_50%,transparent_90%)]" />
      <div className="gp-dot-grid pointer-events-none absolute inset-0 -z-10 opacity-70 [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_45%,transparent_85%)] [mask-image:linear-gradient(to_bottom,#000_0%,#000_45%,transparent_85%)]" />
      <div className="pointer-events-none absolute -right-32 -top-28 -z-10 h-[30rem] w-[30rem] rounded-full bg-crimson-200/50 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 top-44 -z-10 h-72 w-72 rounded-full bg-[#F6A609]/10 blur-3xl" />

      <div className="gp-container grid items-center gap-12 py-12 md:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
        {/* left — copy, search, stats */}
        <motion.div variants={stagger} initial="hidden" animate="show">
          <motion.div variants={fadeUp}>
            <span className="inline-flex items-center gap-2 rounded-full border border-crimson-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-crimson-700 shadow-sm backdrop-blur">
              <span className="deva">नेपालको आफ्नै</span> hyperlocal marketplace
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="mt-5 text-7xl font-extrabold leading-[1.05] text-ink-900"
          >
            {t("heroTitle", lang)}
          </motion.h1>

          {/* crimson → marigold brush accent */}
          <motion.span
            variants={fadeUp}
            aria-hidden
            className="mt-4 block h-1.5 w-28 rounded-full bg-gradient-to-r from-crimson-500 to-[#F6A609]"
          />

          <motion.p
            variants={fadeUp}
            className="mt-5 max-w-xl text-base leading-relaxed text-ink-600 md:text-lg"
          >
            {t("heroSub", lang)}
          </motion.p>

          {/* search */}
          <motion.div variants={fadeUp} className="mt-7 max-w-xl">
            <div className="flex items-center gap-2 rounded-full border border-ink-200 bg-white p-2 shadow-card">
              <div className="flex flex-1 items-center gap-2 pl-3">
                <Search className="h-5 w-5 shrink-0 text-ink-400" />
                <input
                  type="search"
                  placeholder={t("searchPlaceholder", lang)}
                  className="w-full bg-transparent py-2 text-sm outline-none md:text-base"
                />
              </div>
              <Button size="md" className="shrink-0">
                <MapPin className="h-4 w-4" /> {t("useLocation", lang)}
              </Button>
            </div>
          </motion.div>

          {/* honest no-ETA reassurance */}
          <motion.p
            variants={fadeUp}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-ink-500"
          >
            <MessageCircle className="h-3.5 w-3.5 text-crimson-500" />
            Connect directly with the shopkeeper — the shop sets the delivery time.
          </motion.p>

          {/* stats */}
          <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-x-8 gap-y-4">
            {STATS.map((s) => (
              <div key={s.label} className="flex items-center gap-2.5">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-crimson-50 text-crimson-600">
                  <s.icon className="h-5 w-5" />
                </span>
                <div>
                  <div className="font-display text-lg font-bold leading-none text-ink-900">
                    {s.value}
                  </div>
                  <div className="text-xs text-ink-500">{s.label}</div>
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* right — live phone mockup */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          className="order-first lg:order-none"
        >
          <PhoneMockup />
        </motion.div>
      </div>
    </section>
  );
}

export default Hero;
