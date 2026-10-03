import * as React from "react";
import { View, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { theme } from "../theme/theme";
import { Text } from "./Text";

/**
 * A product or shop picture, with an honest fallback.
 *
 * Three things make this worth having rather than dropping `<Image>` inline
 * everywhere:
 *
 *  - **Most rows will not have a picture for a long time.** Sellers upload them
 *    when they get round to it, and a grid of grey boxes with broken-image icons
 *    is what an app looks like when nobody thought about that. The fallback here
 *    is a tinted tile with the shop's emoji or a category glyph — it reads as a
 *    deliberate placeholder, not a failure.
 *  - **A failed load must fall back too.** A URL that 404s or times out on a
 *    weak link gets the same tile, so the screen degrades to the same state it
 *    would have had with no image at all.
 *  - **Caching is a data-cost decision.** `memory-disk` means a shop logo is
 *    fetched once per device rather than once per scroll, which on a metered
 *    Nepali mobile plan is the difference the customer actually feels.
 */
export function Thumb({
  uri,
  size,
  radius = theme.radii.lg,
  tint,
  emoji,
  fallback,
  dimmed = false,
  style,
}: {
  uri?: string | null;
  /** Square side, or `"fill"` to take the parent's box. */
  size: number | "fill";
  radius?: number;
  /** Background of the placeholder tile. */
  tint?: string;
  /** Shown in the placeholder when there is no picture. */
  emoji?: string | null;
  /** Used instead of `emoji` when supplied — an icon, usually. */
  fallback?: React.ReactNode;
  dimmed?: boolean;
  style?: ViewStyle;
}) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [uri]);

  const box: ViewStyle = {
    ...(size === "fill" ? { flex: 1, alignSelf: "stretch" } : { width: size, height: size }),
    borderRadius: radius,
    overflow: "hidden",
    backgroundColor: tint ?? theme.color.surfaceSunken,
    alignItems: "center",
    justifyContent: "center",
    opacity: dimmed ? 0.65 : 1,
  };

  const glyphSize = size === "fill" ? 30 : Math.round(size * 0.46);

  if (!uri || failed) {
    return (
      <View style={[box, style]}>
        {fallback ?? (
          <Text style={{ fontSize: glyphSize, lineHeight: Math.round(glyphSize * 1.22) }}>
            {emoji ?? "🛍️"}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={[box, style]}>
      <Image
        source={{ uri }}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
        // Short enough to read as the picture arriving, not as an effect.
        transition={180}
        cachePolicy="memory-disk"
        recyclingKey={uri}
        onError={() => setFailed(true)}
        accessible={false}
      />
    </View>
  );
}
