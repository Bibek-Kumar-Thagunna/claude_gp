import { easing } from "@gopasal/tokens";

/** Shared Framer Motion variants for the seller dashboard. */

export const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.05, ease: easing.out },
  }),
};

export const inView = { once: true, margin: "0px 0px -10% 0px", amount: 0.15 } as const;

/*
 * `fadeIn`, `stagger` and `scaleIn` used to sit between the two above. They were
 * a variant library written for screens that ended up using `fadeUp` — the one
 * entrance this console actually has — so they were three unused animations whose
 * only effect was to suggest four house motions where there is one. A variant is
 * cheap to write again the day a screen needs it, and one entrance is what makes
 * the dashboard feel like a single application.
 */
