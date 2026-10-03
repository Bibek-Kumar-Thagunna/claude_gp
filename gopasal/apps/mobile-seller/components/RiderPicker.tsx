import * as React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ShopRider } from "@gopasal/native-data/seller";
import { Skeleton, Text, Touchable, theme, useT } from "@gopasal/native-ui";

/**
 * Choosing who takes the bag out.
 *
 * `OrdersService.dispatch` refuses with "Assign a rider before dispatching"
 * while the delivery leg has no rider, so this is not a nicety before the
 * dispatch button — it is the step that makes the dispatch button work, and the
 * screen has to offer it rather than discover the 400.
 *
 * `activeDeliveries` is the only fact here that decides anything: a roster of
 * six names tells a shopkeeper nothing, but "Bikash — 2 on the road" tells them
 * who to hand it to. Rider `status` is deliberately not shown as a control:
 * it is written by the rider's own app and by the assign transaction, and there
 * is no seller route that sets it, so a switch here would be a lie.
 */
export function RiderPicker({
  riders,
  loading,
  assignedRiderId,
  busy,
  onPick,
}: {
  riders: ShopRider[];
  loading: boolean;
  /** The rider already on the delivery leg, if any. */
  assignedRiderId: string | null;
  busy: boolean;
  onPick: (riderId: string) => void;
}) {
  const t = useT();

  if (loading) {
    return (
      <View style={{ gap: theme.spacing[2] }}>
        {[0, 1].map((i) => (
          <Skeleton key={i} width="100%" height={52} radius={theme.radii.md} delay={i * 80} />
        ))}
      </View>
    );
  }

  if (riders.length === 0) {
    return (
      <Text variant="footnote" color="textMuted">
        {t("order.noRiders")}
      </Text>
    );
  }

  return (
    <View style={{ gap: theme.spacing[2] }}>
      {riders.map((rider) => {
        const picked = rider.id === assignedRiderId;
        const name = rider.user.name ?? rider.user.phone;
        return (
          <Touchable
            key={rider.id}
            haptic="selection"
            disabled={busy || picked}
            onPress={() => onPick(rider.id)}
            accessibilityLabel={t("order.a11y.pickRider", { name })}
            accessibilityState={{ selected: picked }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.spacing[3],
              padding: theme.spacing[3],
              borderRadius: theme.radii.md,
              borderWidth: 1,
              borderColor: picked ? theme.color.brand : theme.color.border,
              backgroundColor: picked ? theme.color.brandSoft : theme.color.surface,
            }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: theme.radii.full,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: picked ? theme.color.brand : theme.color.surfaceSunken,
              }}
            >
              <Ionicons
                name="bicycle"
                size={17}
                color={picked ? theme.color.onBrand : theme.color.textMuted}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="callout" numberOfLines={1}>
                {name}
              </Text>
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {rider.activeDeliveries > 0
                  ? t("order.riderLoad", { count: rider.activeDeliveries })
                  : rider.user.phone}
              </Text>
            </View>
            {picked && <Ionicons name="checkmark-circle" size={20} color={theme.color.brand} />}
          </Touchable>
        );
      })}
    </View>
  );
}
