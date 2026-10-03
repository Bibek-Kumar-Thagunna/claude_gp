/**
 * The brand, translated for React Native.
 *
 * `@gopasal/tokens` is the single source of truth and stays CSS-shaped: `"16px"`,
 * `"1rem"`, `"0 8px 24px rgba(...)"`. React Native takes numbers and a different
 * shadow model entirely, so this module converts once, here, rather than letting
 * every component sprinkle `parseInt` over the palette. Nothing below invents a
 * value — change a colour in `@gopasal/tokens` and web and native both move.
 *
 * Two deliberate departures from the raw tokens:
 *
 *  - **Shadows.** CSS gives one string; iOS wants four props and Android wants a
 *    single `elevation` that it renders with its own curve. A shared object per
 *    step keeps the two platforms looking like the same product instead of one
 *    looking flat and the other looking cut out.
 *  - **Type scale.** `fontSize` is in rem because the web scales with the root
 *    font size. Native has no root font size, so these are the px equivalents at
 *    the 16px base the web actually renders at, paired with the line heights and
 *    letter spacing the display face needs at each size.
 */
import { Platform } from "react-native";
import { color, duration, easing, font, radius, space } from "@gopasal/tokens";

/** `"16px"` → `16`. Tokens are authored for CSS; native needs the number. */
function px(value: string): number {
  return Number.parseFloat(value);
}

export const palette = color;

/**
 * Semantic colour roles.
 *
 * Components reference roles, never raw ramp steps — `theme.color.textMuted`,
 * not `palette.ink[500]`. That indirection is what makes a dark scheme a change
 * in one file instead of a hunt through every screen, and it stops "muted text"
 * drifting between ink-500 here and ink-400 three screens later.
 */
const lightColors = {
  brand: color.crimson[500],
  brandPressed: color.crimson[600],
  brandSoft: color.crimson[50],
  brandBorder: color.crimson[100],
  onBrand: color.white,

  accent: color.marigold[500],
  accentSoft: "#FFF3DF",

  success: color.green[500],
  successSoft: "#EAF7EF",
  warning: color.marigold[500],
  warningSoft: "#FFF3DF",
  danger: color.red[500],
  dangerSoft: "#FDECEC",
  info: color.blue[500],
  infoSoft: "#EAF1FE",

  /** App background — the warm lokta paper the brand is built on. */
  background: color.paper,
  /** Cards and sheets sitting on the background. */
  surface: color.surface,
  /** A recessed row inside a card: search fields, totals blocks. */
  surfaceSunken: color.ink[50],
  /** Scrims behind modals and sheets. */
  scrim: "rgba(27, 18, 32, 0.45)",

  text: color.ink[900],
  textSecondary: color.ink[700],
  textMuted: color.ink[500],
  textFaint: color.ink[400],
  onDark: color.white,

  border: color.ink[200],
  borderStrong: color.ink[300],
  /** The wash a skeleton sweeps across while content loads. */
  skeleton: color.ink[100],
  skeletonSheen: color.ink[50],
} as const;

export type ColorRoles = typeof lightColors;

/**
 * Spacing, in the 4px rhythm the web already uses. Named by step, not by pixel,
 * so `space[4]` is the same gap in both products.
 */
export const spacing = {
  0: 0,
  1: px(space[1]),
  2: px(space[2]),
  3: px(space[3]),
  4: px(space[4]),
  5: px(space[5]),
  6: px(space[6]),
  8: px(space[8]),
  10: px(space[10]),
  12: px(space[12]),
  16: px(space[16]),
  20: px(space[20]),
  24: px(space[24]),
} as const;

export const radii = {
  sm: px(radius.sm),
  md: px(radius.md),
  lg: px(radius.lg),
  xl: px(radius.xl),
  "2xl": px(radius["2xl"]),
  full: 9999,
} as const;

/**
 * Elevation.
 *
 * `elevation` drives Android; the iOS quartet drives iOS. They are tuned to
 * match each other rather than to match their own platform defaults, because a
 * card that floats on one phone and sits flat on another is the fastest way to
 * make an app feel unfinished.
 */
function elevation(level: 0 | 1 | 2 | 3 | 4, tint = "#1B1220") {
  const spec = {
    0: { opacity: 0, radius: 0, offset: 0, android: 0 },
    1: { opacity: 0.06, radius: 3, offset: 1, android: 1 },
    2: { opacity: 0.08, radius: 10, offset: 3, android: 3 },
    3: { opacity: 0.1, radius: 22, offset: 8, android: 8 },
    4: { opacity: 0.16, radius: 40, offset: 16, android: 16 },
  }[level];

  return Platform.select({
    ios: {
      shadowColor: tint,
      shadowOpacity: spec.opacity,
      shadowRadius: spec.radius,
      shadowOffset: { width: 0, height: spec.offset },
    },
    android: { elevation: spec.android, shadowColor: tint },
    default: {
      // react-native-web understands boxShadow, and using it keeps the headless
      // screenshots honest about what the phone will show.
      boxShadow: `0 ${spec.offset}px ${spec.radius}px rgba(27, 18, 32, ${spec.opacity})`,
    },
  }) as object;
}

export const shadows = {
  none: elevation(0),
  xs: elevation(1),
  sm: elevation(2),
  md: elevation(3),
  lg: elevation(4),
  /**
   * The tab bar, lit from below.
   *
   * Every other shadow in the scale falls downward because everything else sits
   * on the page. The bar sits *over* it from the bottom edge, so its shadow has
   * to be cast upward — the same shadow flipped is what makes it read as a bar
   * rather than as a table rule.
   */
  bar: Platform.select({
    ios: {
      shadowColor: color.ink[900],
      shadowOpacity: 0.07,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: -4 },
    },
    android: { elevation: 12, shadowColor: color.ink[900] },
    default: { boxShadow: "0 -4px 16px rgba(27, 18, 32, 0.07)" },
  }) as object,

  /** The lift under a primary button — brand-tinted, not neutral grey. */
  brand: Platform.select({
    ios: {
      shadowColor: color.crimson[500],
      shadowOpacity: 0.32,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
    },
    android: { elevation: 10, shadowColor: color.crimson[500] },
    default: { boxShadow: "0 10px 24px rgba(225, 25, 69, 0.3)" },
  }) as object,
} as const;

/**
 * Type scale.
 *
 * Line heights are set per size rather than as one multiplier: display sizes
 * need to sit tighter than body text or headings look loose and unanchored, and
 * small text needs proportionally more leading to stay readable on a phone in
 * daylight. Letter spacing goes slightly negative as size increases, which is
 * what stops large display type looking gappy.
 */
export const type = {
  display: { fontSize: 34, lineHeight: 40, letterSpacing: -0.6, fontWeight: "800" },
  title1: { fontSize: 26, lineHeight: 32, letterSpacing: -0.4, fontWeight: "800" },
  title2: { fontSize: 21, lineHeight: 27, letterSpacing: -0.3, fontWeight: "700" },
  title3: { fontSize: 18, lineHeight: 24, letterSpacing: -0.2, fontWeight: "700" },
  body: { fontSize: 16, lineHeight: 23, letterSpacing: 0, fontWeight: "500" },
  bodyStrong: { fontSize: 16, lineHeight: 23, letterSpacing: 0, fontWeight: "700" },
  callout: { fontSize: 15, lineHeight: 21, letterSpacing: 0, fontWeight: "500" },
  footnote: { fontSize: 13, lineHeight: 18, letterSpacing: 0.1, fontWeight: "500" },
  caption: { fontSize: 12, lineHeight: 16, letterSpacing: 0.2, fontWeight: "600" },
  overline: { fontSize: 11, lineHeight: 14, letterSpacing: 1.1, fontWeight: "700" },
  /** Prices and order codes: tabular so digits do not jitter as they change. */
  numeric: { fontSize: 16, lineHeight: 22, letterSpacing: 0, fontWeight: "700" },
} as const;

export type TypeRole = keyof typeof type;

/**
 * Font families.
 *
 * The names are the ones `expo-font` registers at startup. Until the faces load
 * these fall back to the platform UI font, which is why nothing in the app
 * hard-codes a family: `<Text>` in this kit resolves it from the theme so one
 * swap moves every screen.
 */
export const fontFamily = {
  display: "Baloo2_800ExtraBold",
  displayMedium: "Baloo2_600SemiBold",
  body: "Inter_500Medium",
  bodyBold: "Inter_700Bold",
  /** Nepali script — the brand carries `nameNp` on every shop and product. */
  devanagari: "Hind_600SemiBold",
  cssFallback: font.body,
} as const;

export const theme = {
  color: lightColors,
  palette,
  spacing,
  radii,
  shadows,
  type,
  fontFamily,
  duration,
  easing,
  /** Minimum tappable size. Below this, people miss and blame the app. */
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
  minTouchTarget: 44,
} as const;

export type Theme = typeof theme;
