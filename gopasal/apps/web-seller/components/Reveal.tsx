"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { fadeUp, inView } from "@/lib/motion";

/**
 * The console's one entrance animation, applied to a block as it scrolls in.
 *
 * There used to be a `variants` prop so a screen could pass its own entrance. No
 * screen ever did, and the variants it existed to accept — `fadeIn`, `stagger`,
 * `scaleIn` — were removed from `lib/motion.ts` for the same reason, so the only
 * value the prop could still take was its own default. `fadeUp` is deliberately
 * the single house motion: one entrance is what makes the dashboard feel like one
 * application. `delay` is an index, not seconds — `fadeUp.show` multiplies it.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      custom={delay}
      initial="hidden"
      whileInView="show"
      viewport={inView}
    >
      {children}
    </motion.div>
  );
}
