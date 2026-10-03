import * as React from "react";
import { View } from "react-native";
import { SHOP_LIMITS } from "@gopasal/native-data/seller-settings";
import { Text, Touchable, theme, useT } from "@gopasal/native-ui";

/**
 * The delivery radius, set with steps rather than typed.
 *
 * `deliveryRadiusKm` is a real number and `@IsNumber()` runs without implicit
 * conversion, so `"3.5"` from a text box is a 400. Steps produce a number by
 * construction, stay inside 0.5–20 km by construction, and match how a
 * shopkeeper thinks about it — "a bit further", not "3.75". A value stored off
 * the half-kilometre grid (typed on the console) is shown exactly and snaps to
 * the grid on the first step, rather than being rounded the moment the screen
 * opens, which would count as an edit nobody made.
 */
const STEPS = [-1, -0.5, 0.5, 1] as const;

function step(value: number, by: number): number {
  const grid = by > 0 ? Math.floor(value * 2 + 1e-9) / 2 : Math.ceil(value * 2 - 1e-9) / 2;
  const next = grid + by;
  return Math.max(SHOP_LIMITS.radiusMinKm, Math.min(SHOP_LIMITS.radiusMaxKm, next));
}

export function SettingsRadius({
  value,
  onChange,
  was,
}: {
  value: number;
  onChange: (next: number) => void;
  /** The stored radius, so a change can be said as a change. */
  was: number;
}) {
  const t = useT();
  return (
    <View style={{ gap: theme.spacing[2] }}>
      <View
        accessible
        accessibilityLabel={t("settings.radius.a11y", { km: value })}
        style={{
          paddingVertical: theme.spacing[3],
          borderRadius: theme.radii.lg,
          backgroundColor: theme.color.surfaceSunken,
          alignItems: "center",
        }}
      >
        <Text variant="title2" tabular>
          {t("settings.radius.value", { km: value })}
        </Text>
        {value !== was ? (
          <Text variant="caption" color="textMuted">
            {t("settings.radius.was", { km: was })}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", gap: theme.spacing[2] }}>
        {STEPS.map((by) => {
          const next = step(value, by);
          const stuck = next === value;
          return (
            <Touchable
              key={by}
              haptic="light"
              disabled={stuck}
              onPress={() => onChange(next)}
              accessibilityRole="button"
              accessibilityLabel={
                by > 0
                  ? t("settings.radius.more", { km: by })
                  : t("settings.radius.less", { km: -by })
              }
              style={{
                flex: 1,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: theme.radii.md,
                backgroundColor: theme.color.surfaceSunken,
                opacity: stuck ? 0.4 : 1,
              }}
            >
              <Text variant="callout" color="textSecondary" tabular>
                {`${by > 0 ? "+" : "−"}${Math.abs(by)}`}
              </Text>
            </Touchable>
          );
        })}
      </View>
    </View>
  );
}
