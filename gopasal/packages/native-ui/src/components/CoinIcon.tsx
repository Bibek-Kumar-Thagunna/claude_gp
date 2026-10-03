import * as React from "react";
import Svg, { Circle, Path } from "react-native-svg";
import { palette } from "../theme/theme";

/**
 * A GoCoin.
 *
 * Small enough that it has to work as a silhouette: a marigold disc, a darker
 * rim, and the rupee mark struck into it. An `Ionicons` circle read as a status
 * dot rather than as money, which is the one thing this mark has to say at
 * 16 points in the corner of a red header.
 */
export function CoinIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityRole="image">
      <Circle cx={12} cy={12} r={11} fill={palette.marigold[500]} />
      <Circle cx={12} cy={12} r={11} stroke={palette.marigold[600]} strokeWidth={1.6} fill="none" />
      {/* रु, struck rather than drawn in a font — a font would not hint at this size */}
      <Path
        d="M8.2 7.6 H15.2 M8.2 10.6 H15.2 M8.2 13.4 C11.4 13.4 13.4 12.6 13.4 10.6 M9.2 13.4 L14.6 17.6"
        stroke={palette.marigold[600]}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
