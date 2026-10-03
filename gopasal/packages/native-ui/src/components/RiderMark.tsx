import * as React from "react";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { palette } from "../theme/theme";
import { useT } from "../i18n/i18n";

/**
 * The GoPasal rider, as a map marker.
 *
 * The first version of this was a side-view scooter rotated to the bearing, and
 * it did not survive contact with a real heading: at 45° a detailed vehicle at
 * 60 points is an unreadable smudge, and at 180° it drives backwards. Every
 * delivery app that has solved this has solved it the same way, and for the
 * same reason.
 *
 * So the mark is a **badge that never rotates** with a **pointer that does**:
 *
 *  - The disc stays upright, so the scooter inside it is always drawn at the
 *    one angle it was designed for and reads instantly at any bearing.
 *  - A single nose points where the rider is heading. One rotating element is
 *    all the direction anybody needs, and it cannot look broken.
 *  - Depth comes from a cast shadow, a rim highlight and two-tone solids lit
 *    from the upper left — not from perspective that fights the rotation.
 *
 * The brand is carried by the crimson disc and the marigold-eyed Aankhijhyal on
 * the delivery box, the same geometry as the logo mark.
 */
export function RiderMark({
  size = 62,
  /** Compass bearing in degrees — 0 is north, as a GPS reports it. */
  heading = 0,
  /** Dims to a resting state when the last position is old. */
  stale = false,
}: {
  size?: number;
  heading?: number;
  stale?: boolean;
}) {
  const t = useT();
  const crimson = palette.crimson[500];
  const crimsonDark = palette.crimson[700];
  const marigold = palette.marigold[500];
  const ink = "#2A1F2E";

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      accessibilityRole="image"
      accessibilityLabel={t("ui.yourRider", undefined, "Your rider")}
      opacity={stale ? 0.68 : 1}
    >
      <Defs>
        <LinearGradient id="disc" x1="0" y1="0" x2="0.6" y2="1">
          <Stop offset="0%" stopColor={palette.crimson[500]} />
          <Stop offset="100%" stopColor={palette.crimson[700]} />
        </LinearGradient>
      </Defs>

      {/* cast shadow — the cheapest cue that the badge sits above the map */}
      <Ellipse cx={32} cy={55} rx={13} ry={3.6} fill="rgba(27,18,32,0.22)" />

      {/* the only part that turns */}
      <G rotation={heading} origin="32, 32">
        <Path d="M32 2.5 L39 14 H25 Z" fill={crimson} />
      </G>

      {/* badge */}
      {/* A thicker white ring, because this badge sits on a tinted ground and a
          thin one let the disc bleed into it. */}
      <Circle cx={32} cy={32} r={21.5} fill={palette.white} />
      <Circle cx={32} cy={32} r={18} fill="url(#disc)" />
      {/* rim highlight, upper left, consistent with every other solid here */}
      <Path
        d="M32 13.5 A18.5 18.5 0 0 0 13.5 32"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={2.2}
        strokeLinecap="round"
        fill="none"
      />

      {/* scooter, upright, drawn once at the angle it reads best */}
      <G>
        {/* wheels */}
        <Circle cx={25} cy={40} r={4.2} fill={ink} />
        <Circle cx={25} cy={40} r={1.7} fill="#6B5C70" />
        <Circle cx={40} cy={40} r={4.2} fill={ink} />
        <Circle cx={40} cy={40} r={1.7} fill="#6B5C70" />

        {/* body: shaded underside, then lit deck */}
        <Path d="M23 37.5 H42 L40.5 39.5 H24.5 Z" fill="rgba(27,18,32,0.28)" />
        <Path
          d="M25 31.5 C26.5 29.8 28.5 29.2 30.5 29.2 H35 C37.5 29.2 39.2 30.8 39.6 33 L40 37.5 H23.8 L24.3 33.5 C24.4 32.7 24.6 32 25 31.5 Z"
          fill={palette.white}
        />
        {/* handlebar and lamp */}
        <Path d="M39 31 L42.5 25.5" stroke={palette.white} strokeWidth={2.4} strokeLinecap="round" />
        <Circle cx={43.5} cy={24.5} r={2.2} fill={marigold} />

        {/* the delivery box — white on crimson, so it is the thing you see */}
        <Rect x={17.5} y={23} width={11.5} height={10.5} rx={2} fill={palette.white} />
        <Rect x={17.5} y={23} width={11.5} height={2.6} rx={1.3} fill="rgba(27,18,32,0.12)" />
        <Path
          d="M20.6 31.6 V27.8 Q20.6 27.5 20.85 27.25 L22.9 25.2 Q23.25 24.9 23.6 25.2 L25.65 27.25 Q25.9 27.5 25.9 27.8 V31.6 Z"
          fill="none"
          stroke={crimsonDark}
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
        <Path d="M23.25 26 L24.4 28.4 L23.25 30.2 L22.1 28.4 Z" fill={marigold} />

        {/* rider */}
        <Circle cx={33} cy={23.5} r={3.6} fill={palette.white} />
        <Path
          d="M30.5 29.6 C31.4 27.6 33 26.6 34.6 26.8 C36.4 27 37.6 28.4 38 30.4 L38.4 32.4 H30 Z"
          fill={palette.white}
        />
      </G>
    </Svg>
  );
}
