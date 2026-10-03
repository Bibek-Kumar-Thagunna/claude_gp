import * as React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import type { ShopPermissions, TeamVerdict } from "@gopasal/native-data/seller-team";
import { Button, Skeleton, Sunken, Text, Touchable, theme, useT } from "@gopasal/native-ui";

/**
 * The pieces every team screen shares: the header, the calm "not for you"
 * state, the red strip, and the sentence under a locked control.
 *
 * Kept together because they are one voice. The team screens are the only place
 * in this app where a shopkeeper is routinely *not allowed* to do something, and
 * whether that reads as a considered rule or as a broken button depends on these
 * four saying it the same way every time.
 */

export function TeamHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string | null;
  /** Replaces `router.back()` — the invite screen routes it through its guard. */
  onBack?: () => void;
  right?: React.ReactNode;
}) {
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
        onPress={onBack ?? (() => router.back())}
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
      {right}
    </View>
  );
}

/**
 * A whole screen's worth of "there is nothing to do here, and this is why".
 *
 * Used for no access, no shop, and the empty lists. One shape for all of them
 * because they are the same situation to the reader — the screen is fine, the
 * content is absent — and a locked screen drawn as an error makes a teammate
 * think the app is broken rather than that the owner set it up this way.
 */
export function TeamNotice({
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
  /** A second line in a quieter voice — usually the server's own reason. */
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
          variant="secondary"
          size="sm"
          onPress={onAction}
          style={{ marginTop: theme.spacing[3] }}
        />
      ) : null}
    </View>
  );
}

/**
 * The screen a teammate sees when their role does not reach this far.
 *
 * `restricted` is checked first because it changes the sentence completely: a
 * shop still awaiting approval withholds keys the role *does* grant, and telling
 * the owner "you don't have access" to their own team would be false.
 */
export function TeamNoAccess({
  permissions,
  what,
}: {
  permissions: Pick<ShopPermissions, "restricted" | "restrictionReason">;
  /** Which part of the team surface, already translated. */
  what: string;
}) {
  const t = useT();
  const router = useRouter();
  return (
    <TeamNotice
      icon="lock-closed-outline"
      title={permissions.restricted ? t("team.noAccess.restrictedTitle") : t("team.noAccess.title")}
      detail={
        permissions.restricted
          ? t("team.noAccess.restrictedDetail", { what })
          : t("team.noAccess.detail", { what })
      }
      extra={permissions.restricted ? permissions.restrictionReason : null}
      actionLabel={t("common.back")}
      onAction={() => router.back()}
    />
  );
}

/** A failed write, said where the thumb is. The API's sentence when it gave one. */
export function TeamError({ message }: { message: string | null }) {
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

/**
 * The line under a control the server would refuse.
 *
 * The data layer carries the API's own English sentence; it is looked up under
 * the refusal code first so it can be translated, and falls back to the API's
 * words verbatim — never to a paraphrase, which is how a disabled button and the
 * error it replaced end up disagreeing.
 */
export function useVerdictText(): (verdict: TeamVerdict) => string | null {
  const t = useT();
  return React.useCallback(
    (verdict: TeamVerdict) =>
      verdict.allowed ? null : t(`team.refusal.${verdict.refusal}`, undefined, verdict.reason),
    [t],
  );
}

export function TeamLocked({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return (
    <View style={{ flexDirection: "row", gap: theme.spacing[2], alignItems: "flex-start" }}>
      <Ionicons
        name="lock-closed"
        size={12}
        color={theme.color.textFaint}
        style={{ marginTop: 2 }}
      />
      <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
        {reason}
      </Text>
    </View>
  );
}

/** What a failed request says. The API's message is written for people; ours is the fallback. */
export function useFailureText(): (cause: unknown) => string {
  const t = useT();
  return React.useCallback(
    (cause: unknown) =>
      cause instanceof Error && cause.message.trim() !== ""
        ? cause.message
        : t("common.somethingWrong"),
    [t],
  );
}

export function TeamLoading() {
  return (
    <View style={{ padding: theme.spacing[4], gap: theme.spacing[3] }}>
      <Skeleton width="100%" height={72} radius={theme.radii.lg} />
      <Skeleton width="100%" height={72} radius={theme.radii.lg} delay={60} />
      <Skeleton width="100%" height={72} radius={theme.radii.lg} delay={120} />
    </View>
  );
}

/** Short date, Western digits, the year only when it is not this one. */
export function shortDate(iso: string): string {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return "";
  const sameYear = at.getFullYear() === new Date().getFullYear();
  return at.toLocaleDateString(
    [],
    sameYear
      ? { day: "numeric", month: "short" }
      : { day: "numeric", month: "short", year: "numeric" },
  );
}
