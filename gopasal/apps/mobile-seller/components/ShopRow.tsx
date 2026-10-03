import * as React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text, Touchable, theme } from "@gopasal/native-ui";

/**
 * A settings row on the shop tab.
 *
 * Every row here is a *sentence*: what the thing is, what it is currently set
 * to, and a chevron promising that tapping opens something. The current value
 * is the part that earns the row — a "Minimum order" row that does not say रु
 * 200 makes the shopkeeper tap it to find out, which is one tap and one screen
 * to answer a question the counter asks a dozen times a day.
 *
 * `value` is a node rather than a string so money can go through `<Price>` and
 * keep the app's one spelling of it.
 */
export function ShopRow({
  icon,
  label,
  detail,
  value,
  onPress,
  accessibilityLabel,
  tone = "text",
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string | null;
  value?: React.ReactNode;
  onPress: () => void;
  /** Spoken instead of the label when the value carries the meaning. */
  accessibilityLabel?: string;
  tone?: "text" | "danger";
  disabled?: boolean;
}) {
  const danger = tone === "danger";
  return (
    <Touchable
      haptic="light"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[3],
        paddingVertical: theme.spacing[4],
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: theme.radii.md,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: danger ? theme.color.dangerSoft : theme.color.surfaceSunken,
        }}
      >
        <Ionicons
          name={icon}
          size={17}
          color={danger ? theme.color.danger : theme.color.textSecondary}
        />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="callout" color={danger ? "danger" : "text"} numberOfLines={1}>
          {label}
        </Text>
        {detail ? (
          <Text variant="caption" color="textMuted" numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>

      {value}
      <Ionicons name="chevron-forward" size={16} color={theme.color.textFaint} />
    </Touchable>
  );
}

/** The hairline between two rows inside one card. */
export function ShopRowDivider() {
  return <View style={{ height: 1, backgroundColor: theme.color.border }} />;
}
