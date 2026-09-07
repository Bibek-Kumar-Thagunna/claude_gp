"use client";

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

/**
 * Premium animated splash shown once per session when the seller console opens.
 * The Aankhijhyal lattice window "draws" itself, the marigold eye blooms, then
 * the screen lifts away to reveal the dashboard.
 */
export function Splash() {
  const [show, setShow] = React.useState(true);
  const reduce = useReducedMotion();

  React.useEffect(() => {
    if (typeof window !== "undefined" && window.sessionStorage.getItem("gp-seller-splash-seen")) {
      setShow(false);
      return;
    }
    const ms = reduce ? 500 : 1700;
    const timer = window.setTimeout(() => {
      setShow(false);
      try {
        window.sessionStorage.setItem("gp-seller-splash-seen", "1");
      } catch {
        /* ignore */
      }
    }, ms);
    return () => window.clearTimeout(timer);
  }, [reduce]);

  const draw = {
    hidden: { pathLength: 0, opacity: 0 },
    show: {
      pathLength: 1,
      opacity: 1,
      transition: { pathLength: { duration: 1, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.2 } },
    },
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="splash"
          aria-hidden
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
          style={{ background: "linear-gradient(160deg, #E11945 0%, #B60E33 55%, #6E0A20 100%)" }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04, transition: { duration: 0.6, ease: [0.65, 0, 0.35, 1] } }}
        >
          <motion.div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(600px 400px at 50% 42%, rgba(255,255,255,0.16), transparent 70%)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          />

          <motion.svg
            width="120"
            height="140"
            viewBox="0 0 48 56"
            fill="none"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.rect
              x="3" y="51" width="42" height="5" rx="2" fill="#fff"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.4 }}
            />
            <motion.path
              d="M8 51 L8 22 Q8 19.6 9.6 18 L22.4 5.2 Q24 3.6 25.6 5.2 L38.4 18 Q40 19.6 40 22 L40 51"
              stroke="#fff" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round"
              variants={draw} initial="hidden" animate="show"
            />
            <motion.path
              d="M24 9 L24 51 M11 31 L37 31"
              stroke="#fff" strokeWidth="2.2" strokeLinecap="round"
              variants={draw} initial="hidden" animate="show"
              transition={{ delay: 0.4 }}
            />
            <motion.path
              d="M24 22 L31 31 L24 40 L17 31 Z" fill="#F6A609"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 1, type: "spring", stiffness: 260, damping: 16 }}
              style={{ transformOrigin: "24px 31px" }}
            />
          </motion.svg>

          <motion.div
            className="mt-6 font-display text-3xl font-bold tracking-tight text-white"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.05, duration: 0.5 }}
          >
            GoPasal <span className="font-medium text-white/70">Seller</span>
          </motion.div>
          <motion.div
            className="mt-1 text-sm text-white/80"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.25, duration: 0.5 }}
          >
            तपाईंको पसल, तपाईंकै नियन्त्रणमा
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
