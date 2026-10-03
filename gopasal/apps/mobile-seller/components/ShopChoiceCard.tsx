import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import type { SellerShop } from "@gopasal/native-data/seller";
import { Text, Touchable, stagger, theme, useT } from "@gopasal/native-ui";

/**
 * One shop on the picker.
 *
 * The screen exists to answer one question — *which counter am I standing at?*
 * — and two branches of the same chain usually share a name, so the row has to
 * carry enough to tell them apart without opening either: the area, and whether
 * that branch is trading right now. The open/closed pill does double duty,
 * because a seller switching mid-shift is often switching *because* they just
 * remembered the other branch is still shut.
 *
 * The current shop is marked rather than hidden. A switcher that quietly drops
 * the shop you are on makes you count the list to work out what happened.
 *
 * Built on `Touchable` rather than `Card` for one reason: the row needs a
 * spoken label of its own. "Kalimati Kirana, Kalimati, open" is one sentence a
 * screen reader can act on; the stack of text nodes a card would announce
 * instead is the same information in the order the layout happened to put it.
 */
export function ShopChoiceCard({
  shop,
  current,
  busy,
  index,
  onPress,
}: {
  shop: SellerShop;
  current: boolean;
  /** A selection is in flight — this row is the one being selected. */
  busy: boolean;
  index: number;
  onPress: () => void;
}) {
  const t = useT();
  const area = shop.area?.trim();
  const state = shop.isOpen ? t("shop.pill.open") : t("shop.closed");

  return (
    <Animated.View entering={FadeInDown.delay(stagger(index)).duration(320)}>
      <Touchable
        haptic="selection"
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ selected: current, busy }}
        // Two keys rather than one with an empty variable: a shop with no area
        // would otherwise be announced as "Kirana Pasal, , open".
        accessibilityLabel={
          area
            ? t("shop.picker.a11yShop", { name: shop.name, area, state })
            : t("shop.picker.a11yShopNoArea", { name: shop.name, state })
        }
        scaleTo={0.985}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[4],
          padding: theme.spacing[4],
          borderRadius: theme.radii.lg,
          borderWidth: 1,
          borderColor: current ? theme.color.brand : theme.color.border,
          backgroundColor: current ? theme.color.brandSoft : theme.color.surface,
          ...theme.shadows.sm,
        }}
      >
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: theme.radii.lg,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: current ? theme.color.brand : theme.color.surfaceSunken,
          }}
        >
          {shop.emoji ? (
            <Text variant="title3">{shop.emoji}</Text>
          ) : (
            <Ionicons
              name="storefront"
              size={22}
              color={current ? theme.color.onBrand : theme.color.textMuted}
            />
          )}
        </View>

        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text variant="title3" numberOfLines={1}>
            {shop.name}
          </Text>
          {/* The Nepali name only when the shop has one, set in Hind — a
              Devanagari name in a Latin face loses its matras. */}
          {shop.nameNp ? (
            <Text variant="caption" script="np" color="textSecondary" numberOfLines={1}>
              {shop.nameNp}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
            {area ? (
              <Text variant="caption" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
                {area}
              </Text>
            ) : null}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingHorizontal: theme.spacing[2],
                paddingVertical: 2,
                borderRadius: theme.radii.full,
                backgroundColor: shop.isOpen ? theme.color.successSoft : theme.color.dangerSoft,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: theme.radii.full,
                  backgroundColor: shop.isOpen ? theme.color.success : theme.color.danger,
                }}
              />
              <Text variant="caption" color={shop.isOpen ? "success" : "danger"}>
                {state}
              </Text>
            </View>
          </View>

          {current ? (
            <Text variant="caption" color="brand" numberOfLines={1}>
              {t("shop.current")}
            </Text>
          ) : null}
        </View>

        {busy ? (
          <ActivityIndicator size="small" color={theme.color.brand} />
        ) : (
          <Ionicons
            name={current ? "checkmark-circle" : "chevron-forward"}
            size={current ? 22 : 16}
            color={current ? theme.color.brand : theme.color.textFaint}
          />
        )}
      </Touchable>
    </Animated.View>
  );
}
