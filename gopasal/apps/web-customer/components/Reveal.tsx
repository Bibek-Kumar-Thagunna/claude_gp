"use client";

import * as React from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { fadeUp, inView } from "@/lib/motion";

/**
 * Scroll-reveal wrapper. Children fade + rise into view once.
 *
 * SSR-safety contract (do not "simplify" this away):
 * The server and the *first* client render must be byte-identical, and the
 * content must be visible by default. We therefore never branch the rendered
 * markup on a client-only value (`useReducedMotion`, `window`, etc.) during the
 * first paint. Previously this component switched between a `motion` element
 * (initial `opacity:0`) on the server and a plain element on the client when
 * reduced-motion was on — that produced a hydration mismatch, and because React
 * does not patch up attribute mismatches, the server's `opacity:0` stuck to the
 * DOM and every revealed section rendered blank.
 *
 * Instead: before mount (and whenever reduced motion is requested) we render the
 * element fully visible with no reveal animation. The scroll reveal is applied
 * only after mount, on the client, where it can never desync from SSR.
 */
export function Reveal({
  children,
  delay = 0,
  as = "div",
  className,
  variants = fadeUp as Variants,
}: {
  children: React.ReactNode;
  delay?: number;
  as?: keyof typeof motion;
  className?: string;
  variants?: Variants;
}) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const Comp = motion[as] as typeof motion.div;

  // Server + first client render: identical, fully visible, no animation.
  // Also the permanent path for reduced-motion users.
  if (!mounted || reduce) {
    return <Comp className={className}>{children}</Comp>;
  }

  // Post-mount enhancement only. The `key` forces a fresh mount so Framer's
  // `initial="hidden"` applies and the reveal actually plays.
  return (
    <Comp
      key="reveal"
      className={className}
      variants={variants}
      custom={delay}
      initial="hidden"
      whileInView="show"
      viewport={inView}
    >
      {children}
    </Comp>
  );
}

export default Reveal;
