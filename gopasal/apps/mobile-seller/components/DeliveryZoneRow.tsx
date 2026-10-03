import * as React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  parseZonePolygon,
  type DeliveryZone,
  type LatLng,
} from "@gopasal/native-data/seller-delivery";
import { Text, Touchable, theme, useT } from "@gopasal/native-ui";
import { DeliveryZoneOutline } from "./DeliveryZoneOutline";
import { ringAreaM2 } from "./DeliveryGeometry";

/**
 * One delivery zone in the list: its shape, its name, and what it charges.
 *
 * The fee line is the part that has to be exactly right, because it is money
 * and because the API gives `null` and `0` different meanings: null is "the
 * usual distance-based fee", 0 is "free delivery in this zone". Printing both as
 * "रु 0" or both as "—" would tell a shopkeeper the wrong thing about one of them.
 *
 * A zone whose stored outline cannot be read (written by an older version, a
 * seed, a migration) is listed, not hidden — it may still be matching addresses
 * on the server for all the phone knows — and says that it needs redrawing.
 */
export function DeliveryZoneRow({ zone, onPress }: { zone: DeliveryZone; onPress: () => void }) {
  const t = useT();
  const polygon: LatLng[] | null = React.useMemo(
    () => parseZonePolygon(zone.polygon),
    [zone.polygon],
  );

  const fee =
    zone.feeOverride === null
      ? t("delivery.zone.feeFormula")
      : zone.feeOverride === 0
        ? t("delivery.zone.feeFree")
        : t("delivery.zone.feeFixed", { amount: zone.feeOverride });

  const km2 = polygon ? ringAreaM2(polygon) / 1_000_000 : 0;

  return (
    <Touchable
      haptic="light"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t("delivery.zone.rowA11y", { name: zone.name, fee })}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[3],
        paddingVertical: theme.spacing[3],
      }}
    >
      <View style={{ width: 56 }}>
        {polygon ? (
          <DeliveryZoneOutline points={polygon} height={56} compact accessibilityLabel="" />
        ) : (
          <View
            style={{
              height: 56,
              borderRadius: theme.radii.md,
              backgroundColor: theme.color.warningSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="help-outline" size={20} color={theme.palette.marigold[600]} />
          </View>
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="callout" numberOfLines={1}>
          {zone.name}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {fee}
        </Text>
        <Text variant="caption" color={polygon ? "textMuted" : "danger"} numberOfLines={2}>
          {polygon
            ? t("delivery.zone.shape", {
                count: polygon.length,
                area: km2 < 0.01 ? "<0.01" : km2.toFixed(2),
              })
            : t("delivery.zone.unreadable")}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color={theme.color.textFaint} />
    </Touchable>
  );
}
