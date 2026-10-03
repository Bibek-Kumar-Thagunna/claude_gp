import * as React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ShopRider } from "@gopasal/native-data/seller-delivery";
import { Text, Touchable, theme, useT } from "@gopasal/native-ui";
import { riderAvailability, spacedPhone, vehicleLabel } from "./DeliveryCopy";

/**
 * One rider on the delivery screen's roster.
 *
 * Unlike `ShopRiderRoster`, this row carries the one action a shop has over a
 * rider — taking them off the roster — and, just as deliberately, still carries
 * no control over whether they are online. That switch lives in the rider's own
 * app; the screen above says so once rather than every row repeating it.
 *
 * Remove is **absent, not disabled,** while the rider has a delivery on the
 * road, and the row says why in its place. The API refuses the delete in that
 * state, and `activeDeliveries` is exactly the count it checks, so the button
 * would only ever lead to a refusal. What replaces it is the thing to do
 * instead: finish or hand over those deliveries.
 */
export function DeliveryRiderRow({
  rider,
  canRemove,
  onRemove,
}: {
  rider: ShopRider;
  /** The viewer holds `delivery.assign`. */
  canRemove: boolean;
  onRemove: () => void;
}) {
  const t = useT();
  const name = rider.user.name?.trim() || spacedPhone(rider.user.phone);
  const state = riderAvailability(rider, t);
  const busy = rider.activeDeliveries > 0;

  return (
    <View style={{ paddingVertical: theme.spacing[3], gap: theme.spacing[2] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
        <View
          accessible
          accessibilityLabel={t("delivery.rider.a11y", {
            name,
            state: state.label,
            vehicle: vehicleLabel(rider.vehicleType, t),
          })}
          style={{
            flex: 1,
            minWidth: 0,
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing[3],
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: theme.radii.full,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.color.surfaceSunken,
            }}
          >
            <Ionicons
              name={rider.vehicleType === "WALK" ? "walk" : "bicycle"}
              size={17}
              color={theme.color.textMuted}
            />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="callout" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {`${spacedPhone(rider.user.phone)} · ${vehicleLabel(rider.vehicleType, t)}`}
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: theme.radii.full,
                backgroundColor: state.color,
              }}
            />
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {state.label}
            </Text>
          </View>
        </View>

        {canRemove && !busy ? (
          <Touchable
            haptic="light"
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={t("delivery.rider.removeA11y", { name })}
            style={{
              width: 36,
              height: 36,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: theme.radii.full,
            }}
          >
            <Ionicons name="trash-outline" size={17} color={theme.color.textMuted} />
          </Touchable>
        ) : null}
      </View>

      {canRemove && busy ? (
        <Text variant="caption" color="textFaint" style={{ marginLeft: 36 + theme.spacing[3] }}>
          {t("delivery.rider.cantRemove")}
        </Text>
      ) : null}
    </View>
  );
}
