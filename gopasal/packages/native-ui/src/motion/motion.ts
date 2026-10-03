/**
 * Motion.
 *
 * What separates an app that feels expensive from one that feels assembled is
 * almost never the individual animation — it is that every animation in the
 * product agrees about how fast things move and how they settle. So screens do
 * not choose durations or curves: they choose an *intent* from this file.
 *
 * Two rules the whole kit follows:
 *
 *  1. **Things that respond to a finger use springs, things that appear on their
 *     own use timing.** A button shrinking under a thumb is physical and must
 *     track the finger; a toast sliding in has no physical cause and looks
 *     nervous with a spring on it.
 *  2. **Out is faster than in.** Dismissing something the user has decided about
 *     should get out of the way; the reverse feels like the app is arguing.
 */
import { Easing, ReduceMotion } from "react-native-reanimated";
import { duration, easing } from "@gopasal/tokens";

/**
 * The house curve: `cubic-bezier(0.16, 1, 0.3, 1)`, an exponential-out.
 *
 * It covers most of the distance immediately and then eases for a long tail,
 * which reads as "responsive" rather than "slow" even at 450ms. It is the same
 * curve `@gopasal/tokens` gives the web, so a transition on the site and the
 * same transition in the app are recognisably one product.
 */
export const curve = {
  out: Easing.bezier(easing.out[0], easing.out[1], easing.out[2], easing.out[3]),
  inOut: Easing.bezier(easing.inOut[0], easing.inOut[1], easing.inOut[2], easing.inOut[3]),
  /** For anything leaving: quick and unceremonious. */
  in: Easing.bezier(0.4, 0, 1, 1),
  linear: Easing.linear,
} as const;

export const durations = {
  /** Press feedback, checkbox ticks — must feel instant. */
  instant: 90,
  fast: duration.fast,
  base: duration.base,
  slow: duration.slow,
  splash: duration.splash,
} as const;

/**
 * Springs.
 *
 * `damping` is set so nothing overshoots more than once. A bouncy spring is fun
 * in a demo and exhausting in a shopping app used five times a week — the one
 * place a little overshoot earns its keep is a success moment, hence `celebrate`.
 */
export const springs = {
  /** Under the finger: stiff, no visible wobble. */
  press: { damping: 26, stiffness: 420, mass: 0.7, reduceMotion: ReduceMotion.System },
  /** Sheets, cards entering: settles with authority. */
  enter: {
    damping: easing.spring.damping,
    stiffness: easing.spring.stiffness,
    mass: 1,
    reduceMotion: ReduceMotion.System,
  },
  /** Layout shifts — a row removed, a list reordering. */
  layout: { damping: 30, stiffness: 220, mass: 1, reduceMotion: ReduceMotion.System },
  /** Order delivered, coupon applied: one small, earned bounce. */
  celebrate: { damping: 12, stiffness: 260, mass: 0.9, reduceMotion: ReduceMotion.System },
} as const;

/** Timing configs, so callers never hand-assemble `{ duration, easing }`. */
export const timings = {
  instant: { duration: durations.instant, easing: curve.out },
  fast: { duration: durations.fast, easing: curve.out },
  base: { duration: durations.base, easing: curve.out },
  slow: { duration: durations.slow, easing: curve.out },
  exit: { duration: durations.fast, easing: curve.in },
} as const;

/**
 * Stagger delay for a list appearing.
 *
 * Capped on purpose. Multiplying an index by a delay looks lovely for six rows
 * and absurd for sixty — the thirtieth shop would arrive two seconds late. After
 * `max` items everything shares the last slot, so a long list still cascades at
 * the top and is simply *there* further down, which is what the eye expects.
 */
export function stagger(index: number, step = 45, max = 8): number {
  return Math.min(index, max) * step;
}

/**
 * How far a card travels as it appears.
 *
 * Small. Entrances that slide a long way draw attention to the animation
 * instead of the content; 12px is enough for the eye to register direction.
 */
export const travel = {
  sm: 8,
  md: 12,
  lg: 24,
} as const;
