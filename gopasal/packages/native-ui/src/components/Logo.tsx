import * as React from "react";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { palette } from "../theme/theme";

/**
 * The GoPasal mark, for native.
 *
 * Same geometry as `@gopasal/ui`'s web `Logo` — an Aankhijhyal, the carved
 * lattice eye-window of the Kathmandu valley, with a marigold eye at its centre.
 * It is redrawn here rather than shared because the web component emits DOM
 * `<svg>` and React Native needs `react-native-svg` primitives; the path data is
 * copied verbatim so the two cannot drift in shape, only in renderer.
 *
 * The wordmark is deliberately not reproduced. On the web it is `<text>` in
 * Baloo 2; in the app the same words are real `<Text>` next to this mark, which
 * means they scale with the user's font-size preference and are readable by a
 * screen reader instead of being an image of a name.
 */

export type LogoTone = "brand" | "onDark" | "mono";

export function Logo({
  size = 48,
  tone = "brand",
  color,
}: {
  /** Height in points; width follows the 48:56 aspect of the mark. */
  size?: number;
  tone?: LogoTone;
  /** Overrides the tone entirely — for a mark on an arbitrary background. */
  color?: string;
}) {
  const crimson = color ?? (tone === "onDark" ? palette.white : palette.crimson[500]);
  // On a dark or single-colour background the marigold eye loses its contrast
  // and reads as a smudge, so it takes the mark's own colour there.
  const accent = tone === "brand" ? palette.marigold[500] : crimson;

  return (
    <Svg
      width={size * (48 / 56)}
      height={size}
      viewBox="0 0 48 56"
      fill="none"
      accessibilityRole="image"
      accessibilityLabel="GoPasal"
    >
      <G>
        {/* base sill */}
        <Rect x="3" y="51" width="42" height="5" rx="2" fill={crimson} />
        {/* window frame — temple/ogee top */}
        <Path
          d="M8 51 L8 22 Q8 19.6 9.6 18 L22.4 5.2 Q24 3.6 25.6 5.2 L38.4 18 Q40 19.6 40 22 L40 51 Z"
          fill="none"
          stroke={crimson}
          strokeWidth="3.4"
          strokeLinejoin="round"
        />
        {/* lattice — mullion + transom */}
        <Path
          d="M24 9 L24 51 M11 31 L37 31"
          stroke={crimson}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        {/* the eye — central diamond */}
        <Path d="M24 22 L31 31 L24 40 L17 31 Z" fill={accent} />
        <Circle cx="24" cy="31" r="2.4" fill={crimson} />
      </G>
    </Svg>
  );
}
