import * as React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { PermissionCatalogGroup } from "@gopasal/native-data/seller-team";
import { Text, Touchable, theme, useT } from "@gopasal/native-ui";
import { permissionGroupLabel, permissionLabel, permissionNote } from "./TeamPermissionCopy";

/**
 * A role's permissions, in the API's own groups and order.
 *
 * Two uses, one component, so a role reads identically whether it is being
 * looked at or changed:
 *
 *  - **`held`** lists only what the role grants, grouped. It answers "what can
 *    a Cashier do?" without making anybody scan past thirty unticked boxes.
 *  - **`edit`** lists everything, with a tick per line and a whole-group toggle
 *    in the heading, because building a role is mostly "all of Orders, none of
 *    Money" and thirty individual taps is how a box gets missed.
 *
 * A key the role holds that the catalogue no longer lists is shown under its
 * raw name rather than dropped. Saving a role replaces its whole set, so a key
 * this screen could not draw is a key a save would silently remove.
 */
export function TeamPermissionChecklist({
  catalog,
  selected,
  mode,
  onChange,
}: {
  catalog: readonly PermissionCatalogGroup[];
  selected: ReadonlySet<string>;
  mode: "held" | "edit";
  onChange?: (next: Set<string>) => void;
}) {
  const t = useT();
  const known = React.useMemo(
    () => new Set(catalog.flatMap((group) => group.permissions.map((p) => p.key))),
    [catalog],
  );
  const stray = [...selected].filter((key) => !known.has(key));

  const toggle = (keys: string[], on: boolean) => {
    if (!onChange) return;
    const next = new Set(selected);
    for (const key of keys) {
      if (on) next.add(key);
      else next.delete(key);
    }
    onChange(next);
  };

  return (
    <View style={{ gap: theme.spacing[4] }}>
      {catalog.map((group) => {
        const keys = group.permissions.map((p) => p.key);
        const heldHere = keys.filter((key) => selected.has(key)).length;
        const rows =
          mode === "held"
            ? group.permissions.filter((p) => selected.has(p.key))
            : group.permissions;
        if (rows.length === 0) return null;
        const all = heldHere === keys.length;
        const title = permissionGroupLabel(group.group, t);

        return (
          <View key={group.group} style={{ gap: theme.spacing[1] }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
              <Text variant="overline" color="textMuted" style={{ flex: 1 }}>
                {title.toUpperCase()}
              </Text>
              {mode === "edit" ? (
                <Touchable
                  haptic="selection"
                  onPress={() => toggle(keys, !all)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    all
                      ? t("team.perms.a11yNone", { group: title })
                      : t("team.perms.a11yAll", { group: title })
                  }
                  style={{ paddingVertical: theme.spacing[1], paddingHorizontal: theme.spacing[2] }}
                >
                  <Text variant="caption" color="brand">
                    {all ? t("team.perms.none") : t("team.perms.all")}
                  </Text>
                </Touchable>
              ) : null}
            </View>

            {rows.map((permission) => {
              const on = selected.has(permission.key);
              const label = permissionLabel(permission, t);
              const note = permissionNote(permission);
              const line = (
                <View
                  style={{ flexDirection: "row", gap: theme.spacing[3], alignItems: "flex-start" }}
                >
                  <Ionicons
                    name={mode === "held" ? "checkmark" : on ? "checkbox" : "square-outline"}
                    size={mode === "held" ? 16 : 20}
                    color={on ? theme.color.brand : theme.color.textFaint}
                    style={{ marginTop: mode === "held" ? 2 : 0 }}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant={mode === "held" ? "footnote" : "callout"}>{label}</Text>
                    {note ? (
                      <Text variant="caption" color="textMuted">
                        {note}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );

              if (mode === "held") {
                return (
                  <View key={permission.key} style={{ paddingVertical: 3 }}>
                    {line}
                  </View>
                );
              }
              return (
                <Touchable
                  key={permission.key}
                  haptic="selection"
                  onPress={() => toggle([permission.key], !on)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={label}
                  style={{ paddingVertical: theme.spacing[2] }}
                >
                  {line}
                </Touchable>
              );
            })}
          </View>
        );
      })}

      {stray.length > 0 ? (
        <View style={{ gap: theme.spacing[1] }}>
          <Text variant="overline" color="textMuted">
            {t("team.perms.other")}
          </Text>
          {stray.map((key) => (
            <Touchable
              key={key}
              haptic={mode === "edit" ? "selection" : "none"}
              onPress={mode === "edit" ? () => toggle([key], false) : undefined}
              accessibilityRole={mode === "edit" ? "checkbox" : "text"}
              accessibilityState={mode === "edit" ? { checked: true } : undefined}
              accessibilityLabel={key}
              style={{
                flexDirection: "row",
                gap: theme.spacing[3],
                paddingVertical: theme.spacing[2],
              }}
            >
              <Ionicons
                name={mode === "edit" ? "checkbox" : "checkmark"}
                size={18}
                color={theme.color.textMuted}
              />
              <Text variant="footnote" color="textSecondary">
                {key}
              </Text>
            </Touchable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
