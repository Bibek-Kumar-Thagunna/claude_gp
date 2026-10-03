import * as React from "react";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  canChangeMemberRole,
  canRemoveMember,
  canSetMemberStatus,
  memberDisplayName,
  type StaffMember,
} from "@gopasal/native-data/seller-team";
import { Button, Card, Text, Touchable, theme, useT } from "@gopasal/native-ui";
import { TeamLocked, useVerdictText } from "./TeamFrame";
import { TeamRolePicker } from "./TeamRolePicker";
import { roleName } from "../lib/role-name";

/**
 * One person on the team.
 *
 * Collapsed, it answers the question the list is read for — who is this, what
 * are they allowed to do, can they work right now. Tapped open, it shows the
 * three things that can be done to them, and **a control the server would
 * refuse is drawn disabled with the server's own sentence under it**, rather
 * than hidden. The owner's card is the main case: hiding its controls would
 * look like a bug; showing them locked with "The owner cannot be removed" is
 * the answer to the question somebody was about to ask.
 *
 * Nothing here acts directly. Every control asks the screen, which confirms
 * with the real consequence first — a role change and a removal both change
 * what somebody can do the moment they land.
 */
export function TeamMemberCard({
  member,
  shopId,
  isSelf,
  expanded,
  canManage,
  onToggle,
  onChangeRole,
  onSetStatus,
  onRemove,
  onOpenRoles,
  index,
}: {
  member: StaffMember;
  shopId: string | null;
  isSelf: boolean;
  expanded: boolean;
  /** Holds `team.invite`, the one grant behind all three controls. */
  canManage: boolean;
  onToggle: () => void;
  onChangeRole: (role: { id: string; name: string }) => void;
  onSetStatus: (status: "ACTIVE" | "SUSPENDED") => void;
  onRemove: () => void;
  onOpenRoles?: () => void;
  index: number;
}) {
  const t = useT();
  const verdictText = useVerdictText();
  const name = memberDisplayName(member);
  const owner = member.role.isPrivileged;
  const suspended = member.status === "SUSPENDED";

  const roleVerdict = canChangeMemberRole(member);
  const nextStatus = suspended ? "ACTIVE" : "SUSPENDED";
  const statusVerdict = canSetMemberStatus(member, nextStatus);
  const removeVerdict = canRemoveMember(member);

  return (
    <Card padded={false} index={index}>
      {/* Not `disabled` for a read-only viewer: a disabled Touchable dims to
          0.45, which is right for a button and wrong for a row that is still
          the thing being read. It simply has nothing to open. */}
      <Touchable
        haptic={canManage ? "light" : "none"}
        onPress={canManage ? onToggle : undefined}
        accessibilityRole={canManage ? "button" : "text"}
        accessibilityState={canManage ? { expanded } : undefined}
        accessibilityLabel={t("team.member.a11y", {
          name,
          role: roleName(member.role, t),
          status: suspended ? t("team.member.suspended") : t("team.member.active"),
        })}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
          padding: theme.spacing[4],
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: theme.radii.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: owner ? theme.color.brandSoft : theme.color.surfaceSunken,
          }}
        >
          {owner ? (
            <Ionicons name="key" size={17} color={theme.color.brand} />
          ) : (
            <Text variant="callout" color={suspended ? "textFaint" : "textSecondary"}>
              {name.slice(0, 1).toUpperCase()}
            </Text>
          )}
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
            <Text
              variant="callout"
              color={suspended ? "textMuted" : "text"}
              numberOfLines={1}
              style={{ flexShrink: 1 }}
            >
              {name}
            </Text>
            {isSelf ? (
              <Text variant="caption" color="textFaint">
                {t("team.member.you")}
              </Text>
            ) : null}
          </View>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {member.user.name?.trim()
              ? `${roleName(member.role, t)} · ${member.user.phone}`
              : roleName(member.role, t)}
          </Text>
        </View>

        <TeamPill
          label={
            owner
              ? t("team.member.owner")
              : suspended
                ? t("team.member.suspended")
                : t("team.member.active")
          }
          tone={owner ? "brand" : suspended ? "muted" : "success"}
        />
        {canManage ? (
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={theme.color.textFaint}
          />
        ) : null}
      </Touchable>

      {expanded && canManage ? (
        <Animated.View
          entering={FadeIn.duration(160)}
          style={{
            borderTopWidth: 1,
            borderTopColor: theme.color.border,
            padding: theme.spacing[4],
            gap: theme.spacing[5],
          }}
        >
          <View style={{ gap: theme.spacing[2] }}>
            <Text variant="overline" color="textMuted">
              {t("team.member.roleHeading")}
            </Text>
            {roleVerdict.allowed ? (
              <TeamRolePicker
                shopId={shopId}
                selected={null}
                current={member.roleId}
                onSelect={onChangeRole}
                onOpenRoles={onOpenRoles}
                purpose="change"
              />
            ) : (
              <>
                <Text variant="callout">{roleName(member.role, t)}</Text>
                <TeamLocked reason={verdictText(roleVerdict)} />
              </>
            )}
          </View>

          <View style={{ gap: theme.spacing[2] }}>
            <Button
              label={suspended ? t("team.member.reactivate") : t("team.member.suspend")}
              variant="secondary"
              leading={
                <Ionicons
                  name={suspended ? "play-circle-outline" : "pause-circle-outline"}
                  size={17}
                  color={theme.color.text}
                />
              }
              disabled={!statusVerdict.allowed}
              accessibilityLabel={
                suspended
                  ? t("team.member.a11yReactivate", { name })
                  : t("team.member.a11ySuspend", { name })
              }
              onPress={() => onSetStatus(nextStatus)}
            />
            <TeamLocked reason={verdictText(statusVerdict)} />
          </View>

          <View style={{ gap: theme.spacing[2] }}>
            <Button
              label={t("team.member.remove")}
              variant="danger"
              disabled={!removeVerdict.allowed}
              accessibilityLabel={t("team.member.a11yRemove", { name })}
              onPress={onRemove}
            />
            <TeamLocked reason={verdictText(removeVerdict)} />
          </View>
        </Animated.View>
      ) : null}
    </Card>
  );
}

export function TeamPill({
  label,
  tone,
}: {
  label: string;
  tone: "brand" | "success" | "muted" | "warning" | "danger";
}) {
  const colors = {
    brand: { bg: theme.color.brandSoft, fg: theme.color.brand },
    success: { bg: theme.color.successSoft, fg: theme.color.success },
    muted: { bg: theme.color.surfaceSunken, fg: theme.color.textMuted },
    warning: { bg: theme.color.warningSoft, fg: theme.palette.marigold[600] },
    danger: { bg: theme.color.dangerSoft, fg: theme.color.danger },
  }[tone];
  return (
    <View
      style={{
        paddingHorizontal: theme.spacing[2],
        paddingVertical: 3,
        borderRadius: theme.radii.full,
        backgroundColor: colors.bg,
      }}
    >
      <Text variant="caption" style={{ color: colors.fg }}>
        {label}
      </Text>
    </View>
  );
}
