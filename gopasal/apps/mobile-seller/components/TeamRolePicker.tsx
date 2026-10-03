import * as React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAssignableRoles } from "@gopasal/native-data/seller-team";
import { Button, Skeleton, Sunken, Text, Touchable, theme, useT } from "@gopasal/native-ui";
import { roleDescription, roleName } from "../lib/role-name";

/**
 * Choosing which role somebody gets.
 *
 * Only ever offers what `useAssignableRoles` returned. Anything else — the
 * Owner role, another shop's private role — is a 400 or an opaque 404 from the
 * API, and a picker that let somebody choose one would be a picker that fails on
 * the one tap that matters.
 *
 * The two empty states are different problems and get different sentences:
 *
 *  - **`needsRbacManage`**: this account may invite and re-role people but may
 *    not *read the role list*, which the API guards with the roles permission.
 *    That is a real gap in how the permissions are split, not a loading state,
 *    and the only honest thing is to say who can fix it.
 *  - **`empty`**: the list loaded and held only the Owner role. Nothing can be
 *    assigned until a role exists, and the way there is one tap away.
 */
export function TeamRolePicker({
  shopId,
  selected,
  current,
  onSelect,
  onOpenRoles,
  purpose,
}: {
  shopId: string | null;
  selected: string | null;
  /** The role somebody already holds — marked, and not offered as a change. */
  current?: string | null;
  onSelect: (role: { id: string; name: string }) => void;
  onOpenRoles?: () => void;
  purpose: "invite" | "change";
}) {
  const t = useT();
  const assignable = useAssignableRoles(shopId);

  if (assignable.needsRbacManage) {
    return (
      <Sunken style={{ flexDirection: "row", gap: theme.spacing[3] }}>
        <Ionicons name="key-outline" size={16} color={theme.color.textMuted} />
        <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
          {purpose === "invite"
            ? t("team.rolePicker.needsRoles.invite")
            : t("team.rolePicker.needsRoles.change")}
        </Text>
      </Sunken>
    );
  }

  if (assignable.isPending) {
    return (
      <View style={{ gap: theme.spacing[2] }}>
        <Skeleton width="100%" height={56} radius={theme.radii.lg} />
        <Skeleton width="100%" height={56} radius={theme.radii.lg} delay={60} />
      </View>
    );
  }

  if (assignable.error) {
    return (
      <Text variant="caption" style={{ color: theme.color.danger }}>
        {t("team.rolePicker.failed")}
      </Text>
    );
  }

  if (assignable.empty) {
    return (
      <Sunken style={{ gap: theme.spacing[3] }}>
        <Text variant="caption" color="textSecondary">
          {t("team.rolePicker.empty")}
        </Text>
        {onOpenRoles ? (
          <Button
            label={t("team.rolePicker.openRoles")}
            variant="secondary"
            size="sm"
            full={false}
            align="start"
            onPress={onOpenRoles}
          />
        ) : null}
      </Sunken>
    );
  }

  return (
    <View style={{ gap: theme.spacing[2] }} accessibilityRole="radiogroup">
      {assignable.roles.map((role) => {
        const on = role.id === selected;
        const isCurrent = role.id === current;
        const count = role.permissions.length;
        return (
          <Touchable
            key={role.id}
            haptic="selection"
            disabled={isCurrent}
            onPress={() => onSelect({ id: role.id, name: roleName(role, t) })}
            accessibilityRole="radio"
            accessibilityState={{ selected: on || isCurrent, disabled: isCurrent }}
            accessibilityLabel={
              isCurrent
                ? t("team.rolePicker.a11yCurrent", { role: roleName(role, t) })
                : t("team.rolePicker.a11yRole", { role: roleName(role, t), count })
            }
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.spacing[3],
              padding: theme.spacing[3],
              borderRadius: theme.radii.lg,
              borderWidth: 1,
              borderColor: on ? theme.color.brand : theme.color.border,
              backgroundColor: on ? theme.color.brandSoft : theme.color.surface,
            }}
          >
            <Ionicons
              name={on || isCurrent ? "radio-button-on" : "radio-button-off"}
              size={18}
              color={on ? theme.color.brand : theme.color.textFaint}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
                <Text variant="callout" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {roleName(role, t)}
                </Text>
                {/* A shop's own copy and GoPasal's template can share a name;
                    the tag is how the two "Delivery" rows are told apart. */}
                <Text variant="caption" color={role.shopId ? "brand" : "textFaint"}>
                  {role.shopId ? t("team.rolePicker.yours") : t("team.role.readyMade")}
                </Text>
              </View>
              <Text variant="caption" color="textMuted" numberOfLines={2}>
                {isCurrent
                  ? t("team.rolePicker.current")
                  : roleDescription(role, t) || t("team.rolePicker.count", { count })}
              </Text>
            </View>
          </Touchable>
        );
      })}
      {onOpenRoles ? (
        <Touchable
          haptic="light"
          onPress={onOpenRoles}
          accessibilityRole="link"
          accessibilityLabel={t("team.rolePicker.whatCanTheyDo")}
          style={{ paddingVertical: theme.spacing[2] }}
        >
          <Text variant="caption" color="brand">
            {t("team.rolePicker.whatCanTheyDo")}
          </Text>
        </Touchable>
      ) : null}
    </View>
  );
}
