import * as React from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { Product, ProductVariant } from "@gopasal/native-data";
import { Price, Text, Touchable, theme, useT } from "@gopasal/native-ui";

/**
 * Choosing a size.
 *
 * Rice is sold in 1 kg, 5 kg and 25 kg, and those are three different prices
 * for three different things. The server knows this — it refuses a line that
 * names a product with options but not which one — so a shelf that only offers
 * "Basmati Rice · रु 180" is offering something that cannot be bought.
 *
 * A sheet rather than a second screen: picking a size is a step inside adding
 * to the basket, and a navigation push would make it feel like leaving the
 * shop. Each option carries its own price and its own stock, because "5 kg" and
 * "5 kg, none left" are the two facts that decide the tap.
 */

function Option({
  variant,
  inCart,
  onPress,
}: {
  variant: ProductVariant;
  inCart: number;
  onPress: () => void;
}) {
  const t = useT();
  const soldOut = variant.stock != null && variant.stock <= 0;
  const saving = variant.mrp && variant.mrp > variant.price ? variant.mrp - variant.price : 0;
  const low = !soldOut && variant.stock != null && variant.stock <= 5;

  return (
    <Touchable
      haptic={soldOut ? "none" : "medium"}
      onPress={soldOut ? () => {} : onPress}
      disabled={soldOut}
      accessibilityLabel={
        soldOut
          ? t("variant.option.soldOutA11y", { name: variant.name })
          : t("variant.option.addA11y", { name: variant.name, price: variant.price })
      }
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[3],
        paddingVertical: theme.spacing[3],
        paddingHorizontal: theme.spacing[4],
        borderRadius: theme.radii.lg,
        borderWidth: 1,
        borderColor: inCart > 0 ? theme.color.brandBorder : theme.color.border,
        backgroundColor: inCart > 0 ? theme.color.brandSoft : theme.color.surface,
        opacity: soldOut ? 0.5 : 1,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {variant.name}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: theme.spacing[2] }}>
          <Price value={variant.price} variant="caption" />
          {saving > 0 && (
            <Price
              value={variant.mrp!}
              variant="caption"
              color="textFaint"
              style={{ textDecorationLine: "line-through" }}
            />
          )}
          {soldOut ? (
            <Text variant="caption" color="danger">
              {t("product.soldOut")}
            </Text>
          ) : low ? (
            <Text variant="caption" color="warning">
              {t("product.onlyLeft", { count: variant.stock! })}
            </Text>
          ) : null}
        </View>
      </View>

      {inCart > 0 ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: theme.spacing[3],
            height: 28,
            borderRadius: theme.radii.full,
            backgroundColor: theme.color.brand,
          }}
        >
          <Text variant="caption" style={{ color: theme.color.onBrand }} tabular>
            {inCart}
          </Text>
          <Ionicons name="add" size={13} color={theme.color.onBrand} />
        </View>
      ) : (
        <Ionicons
          name={soldOut ? "close-circle-outline" : "add-circle"}
          size={22}
          color={soldOut ? theme.color.textFaint : theme.color.brand}
        />
      )}
    </Touchable>
  );
}

export function VariantSheet({
  product,
  /** How many of each variant are already in the basket, by variant id. */
  inCart,
  onPick,
  onClose,
}: {
  product: Product | null;
  inCart: Record<string, number>;
  onPick: (variant: ProductVariant) => void;
  onClose: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const options = (product?.variants ?? []).filter((v) => v.isActive !== false);
  const picked = options.reduce((sum, v) => sum + (inCart[v.id] ?? 0), 0);

  return (
    <Modal
      visible={Boolean(product)}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View entering={FadeIn.duration(140)} style={{ flex: 1 }}>
        {/* The scrim closes it, because a sheet that can only be dismissed by a
            button is a sheet people feel trapped in. */}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("variant.closeA11y")}
          style={{ flex: 1, backgroundColor: "rgba(27,18,32,0.42)" }}
        />
        <Animated.View
          entering={SlideInDown.duration(240)}
          style={{
            backgroundColor: theme.color.surface,
            borderTopLeftRadius: theme.radii["2xl"],
            borderTopRightRadius: theme.radii["2xl"],
            paddingHorizontal: theme.spacing[4],
            paddingTop: theme.spacing[3],
            paddingBottom: insets.bottom + theme.spacing[5],
            maxHeight: "72%",
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 38,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.color.border,
              marginBottom: theme.spacing[4],
            }}
          />

          <Text variant="title3" numberOfLines={2}>
            {product?.name}
          </Text>
          <Text variant="caption" color="textMuted" style={{ marginTop: theme.spacing[1] }}>
            {options.length === 1
              ? t("variant.oneOption")
              : t("variant.chooseFrom", { count: options.length })}
          </Text>

          <ScrollView
            style={{ marginTop: theme.spacing[4] }}
            contentContainerStyle={{ gap: theme.spacing[3] }}
            showsVerticalScrollIndicator={false}
          >
            {options.map((variant) => (
              <Option
                key={variant.id}
                variant={variant}
                inCart={inCart[variant.id] ?? 0}
                onPress={() => onPick(variant)}
              />
            ))}
          </ScrollView>

          {/* Tapping the scrim works, but the sheet stays open after a pick on
              purpose, so there has to be a visible way to say "that's it". */}
          <Touchable
            haptic="light"
            onPress={onClose}
            accessibilityLabel={picked > 0 ? t("variant.doneA11y") : t("variant.closeA11y")}
            style={{
              height: 48,
              marginTop: theme.spacing[4],
              borderRadius: theme.radii.lg,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: picked > 0 ? theme.color.brand : theme.color.surfaceSunken,
            }}
          >
            <Text
              variant="bodyStrong"
              style={{ color: picked > 0 ? theme.color.onBrand : theme.color.textSecondary }}
            >
              {picked > 0 ? t("variant.done", { count: picked }) : t("common.close")}
            </Text>
          </Touchable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
