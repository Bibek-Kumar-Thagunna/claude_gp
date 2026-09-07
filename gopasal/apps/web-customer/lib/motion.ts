import { easing } from "@gopasal/tokens";

/** Shared Framer Motion variants for premium, consistent motion. */

export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.06, ease: easing.out },
  }),
};

export const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.5, ease: easing.out } },
};

export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: easing.out } },
};

/** Standard viewport config for scroll reveals — trigger once, a little early. */
export const inView = { once: true, margin: "0px 0px -12% 0px", amount: 0.2 } as const;
