"use client";

import * as React from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { fadeUp, inView } from "@/lib/motion";

export function Reveal({
  children,
  delay = 0,
  className,
  variants = fadeUp as Variants,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  variants?: Variants;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={variants}
      custom={delay}
      initial="hidden"
      whileInView="show"
      viewport={inView}
    >
      {children}
    </motion.div>
  );
}

export default Reveal;
