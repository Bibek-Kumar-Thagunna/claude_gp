import * as React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ShopProduct } from "@gopasal/native-data/seller";
import { Card, Price, Skeleton, Text, Thumb, Touchable, theme, useT } from "@gopasal/native-ui";

/**
 * One item on the shelf.
 *
 * The row carries three separate facts that a shopkeeper keeps confusing if the
 * screen lets them, so each gets its own control and its own word:
 *
 *  - **On sale / Sold out** is availability — whether customers can see it at
 *    all. It is the pill on the right, it is one tap, and it is the thing that
 *    happens twenty times a day, which is why it is on the row rather than
 *    behind a screen.
 *  - **How many are left** is a count, and it lives on the strip along the
 *    bottom. Tapping the strip opens the counting sheet; the whole strip is the
 *    target rather than the number alone, because a number set in `caption`
 *    is a five-point target on a phone held at arm's length.
 *  - **Not counted** is neither. A shop that has turned stock tracking off is
 *    not a shop with nothing left, and the stock route refuses the write, so the
 *    strip says so and does not pretend to be a button.
 *
 * Low stock is drawn in the warning ramp and an empty shelf in the danger ramp,
 * because to the person doing the restocking they are two different jobs: one is
 * "order more this week", the other is "a customer is asking for this now".
 */

/** How the bottom strip reads, and in which ramp. */
type StockTone = "none" | "low" | "fine" | "untracked";

function toneOf(product: ShopProduct, lowAt: number): StockTone {
  if (!product.trackStock) return "untracked";
  if (product.stock <= 0) return "none";
  return product.stock <= lowAt ? "low" : "fine";
}

const TONE_COLOR: Record<StockTone, keyof typeof theme.color> = {
  none: "danger",
  low: "warning",
  fine: "textSecondary",
  untracked: "textFaint",
};

export function ShelfRow({
  product,
  index,
  lowAt,
  onOpen,
  onToggle,
  onCount,
}: {
  product: ShopProduct;
  index: number;
  /** At or below this many, a tracked product is drawn as running low. */
  lowAt: number;
  onOpen: () => void;
  onToggle: () => void;
  onCount: () => void;
}) {
  const t = useT();
  const tone = toneOf(product, lowAt);
  const live = product.isActive;
  const saving = product.mrp && product.mrp > product.price ? product.mrp - product.price : 0;

  const stockLabel =
    tone === "untracked"
      ? t("shelf.untracked")
      : tone === "none"
        ? t("shelf.noneLeft")
        : t("shelf.stockLeft", { count: product.stock });

  return (
    <Card index={index} padded={false} style={{ opacity: live ? 1 : 0.62 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
          padding: theme.spacing[3],
        }}
      >
        <Touchable
          haptic="light"
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={t("shelf.a11yOpen", { name: product.name })}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing[3],
            flex: 1,
            minWidth: 0,
          }}
        >
          <Thumb
            uri={product.imageUrls[0] ?? null}
            size={48}
            radius={theme.radii.md}
            fallback={<Ionicons name="cube-outline" size={20} color={theme.color.textFaint} />}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {product.name}
            </Text>
            {product.nameNp ? (
              <Text variant="footnote" color="textMuted" script="np" numberOfLines={1}>
                {product.nameNp}
              </Text>
            ) : null}
            <View
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                gap: theme.spacing[2],
                marginTop: 2,
              }}
            >
              <Price value={product.price} variant="callout" />
              {saving > 0 ? (
                <Price
                  value={product.mrp ?? 0}
                  variant="caption"
                  color="textFaint"
                  style={{ textDecorationLine: "line-through" }}
                />
              ) : null}
              {product.unit ? (
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  · {product.unit}
                </Text>
              ) : null}
            </View>
          </View>
        </Touchable>

        {/* Outside the opening touchable on purpose: this is the one action that
            must never cost a screen, so it cannot share a target with one. */}
        <Touchable
          haptic={live ? "warning" : "success"}
          onPress={onToggle}
          accessibilityRole="switch"
          accessibilityState={{ checked: live }}
          accessibilityLabel={
            live
              ? t("shelf.a11yMarkSoldOut", { name: product.name })
              : t("shelf.a11yMarkOnSale", { name: product.name })
          }
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            height: 34,
            paddingHorizontal: theme.spacing[3],
            borderRadius: theme.radii.full,
            borderWidth: 1,
            backgroundColor: live ? theme.color.successSoft : theme.color.surfaceSunken,
            borderColor: live ? theme.color.success : theme.color.borderStrong,
          }}
        >
          <Ionicons
            name={live ? "checkmark-circle" : "close-circle"}
            size={14}
            color={live ? theme.color.success : theme.color.textMuted}
          />
          <Text variant="caption" color={live ? "success" : "textMuted"}>
            {live ? t("shelf.inStock") : t("shelf.outOfStock")}
          </Text>
        </Touchable>
      </View>

      <Touchable
        haptic={tone === "untracked" ? "none" : "light"}
        onPress={tone === "untracked" ? undefined : onCount}
        disabled={tone === "untracked"}
        accessibilityRole={tone === "untracked" ? "text" : "button"}
        accessibilityLabel={
          tone === "untracked"
            ? t("shelf.a11yUntracked", { name: product.name })
            : t("shelf.a11yCount", { name: product.name, count: product.stock })
        }
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: theme.spacing[3],
          paddingVertical: theme.spacing[2],
          borderTopWidth: 1,
          borderTopColor: theme.color.border,
          backgroundColor:
            tone === "none"
              ? theme.color.dangerSoft
              : tone === "low"
                ? theme.color.warningSoft
                : "transparent",
          borderBottomLeftRadius: theme.radii.lg,
          borderBottomRightRadius: theme.radii.lg,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
          <Ionicons
            name={tone === "untracked" ? "help-circle-outline" : "layers-outline"}
            size={14}
            color={theme.color[TONE_COLOR[tone]]}
          />
          <Text variant="caption" color={TONE_COLOR[tone]} tabular>
            {stockLabel}
          </Text>
          {tone === "low" ? (
            <Text variant="overline" color="warning">
              {t("shelf.lowStock")}
            </Text>
          ) : null}
        </View>

        {tone === "untracked" ? null : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Text variant="caption" color="brand">
              {t("shelf.setStock")}
            </Text>
            <Ionicons name="chevron-forward" size={12} color={theme.color.brand} />
          </View>
        )}
      </Touchable>
    </Card>
  );
}

/** The shelf while the first page is still in the air. */
export function ShelfRowSkeleton({ index }: { index: number }) {
  return (
    <Card padded={false}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
          padding: theme.spacing[3],
        }}
      >
        <Skeleton width={48} height={48} radius={theme.radii.md} delay={index * 70} />
        <View style={{ flex: 1, gap: theme.spacing[2] }}>
          <Skeleton width="68%" height={13} delay={index * 70 + 40} />
          <Skeleton width="34%" height={11} delay={index * 70 + 80} />
        </View>
        <Skeleton width={84} height={34} radius={theme.radii.full} delay={index * 70 + 120} />
      </View>
      <View
        style={{
          paddingHorizontal: theme.spacing[3],
          paddingVertical: theme.spacing[3],
          borderTopWidth: 1,
          borderTopColor: theme.color.border,
        }}
      >
        <Skeleton width="40%" height={11} delay={index * 70 + 160} />
      </View>
    </Card>
  );
}
