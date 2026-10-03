import * as React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ShopRider } from "@gopasal/native-data/seller";
import { Skeleton, Text, theme, useT } from "@gopasal/native-ui";

/**
 * The rider roster, read-only.
 *
 * Two things are deliberately absent, and both are absent because the API is
 * right to keep them elsewhere rather than because they were forgotten:
 *
 *  - **No adding or removing.** Registering a rider upserts a `User` — an
 *    unknown phone gets an account created, a known one has its name
 *    overwritten — which is a consequential, undoable write that deserves the
 *    web console's room to warn about it. The screen says so instead of
 *    offering a disabled button.
 *  - **No control over availability.** `RiderStatus` is written by the rider's
 *    own app and by the assign and complete transactions. There is no seller
 *    route that sets it, so a switch here would be a lie about who is in
 *    charge of it.
 *
 * What is shown is what a shopkeeper can act on: who is on the roster, and
 * whether they could take a bag right now. `activeDeliveries` beats `status`
 * where they disagree — a rider marked online with two orders on the road is
 * not free, whatever the column says.
 */

type Availability = {
  label: string;
  /** The dot beside the name — the part read at a glance. */
  color: string;
};

function availability(rider: ShopRider, t: ReturnType<typeof useT>): Availability {
  if (rider.activeDeliveries > 0 || rider.status === "ON_DELIVERY") {
    return {
      label: t("shop.rider.busy", { count: rider.activeDeliveries }),
      color: theme.color.warning,
    };
  }
  if (rider.status === "ONLINE") {
    return { label: t("shop.rider.free"), color: theme.color.success };
  }
  return { label: t("shop.rider.offline"), color: theme.color.textFaint };
}

export function ShopRiderRoster({
  riders,
  loading,
  failed = false,
}: {
  riders: ShopRider[];
  loading: boolean;
  /** The roster could not be fetched — said plainly rather than shown empty. */
  failed?: boolean;
}) {
  const t = useT();

  if (loading) {
    return (
      <View style={{ gap: theme.spacing[2] }}>
        {[0, 1].map((i) => (
          <Skeleton key={i} width="100%" height={44} radius={theme.radii.md} delay={i * 80} />
        ))}
      </View>
    );
  }

  if (failed) {
    return (
      <Text variant="footnote" color="textMuted">
        {t("shop.riders.failed")}
      </Text>
    );
  }

  if (riders.length === 0) {
    // The same sentence the order screen uses when there is nobody to hand a
    // bag to, because it is the same fact and a second wording for it would
    // make a shopkeeper wonder whether it is a different problem.
    return (
      <Text variant="footnote" color="textMuted">
        {t("order.noRiders")}
      </Text>
    );
  }

  return (
    <View style={{ gap: theme.spacing[1] }}>
      {riders.map((rider) => {
        const name = rider.user.name ?? rider.user.phone;
        const state = availability(rider, t);
        return (
          <View
            key={rider.id}
            accessible
            accessibilityLabel={`${name}. ${state.label}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.spacing[3],
              paddingVertical: theme.spacing[2],
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: theme.radii.full,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.color.surfaceSunken,
              }}
            >
              <Ionicons name="bicycle" size={16} color={theme.color.textMuted} />
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="callout" numberOfLines={1}>
                {name}
              </Text>
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {rider.user.phone}
              </Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: theme.radii.full,
                  backgroundColor: state.color,
                }}
              />
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {state.label}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
