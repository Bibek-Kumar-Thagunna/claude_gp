import * as React from "react";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { categoryTint } from "../theme/categories";

/**
 * Category artwork.
 *
 * Drawn here rather than pulled from an icon font, after two attempts with
 * ready-made sets did not hold up:
 *
 *  - **Emoji** are a different illustration style per platform, each with its
 *    own gradients and drop shadows. Eight in a grid look like a sticker sheet
 *    stuck onto the app rather than part of it.
 *  - **A monochrome icon font** is consistent but mixes outline and solid
 *    glyphs — a hairline basket next to a solid carrot next to a solid fish —
 *    so the grid reads as eight different weights. Picking one variant fixes
 *    the weight and leaves you with interface icons, which say "setting" rather
 *    than "shop".
 *
 * These are duotone: a soft body in the category's wash colour and the details
 * in its mark colour, all on one 48-unit grid with one corner radius and one
 * stroke weight. That is what makes eight unrelated objects — a basket, a fish,
 * a printer — look like one family drawn by one hand.
 *
 * Every shape is original geometry. Nothing here traces another product's
 * icon set.
 */

const VB = 48;
/** One stroke weight across the whole set; the family read depends on it. */
const W = 2.8;

type ArtProps = { bold: string; soft: string; mid: string };

function Grocery({ bold, soft, mid }: ArtProps) {
  return (
    <G>
      {/* handle */}
      <Path
        d="M16.5 20 C16.5 12.5 31.5 12.5 31.5 20"
        stroke={bold}
        strokeWidth={W}
        strokeLinecap="round"
        fill="none"
      />
      {/* basket body, tapering like a real one */}
      <Path
        d="M11 24 H37 L34 38.5 A3.2 3.2 0 0 1 30.9 41 H17.1 A3.2 3.2 0 0 1 14 38.5 Z"
        fill={soft}
      />
      <Path d="M20.5 28 L21.8 37" stroke={mid} strokeWidth={2.2} strokeLinecap="round" />
      <Path d="M27.5 28 L26.2 37" stroke={mid} strokeWidth={2.2} strokeLinecap="round" />
      {/* rim */}
      <Rect x={8.5} y={20.5} width={31} height={6} rx={3} fill={bold} />
    </G>
  );
}

/**
 * The one drawing that ignores its category's hue.
 *
 * Vegetables are the green tile, and a green carrot reads as a spring onion. An
 * object with a colour everybody already knows keeps that colour; the tile's
 * wash still places it in the family.
 */
const CARROT = { body: "#F29A3F", shade: "#D9761D", leaf: "#3FA46B", leafDark: "#2C8354" };

function Vegetables(_: ArtProps) {
  return (
    <G>
      {/* leaves */}
      <Path d="M23 18 C20 11.5 15.5 10.5 13.5 12.2 C12.2 14.8 15 19 21.5 20 Z" fill={CARROT.leafDark} />
      <Path d="M25 18 C27.5 11 32.5 10 34.5 11.8 C36 14.6 33 19 26.5 20 Z" fill={CARROT.leaf} />
      <Path d="M24 19.5 C23.2 15 24 12.5 24 10.5" stroke={CARROT.leafDark} strokeWidth={2.4} strokeLinecap="round" />
      {/* root */}
      <Path
        d="M17.5 20.5 H30.5 C31.4 20.5 32 21.3 31.7 22.1 L25.6 41.2 C25.1 42.7 22.9 42.7 22.4 41.2 L16.3 22.1 C16 21.3 16.6 20.5 17.5 20.5 Z"
        fill={CARROT.body}
      />
      <Path d="M20.8 27 H23.6" stroke={CARROT.shade} strokeWidth={2.2} strokeLinecap="round" />
      <Path d="M24.8 32 H27" stroke={CARROT.shade} strokeWidth={2.2} strokeLinecap="round" />
      <Path d="M22.4 36.5 H24.4" stroke={CARROT.shade} strokeWidth={2.2} strokeLinecap="round" />
    </G>
  );
}

function Pharmacy({ bold, soft }: ArtProps) {
  return (
    <G transform="rotate(-42 24 24)">
      <Rect x={7.5} y={17} width={33} height={14} rx={7} fill={soft} />
      {/* one half filled, which is what makes a capsule read as a capsule */}
      <Path d="M24 17 H14.5 A7 7 0 0 0 14.5 31 H24 Z" fill={bold} />
      <Path d="M24 17 V31" stroke={bold} strokeWidth={2} strokeLinecap="round" />
    </G>
  );
}

function MeatFish({ bold, soft, mid }: ArtProps) {
  return (
    <G>
      {/* body */}
      <Path
        d="M9 24 C14 14.5 28 13 34.5 20.5 C36.5 22.8 36.5 25.2 34.5 27.5 C28 35 14 33.5 9 24 Z"
        fill={soft}
      />
      {/* tail */}
      <Path d="M35 24 L43 17.5 C43.8 17 44.6 17.6 44.4 18.5 L43 24 L44.4 29.5 C44.6 30.4 43.8 31 43 30.5 Z" fill={bold} />
      {/* dorsal fin */}
      <Path d="M20.5 16 L25.5 10 C26.2 9.2 27.4 9.7 27.4 10.7 L27.4 14.6 Z" fill={mid} />
      <Circle cx={16} cy={22} r={2.1} fill={bold} />
    </G>
  );
}

function Bakery({ bold, soft, mid }: ArtProps) {
  return (
    <G>
      {/* loaf */}
      <Path
        d="M9.5 31 C9.5 20 16 13.5 24 13.5 C32 13.5 38.5 20 38.5 31 Z"
        fill={soft}
      />
      {/* scoring — three slashes on one centre line, so the loaf is symmetric */}
      <Path d="M18.5 20.5 L15.5 26.5" stroke={mid} strokeWidth={W} strokeLinecap="round" />
      <Path d="M25.5 19 L22.5 25.5" stroke={mid} strokeWidth={W} strokeLinecap="round" />
      <Path d="M32.5 20.5 L29.5 26.5" stroke={mid} strokeWidth={W} strokeLinecap="round" />
      {/* crust base */}
      <Rect x={7.5} y={30.5} width={33} height={7.5} rx={3.75} fill={bold} />
    </G>
  );
}

function Electronics({ bold, soft, mid }: ArtProps) {
  return (
    <G>
      <Rect x={14} y={8.5} width={20} height={31} rx={4.5} fill={soft} />
      <Rect
        x={14}
        y={8.5}
        width={20}
        height={31}
        rx={4.5}
        stroke={bold}
        strokeWidth={W}
        fill="none"
      />
      <Path d="M21 13.5 H27" stroke={bold} strokeWidth={2.2} strokeLinecap="round" />
      <Rect x={18} y={18} width={12} height={12} rx={2} fill={mid} />
      <Circle cx={24} cy={35} r={1.9} fill={bold} />
    </G>
  );
}

function PrintCopy({ bold, soft, mid }: ArtProps) {
  return (
    <G>
      {/* sheet going in, narrower than the machine and centred on it */}
      <Rect x={16} y={7} width={16} height={11} rx={2} fill={mid} />
      {/* machine */}
      <Rect x={8.5} y={17} width={31} height={15} rx={4} fill={soft} />
      {/* output slot */}
      <Rect x={15} y={21} width={18} height={3} rx={1.5} fill={bold} />
      <Circle cx={34.5} cy={27.5} r={1.9} fill={bold} />
      {/* printed sheet */}
      <Rect x={15} y={29} width={18} height={11} rx={2} fill={bold} />
      <Path d="M19 33.5 H29" stroke={soft} strokeWidth={2} strokeLinecap="round" />
      <Path d="M19 36.5 H25.5" stroke={soft} strokeWidth={2} strokeLinecap="round" />
    </G>
  );
}

function Restaurant({ bold, soft, mid }: ArtProps) {
  return (
    <G>
      {/* steam */}
      <Path
        d="M19 13 C21.5 11 19 9 21.5 7"
        stroke={mid}
        strokeWidth={2.4}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M27 13 C29.5 11 27 9 29.5 7"
        stroke={mid}
        strokeWidth={2.4}
        strokeLinecap="round"
        fill="none"
      />
      {/* bowl */}
      <Path d="M8 22 H40 A16 16 0 0 1 8 22 Z" fill={soft} />
      <Rect x={6.5} y={18.5} width={35} height={5.5} rx={2.75} fill={bold} />
      {/* foot */}
      <Path d="M20 38 H28 L26.5 42 H21.5 Z" fill={bold} />
    </G>
  );
}

function Storefront({ bold, soft, mid }: ArtProps) {
  return (
    <G>
      <Path d="M9 18 L12 10.5 H36 L39 18 Z" fill={bold} />
      <Rect x={10.5} y={18} width={27} height={21} rx={2.5} fill={soft} />
      <Rect x={19} y={25} width={10} height={14} rx={2} fill={mid} />
    </G>
  );
}

const ART: Record<string, (p: ArtProps) => React.ReactElement> = {
  grocery: Grocery,
  vegetables: Vegetables,
  fruits: Vegetables,
  pharmacy: Pharmacy,
  "meat-fish": MeatFish,
  meat: MeatFish,
  fish: MeatFish,
  bakery: Bakery,
  dairy: Bakery,
  electronics: Electronics,
  "print-copy": PrintCopy,
  stationery: PrintCopy,
  restaurant: Restaurant,
  sweets: Restaurant,
};

/**
 * A category's picture, sized to fit a square tile.
 *
 * `slug` picks the drawing and `hue` picks the two colours, both straight from
 * the API, so a category added to the taxonomy later gets the storefront
 * fallback rather than an empty tile.
 */
export function CategoryArt({
  slug,
  hue,
  size = 40,
}: {
  slug?: string | null;
  hue?: string | null;
  size?: number;
}) {
  const tint = categoryTint(hue);
  const Draw = ART[slug ?? ""] ?? Storefront;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`} fill="none">
      {/* `mid` is the mark colour held back, so a third tone is available for
          detail without introducing a third hue. */}
      <Draw bold={tint.fg} soft={tint.art} mid={tint.mid} />
    </Svg>
  );
}
