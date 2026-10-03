import * as React from "react";
import { View } from "react-native";
import { Text, theme, useT } from "@gopasal/native-ui";

/**
 * One figure in the row of three under the period switcher.
 *
 * `change` is `null` far more often than it is zero — the API returns null when
 * the previous window gives no basis for a comparison — and the difference
 * matters: "no change" and "nothing to compare with" are different facts and a
 * `0%` in place of the second is an invented one. Null renders nothing at all.
 */
export function MoneyStat({
  label,
  value,
  change,
  a11yValue,
}: {
  label: string;
  /** Already formatted — a `Price`, a count, or an em dash for "not applicable". */
  value: React.ReactNode;
  /** Percent against the window before this one, or null for no basis. */
  change?: number | null;
  /** What a screen reader hears in place of the rendered value. */
  a11yValue?: string;
}) {
  const t = useT();
  const moved = change != null && Math.round(change) !== 0;
  const up = (change ?? 0) > 0;

  return (
    <View
      accessible
      accessibilityLabel={a11yValue ? `${label}, ${a11yValue}` : undefined}
      style={{ flex: 1, minWidth: 0, gap: 2 }}
    >
      <Text variant="caption" color="textMuted" numberOfLines={1}>
        {label}
      </Text>
      {value}
      {moved ? (
        <Text variant="caption" color={up ? "success" : "danger"} tabular>
          {up
            ? t("money.up", { percent: Math.abs(Math.round(change ?? 0)) })
            : t("money.down", { percent: Math.abs(Math.round(change ?? 0)) })}
        </Text>
      ) : null}
    </View>
  );
}
