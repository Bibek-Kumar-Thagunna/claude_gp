import * as React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { Button, Skeleton, Sunken, Text, Touchable, theme, useT } from "@gopasal/native-ui";

/**
 * The frame the two coupon screens share: header, the calm empty and
 * no-access states, and the red strip for a failed write.
 *
 * The same shapes as the team screens' frame, kept separate so the two surfaces
 * can change independently — the coupon screens are the one place in the app
 * that talks about money leaving the shop, and their empty states say so.
 */

export function PromoHeader({ title, subtitle }: { title: string; subtitle?: string | null }) {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[3],
        paddingTop: insets.top + theme.spacing[2],
        paddingHorizontal: theme.spacing[4],
        paddingBottom: theme.spacing[3],
        backgroundColor: theme.color.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.color.border,
      }}
    >
      <Touchable
        haptic="light"
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
        style={{
          width: 40,
          height: 40,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: theme.radii.full,
          borderWidth: 1,
          borderColor: theme.color.border,
        }}
      >
        <Ionicons name="arrow-back" size={19} color={theme.color.text} />
      </Touchable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="title2" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function PromoNotice({
  icon,
  title,
  detail,
  extra,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  extra?: string | null;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View
      style={{
        alignItems: "center",
        gap: theme.spacing[2],
        paddingVertical: theme.spacing[8],
        paddingHorizontal: theme.spacing[4],
      }}
    >
      <Ionicons name={icon} size={30} color={theme.color.textFaint} />
      <Text variant="title3" align="center">
        {title}
      </Text>
      <Text variant="footnote" color="textMuted" align="center">
        {detail}
      </Text>
      {extra ? (
        <Text variant="caption" color="textFaint" align="center">
          {extra}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          full={false}
          size="sm"
          onPress={onAction}
          style={{ marginTop: theme.spacing[3] }}
        />
      ) : null}
    </View>
  );
}

/**
 * No `promotions.view` (or `.manage`, for writing one). `restricted` first:
 * a shop awaiting approval withholds keys the role does grant, and "you don't
 * have access" would be false to an owner.
 */
export function PromoNoAccess({
  restricted,
  restrictionReason,
  what,
}: {
  restricted: boolean;
  restrictionReason: string | null;
  what: string;
}) {
  const t = useT();
  const router = useRouter();
  return (
    <PromoNotice
      icon="lock-closed-outline"
      title={restricted ? t("promo.noAccess.restrictedTitle") : t("promo.noAccess.title")}
      detail={
        restricted
          ? t("promo.noAccess.restrictedDetail", { what })
          : t("promo.noAccess.detail", { what })
      }
      extra={restricted ? restrictionReason : null}
      actionLabel={t("common.back")}
      onAction={() => router.back()}
    />
  );
}

export function PromoError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Animated.View entering={FadeIn.duration(160)}>
      <Sunken
        style={{
          flexDirection: "row",
          gap: theme.spacing[3],
          backgroundColor: theme.color.dangerSoft,
        }}
      >
        <Ionicons name="alert-circle" size={16} color={theme.color.danger} />
        <Text variant="caption" style={{ color: theme.color.danger, flex: 1 }}>
          {message}
        </Text>
      </Sunken>
    </Animated.View>
  );
}

export function PromoLoading() {
  return (
    <View style={{ gap: theme.spacing[3] }}>
      <Skeleton width="100%" height={84} radius={theme.radii.lg} />
      <Skeleton width="100%" height={84} radius={theme.radii.lg} delay={60} />
      <Skeleton width="100%" height={84} radius={theme.radii.lg} delay={120} />
    </View>
  );
}
