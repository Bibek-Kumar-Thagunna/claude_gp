/**
 * GoPasal design tokens.
 *
 * Single source of truth for the brand. Consumed by:
 *  - web  → via the Tailwind preset (./tailwind-preset.ts) + CSS variables (./tokens.css)
 *  - native (Expo) → by importing these objects directly.
 *
 * Brand: crimson (#E11945) with a warm marigold accent, deep ink text,
 * and a soft "paper" background inspired by Nepali handmade lokta paper.
 */

export const color = {
  // Crimson — primary brand
  crimson: {
    50: "#FFECF0",
    100: "#FFD3DD",
    200: "#FCA9BB",
    300: "#F87A94",
    400: "#F04D70",
    500: "#E11945", // brand
    600: "#C51139",
    700: "#B60E33",
    800: "#920A28",
    900: "#6E0A20",
  },
  // Ink — text / neutrals
  ink: {
    900: "#1B1220",
    800: "#2A1F33",
    700: "#453A4F",
    600: "#5F5468",
    500: "#7C7185",
    400: "#9C93A3",
    300: "#C3BCC9",
    200: "#E4DFE8",
    100: "#F1EEF3",
    50: "#F8F6FA",
  },
  // Support colours
  blue: { 500: "#2540E8", 600: "#1B31C0" }, // links / info
  green: { 500: "#0E9F6E", 600: "#0B7E58" }, // success / delivered
  marigold: { 500: "#F6A609", 600: "#D98B00" }, // accent / highlights
  amber: { 500: "#F6A609" },
  red: { 500: "#E02424" }, // destructive / cancelled

  paper: "#FFF8F5", // app background
  surface: "#FFFFFF",
  white: "#FFFFFF",
  black: "#0B0710",
} as const;

export const font = {
  display: '"Baloo 2", "Poppins", system-ui, sans-serif',
  body: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  devanagari: '"Hind", "Noto Sans Devanagari", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
} as const;

export const fontSize = {
  xs: "0.75rem",
  sm: "0.875rem",
  base: "1rem",
  lg: "1.125rem",
  xl: "1.25rem",
  "2xl": "1.5rem",
  "3xl": "1.875rem",
  "4xl": "2.25rem",
  "5xl": "3rem",
  "6xl": "3.75rem",
  "7xl": "clamp(2.75rem, 6vw, 5rem)", // fluid display for hero
} as const;

export const radius = {
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "20px",
  "2xl": "28px",
  full: "9999px",
} as const;

export const shadow = {
  xs: "0 1px 2px rgba(27, 18, 32, 0.06)",
  sm: "0 2px 8px rgba(27, 18, 32, 0.08)",
  md: "0 8px 24px rgba(27, 18, 32, 0.10)",
  lg: "0 16px 48px rgba(27, 18, 32, 0.14)",
  crimson: "0 12px 32px rgba(225, 25, 69, 0.28)",
} as const;

export const space = {
  0: "0px",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
  20: "80px",
  24: "96px",
} as const;

/** Breakpoints — mobile-first, up to large TVs / 4K. */
export const screens = {
  xs: "360px", // small phones
  sm: "480px",
  md: "768px", // tablets
  lg: "1024px", // laptops
  xl: "1280px",
  "2xl": "1536px",
  "3xl": "1920px", // large desktop / 1080p TV
  "4xl": "2560px", // 4K / large TV
} as const;

export const duration = {
  fast: 150,
  base: 250,
  slow: 450,
  splash: 1600,
} as const;

/** Easing curves used for premium motion. */
export const easing = {
  out: [0.16, 1, 0.3, 1] as [number, number, number, number], // expo-out
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
  spring: { type: "spring", stiffness: 260, damping: 26 } as const,
} as const;

export const tokens = {
  color,
  font,
  fontSize,
  radius,
  shadow,
  space,
  screens,
  duration,
  easing,
} as const;

export type Tokens = typeof tokens;
export default tokens;
