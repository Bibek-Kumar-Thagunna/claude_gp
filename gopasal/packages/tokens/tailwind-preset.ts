import type { Config } from "tailwindcss";
import { color, font, radius, shadow, screens, fontSize } from "./src/index";

/**
 * Shared Tailwind preset for all GoPasal web apps.
 * Usage in an app's tailwind.config.ts:
 *
 *   import preset from "@gopasal/tokens/tailwind-preset";
 *   export default { presets: [preset], content: [...] } satisfies Config;
 */
const preset: Omit<Config, "content"> = {
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    screens,
    extend: {
      colors: {
        crimson: {
          ...color.crimson,
          DEFAULT: color.crimson[500],
        },
        ink: color.ink,
        brand: {
          blue: color.blue[500],
          green: color.green[500],
          marigold: color.marigold[500],
          red: color.red[500],
        },
        paper: color.paper,
        surface: color.surface,
      },
      fontFamily: {
        display: font.display.split(",").map((s) => s.trim().replace(/^"|"$/g, "")),
        body: font.body.split(",").map((s) => s.trim().replace(/^"|"$/g, "")),
        deva: font.devanagari.split(",").map((s) => s.trim().replace(/^"|"$/g, "")),
      },
      fontSize: {
        "7xl": fontSize["7xl"],
      },
      borderRadius: {
        md: radius.md,
        lg: radius.lg,
        xl: radius.xl,
        "2xl": radius["2xl"],
      },
      boxShadow: {
        soft: shadow.sm,
        card: shadow.md,
        float: shadow.lg,
        crimson: shadow.crimson,
      },
      backgroundImage: {
        "crimson-grad": `linear-gradient(135deg, ${color.crimson[500]} 0%, ${color.crimson[700]} 100%)`,
        "crimson-glow": `radial-gradient(1200px 600px at 50% -10%, ${color.crimson[100]} 0%, transparent 60%)`,
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 1.6s infinite",
        "pulse-soft": "pulse-soft 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default preset;
