import * as React from "react";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  canCloneRole,
  canDeleteRole,
  canEditRole,
  rolePermissionKeys,
  type PermissionCatalogGroup,
  type ShopRole,
} from "@gopasal/native-data/seller-team";
import { Button, Card, Text, Touchable, theme, useT } from "@gopasal/native-ui";
import { TeamLocked, useVerdictText } from "./TeamFrame";
import { TeamPill } from "./TeamMemberCard";
import { TeamPermissionChecklist } from "./TeamPermissionChecklist";
import { roleDescription, roleName } from "../lib/role-name";

/**
 * One role, and what it lets a person do.
 *
 * Closed, it is a name, a line of description and who holds it. Open, it is the
 * permissions it grants — only those, grouped — and the three things that can
 * be done to it, each locked with the API's reason when it would be refused.
 * The ready-made roles are the common case for a lock: they are shared by every
 * shop on GoPasal, so the way to change one is to copy it, and the Copy button
 * sits right next to the locked Edit saying so.
 *
 * `holders` is passed in rather than read from `_count`. On a shop's own role
 * the two agree, but on a ready-made one `_count` counts every shop on the
 * platform using it, and "214 people have this role" in a four-person kirana
 * is a number that is true and means nothing.
 */
export function TeamRoleCard({
  role,
  catalog,
  holders,
  expanded,
  onToggle,
  onEdit,
  onCopy,
  onDelete,
  index,
}: {
  role: ShopRole;
  catalog: readonly PermissionCatalogGroup[] | null;
  /** People in *this* shop holding it, or null if the roster isn't readable. */
  holders: number | null;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  index: number;
}) {
  const t = useT();
  const verdictText = useVerdictText();
  const held = React.useMemo(() => rolePermissionKeys(role), [role]);

  const edit = canEditRole(role);
  const remove = canDeleteRole(role);
  const copy = canCloneRole(role);

  const template = role.shopId === null;
  const meta = [
    role.isPrivileged ? t("team.role.everything") : t("team.role.permCount", { count: held.size }),
    holders === null
      ? null
      : holders === 0
        ? t("team.role.nobody")
        : holders === 1
          ? t("team.role.onePerson")
          : t("team.role.people", { count: holders }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card padded={false} index={index}>
      <Touchable
        haptic="light"
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={t("team.role.a11y", { role: roleName(role, t), meta })}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
          padding: theme.spacing[4],
        }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
            <Text variant="callout" numberOfLines={1} style={{ flexShrink: 1 }}>
              {roleName(role, t)}
            </Text>
            {role.isPrivileged ? (
              <TeamPill label={t("team.member.owner")} tone="brand" />
            ) : template ? (
              <TeamPill label={t("team.role.readyMade")} tone="muted" />
            ) : null}
          </View>
          {roleDescription(role, t) ? (
            <Text variant="caption" color="textSecondary" numberOfLines={2}>
              {roleDescription(role, t)}
            </Text>
          ) : null}
          <Text variant="caption" color="textMuted">
            {meta}
          </Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={theme.color.textFaint}
        />
      </Touchable>

      {expanded ? (
        <Animated.View
          entering={FadeIn.duration(160)}
          style={{
            borderTopWidth: 1,
            borderTopColor: theme.color.border,
            padding: theme.spacing[4],
            gap: theme.spacing[4],
          }}
        >
          {role.isPrivileged ? (
            // The guard short-circuits every check for the privileged role, so
            // its rows are not the whole story. Listing them would understate
            // it the day GoPasal adds a permission.
            <Text variant="footnote" color="textSecondary">
              {t("team.role.ownerAll")}
            </Text>
          ) : catalog ? (
            held.size > 0 ? (
              <TeamPermissionChecklist catalog={catalog} selected={held} mode="held" />
            ) : (
              <Text variant="footnote" color="textMuted">
                {t("team.role.nothing")}
              </Text>
            )
          ) : (
            <Text variant="caption" color="textMuted">
              {t("team.role.catalogMissing")}
            </Text>
          )}

          <View style={{ gap: theme.spacing[2] }}>
            <View style={{ flexDirection: "row", gap: theme.spacing[2] }}>
              <Button
                label={t("team.role.edit")}
                size="sm"
                variant="secondary"
                full={false}
                disabled={!edit.allowed}
                accessibilityLabel={t("team.role.a11yEdit", { role: roleName(role, t) })}
                onPress={onEdit}
                style={{ flex: 1 }}
              />
              <Button
                label={t("team.role.copy")}
                size="sm"
                variant="secondary"
                full={false}
                disabled={!copy.allowed}
                accessibilityLabel={t("team.role.a11yCopy", { role: roleName(role, t) })}
                onPress={onCopy}
                style={{ flex: 1 }}
              />
            </View>
            <TeamLocked reason={verdictText(edit)} />
            <TeamLocked reason={verdictText(copy)} />
          </View>

          {/* Delete only where it could ever apply. On a ready-made role the
              lock would repeat the one just shown under Edit. */}
          {edit.allowed ? (
            <View style={{ gap: theme.spacing[2] }}>
              <Button
                label={t("team.role.delete")}
                size="sm"
                variant="danger"
                disabled={!remove.allowed}
                accessibilityLabel={t("team.role.a11yDelete", { role: roleName(role, t) })}
                onPress={onDelete}
              />
              <TeamLocked reason={verdictText(remove)} />
            </View>
          ) : null}
        </Animated.View>
      ) : null}
    </Card>
  );
}
