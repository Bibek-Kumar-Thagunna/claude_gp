import { palette } from "@gopasal/native-ui";

/**
 * The rider app's accent: road-sign marigold on ink. Crimson stays the brand's
 * colour for actions that change money or customers (cash, failures), so a
 * rider glancing at the screen at a junction can tell "go" from "careful".
 */
export const rider = {
  amber: palette.marigold[500],
  amberDeep: palette.marigold[600],
  amberSoft: "#FFF3DA",
  amberLine: "#F8D995",
  ink: palette.ink[900],
} as const;
