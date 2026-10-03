import * as React from "react";
import { useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import type { ShopCategory } from "@gopasal/native-data";
import {
  CategoryArt,
  Skeleton,
  Text,
  Touchable,
  categoryTint,
  stagger,
  theme,
  useT,
} from "@gopasal/native-ui";
import { useCategoryName } from "../lib/category";

/**
 * The category grid.
 *
 * This is the part of a hyperlocal home screen that tells someone what the app
 * is for, in one glance, before they have read a word. It gets the position
 * directly under the header and it shows the **whole** taxonomy, not the subset
 * that happens to have a shop open nearby — a grid that shrinks to two tiles in
 * a quiet neighbourhood makes the app look like it sells two things.
 *
 * A fixed four-column grid rather than a scrolling rail: eight tiles in two
 * rows are all visible at once, and a horizontal rail hides half of them behind
 * a gesture most people never make on a home screen.
 */

const COLUMNS = 4;

/**
 * Tile labels, shortened.
 *
 * The API's `en` is the category's real name and stays the truth everywhere it
 * has room — the category screen's heading, the shelf headings. Under an 80pt
 * tile it wraps to two lines and the grid grows a ragged extra row of text, so
 * the tile gets a shorter form of the same name. Nothing here renames a
 * category into something it is not; anything unlisted falls back to `en`.
 */
const SHORT: Record<string, string> = {
  vegetables: "category.short.vegetables",
  "meat-fish": "category.short.meatFish",
  "print-copy": "category.short.printCopy",
  restaurant: "category.short.restaurant",
};

export function CategoryGrid({
  categories,
  loading,
  onPick,
}: {
  categories: ShopCategory[];
  loading?: boolean;
  onPick: (category: ShopCategory) => void;
}) {
  const t = useT();
  const nameOf = useCategoryName();
  const { width } = useWindowDimensions();
  // Measured from the window rather than hard-coded, so the tiles stay square
  // and aligned on a 360pt handset, a 430pt Max and a tablet alike.
  const gutter = theme.spacing[4];
  const gap = theme.spacing[3];
  const tile = Math.floor((width - gutter * 2 - gap * (COLUMNS - 1)) / COLUMNS);

  if (loading && categories.length === 0) {
    return (
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap,
          paddingHorizontal: gutter,
        }}
      >
        {Array.from({ length: 8 }, (_, i) => (
          <View key={i} style={{ width: tile, alignItems: "center" }}>
            <Skeleton width={tile} height={tile} radius={theme.radii.lg} delay={i * 60} />
            <Skeleton width={tile - 14} height={9} delay={i * 60 + 40} />
          </View>
        ))}
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap,
        paddingHorizontal: gutter,
      }}
    >
      {categories.map((category, index) => {
        const tint = categoryTint(category.hue);
        return (
          <Animated.View
            key={category.id}
            entering={FadeInDown.delay(stagger(index, 40)).duration(280)}
          >
            <Touchable
              haptic="selection"
              scaleTo={0.94}
              onPress={() => onPick(category)}
              accessibilityLabel={t("category.a11y.shops", { name: nameOf(category) })}
              style={{ width: tile, alignItems: "center" }}
            >
              <View
                style={{
                  width: tile,
                  height: tile,
                  borderRadius: theme.radii.lg,
                  backgroundColor: tint.bg,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <CategoryArt
                  slug={category.slug}
                  hue={category.hue}
                  size={Math.round(tile * 0.62)}
                />
              </View>
              {/* Two lines, with the height reserved whether or not the second
                  one is used — otherwise a tile with a wrapping label pushes its
                  row taller than the others and the grid goes ragged. */}
              <Text
                variant="caption"
                color="textSecondary"
                align="center"
                numberOfLines={2}
                style={{ marginTop: theme.spacing[2], height: 32 }}
              >
                {SHORT[category.slug] ? t(SHORT[category.slug]) : nameOf(category)}
              </Text>
            </Touchable>
          </Animated.View>
        );
      })}
    </View>
  );
}
