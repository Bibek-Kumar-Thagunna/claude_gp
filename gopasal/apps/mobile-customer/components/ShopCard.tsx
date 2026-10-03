import * as React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Shop } from "@gopasal/native-data";
import {
  Card,
  CategoryArt,
  Text,
  Thumb,
  categoryTint,
  palette,
  theme,
  useT,
} from "@gopasal/native-ui";

/**
 * A shop, as a row.
 *
 * Shared by home and the category screens so a shop looks the same wherever it
 * is met. Two decisions worth keeping:
 *
 *  - **The name is never truncated by furniture.** An earlier version parked an
 *    OPEN pill beside it, which cut "Namaste Kirana Pasal" to "Namaste Kirana
 *    Pa…". The status lives in the meta row instead, where it also has room to
 *    say when a closed shop opens.
 *  - **Closed shops stay, dimmed.** A neighbourhood has few shops; hiding the
 *    closed one makes the app look empty and leaves people wondering where it
 *    went.
 */

export function distanceLabel(
  metres: number | null | undefined,
  t: ReturnType<typeof useT>,
): string | null {
  if (metres == null) return null;
  return metres < 950
    ? t("shopcard.metres", { value: Math.round(metres / 10) * 10 })
    : t("shopcard.kilometres", { value: (metres / 1000).toFixed(1) });
}

export function ShopCard({
  shop,
  index,
  onPress,
}: {
  shop: Shop;
  index: number;
  onPress: () => void;
}) {
  const t = useT();
  const distance = distanceLabel(shop.distanceMeters ?? shop.distance, t);
  const tint = categoryTint(shop.category?.hue);
  const rated = (shop.ratingCount ?? 0) > 0;

  return (
    <Card index={index} onPress={onPress} padded={false} style={{ overflow: "hidden" }}>
      <View style={{ flexDirection: "row", padding: theme.spacing[4], gap: theme.spacing[4] }}>
        {/* A shop with no logo falls back to its category's artwork, not to the
            seller's emoji. The emoji is their choice and it is kept on their own
            shop page, but next to the drawn category set it reads as a sticker
            from a different app — which is exactly what made the grid look
            unfinished before. */}
        <Thumb
          uri={shop.logoImage ?? shop.coverImage}
          size={64}
          tint={shop.isOpen ? tint.bg : theme.color.surfaceSunken}
          fallback={
            shop.category ? (
              <CategoryArt slug={shop.category.slug} hue={shop.category.hue} size={38} />
            ) : undefined
          }
          emoji={shop.emoji ?? "🏪"}
          dimmed={!shop.isOpen}
        />

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="title3" numberOfLines={1}>
            {shop.name}
          </Text>

          {shop.nameNp ? (
            <Text variant="footnote" color="textMuted" script="np" numberOfLines={1}>
              {shop.nameNp}
            </Text>
          ) : null}

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.spacing[3],
              marginTop: theme.spacing[2],
              flexWrap: "wrap",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: shop.isOpen ? theme.color.success : theme.color.textFaint,
                }}
              />
              <Text
                variant="caption"
                style={{ color: shop.isOpen ? theme.color.success : theme.color.textMuted }}
              >
                {shop.isOpen
                  ? t("shop.open")
                  : shop.hours
                    ? t("shopcard.opens", { hours: shop.hours })
                    : t("shop.closed")}
              </Text>
            </View>

            {rated ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Ionicons name="star" size={12} color={palette.marigold[500]} />
                <Text variant="caption" color="textSecondary" tabular>
                  {(shop.ratingAvg ?? 0).toFixed(1)}
                </Text>
                <Text variant="caption" color="textFaint">
                  ({shop.ratingCount})
                </Text>
              </View>
            ) : (
              // "New" is honest; a fabricated 4.5 is not, and a shop with no
              // reviews showing "0.0" reads as a bad shop rather than a new one.
              <Text variant="caption" color="textFaint">
                {t("shop.newShop")}
              </Text>
            )}

            {distance && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Ionicons name="navigate-outline" size={12} color={theme.color.textMuted} />
                <Text variant="caption" color="textSecondary">
                  {distance}
                </Text>
              </View>
            )}

            {shop.minOrder > 0 && (
              <Text variant="caption" color="textFaint">
                {t("shop.minOrder", { amount: shop.minOrder })}
              </Text>
            )}
          </View>
        </View>
      </View>
    </Card>
  );
}
