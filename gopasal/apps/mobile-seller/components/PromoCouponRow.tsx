import * as React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { couponState, type Coupon } from "@gopasal/native-data/seller-promotions";
import { Card, Text, Touchable, theme, useT } from "@gopasal/native-ui";
import { dateLabel, describeCoupon, rupees, stateLabel, stateTone } from "./PromoCopy";

/**
 * One coupon in the list.
 *
 * The code comes first and largest because it is what gets read out to a
 * customer; then what it does, in rupees or percent; then whether it works
 * *right now* and how much of it is left.
 *
 * The state is `couponState` evaluated at the server's `asOf`, never the
 * phone's clock. A handset a minute behind would otherwise print "Ended" on a
 * code the server still counts as working, and a shopkeeper reading that makes
 * a second code the API then refuses as a duplicate.
 *
 * `usedCount` is the only usage number the API has. There is no revenue per
 * code and no list of the orders that used one, so the row does not pretend to
 * either.
 */
export function PromoCouponRow({
  coupon,
  at,
  index,
  onPress,
}: {
  coupon: Coupon;
  /** The server's `summary.asOf`, as epoch ms. */
  at: number;
  index: number;
  onPress: () => void;
}) {
  const t = useT();
  const state = couponState(coupon, at);
  const tone = stateTone(state);
  const toneColor = {
    success: theme.color.success,
    muted: theme.color.textMuted,
    warning: theme.palette.marigold[600],
    brand: theme.color.brand,
  }[tone];
  const toneSoft = {
    success: theme.color.successSoft,
    muted: theme.color.surfaceSunken,
    warning: theme.color.warningSoft,
    brand: theme.color.brandSoft,
  }[tone];

  const usage =
    coupon.usageLimit != null
      ? t("promo.row.usedOf", { used: coupon.usedCount, limit: coupon.usageLimit })
      : coupon.usedCount === 1
        ? t("promo.row.usedOnce")
        : t("promo.row.used", { used: coupon.usedCount });

  const when =
    state === "SCHEDULED"
      ? null
      : coupon.validTo
        ? state === "EXPIRED"
          ? t("promo.row.ended", { date: dateLabel(coupon.validTo) })
          : t("promo.row.ends", { date: dateLabel(coupon.validTo) })
        : t("promo.row.noEnd");

  const what = describeCoupon(coupon, t);
  const floor = coupon.minOrder > 0 ? t("promo.row.floor", { min: rupees(coupon.minOrder) }) : null;
  const status = stateLabel(state, coupon, t);

  return (
    // The pressable wraps the card rather than the card being pressable, so
    // the whole row is announced as one sentence instead of five fragments.
    <Touchable
      haptic="light"
      scaleTo={0.985}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t("promo.row.a11y", { code: coupon.code, what, status, usage })}
      testID={`coupon-${coupon.code}`}
    >
      <Card index={index} style={{ gap: theme.spacing[2] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              variant="title3"
              numberOfLines={1}
              color={state === "RUNNING" ? "text" : "textMuted"}
              style={{ letterSpacing: 1 }}
            >
              {coupon.code}
            </Text>
            <Text variant="callout" color="textSecondary" numberOfLines={1}>
              {floor ? `${what} · ${floor}` : what}
            </Text>
          </View>
          <View
            style={{
              paddingHorizontal: theme.spacing[2],
              paddingVertical: 3,
              borderRadius: theme.radii.full,
              backgroundColor: toneSoft,
            }}
          >
            <Text variant="caption" style={{ color: toneColor }}>
              {status}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.color.textFaint} />
        </View>

        <View style={{ flexDirection: "row", gap: theme.spacing[3] }}>
          <Text variant="caption" color="textMuted" tabular>
            {usage}
          </Text>
          {when ? (
            <Text variant="caption" color="textFaint">
              {when}
            </Text>
          ) : null}
        </View>
      </Card>
    </Touchable>
  );
}
