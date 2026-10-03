import * as React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Sunken, Text, theme } from "@gopasal/native-ui";

type Tone = "info" | "warning" | "danger" | "success" | "quiet";

const TONES: Record<
  Tone,
  { background: string; icon: string; text: string; glyph: keyof typeof Ionicons.glyphMap }
> = {
  info: {
    background: theme.color.infoSoft,
    icon: theme.color.info,
    text: theme.color.textSecondary,
    glyph: "information-circle-outline",
  },
  warning: {
    background: theme.color.warningSoft,
    icon: theme.palette.marigold[600],
    text: theme.color.textSecondary,
    glyph: "alert-circle-outline",
  },
  danger: {
    background: theme.color.dangerSoft,
    icon: theme.color.danger,
    text: theme.color.danger,
    glyph: "alert-circle",
  },
  success: {
    background: theme.color.successSoft,
    icon: theme.color.success,
    text: theme.color.textSecondary,
    glyph: "checkmark-circle",
  },
  quiet: {
    background: theme.color.surfaceSunken,
    icon: theme.color.textMuted,
    text: theme.color.textSecondary,
    glyph: "lock-closed-outline",
  },
};

/**
 * A sentence the screen needs the shopkeeper to read, in a tinted strip.
 *
 * These screens carry a lot of "this is not yours to change" and "this cannot
 * be undone", and those sentences are the product rather than decoration — so
 * they get one consistent shape instead of each screen inventing a grey caption
 * that is easy to scroll past. The tone is the part read before the words: red
 * for something that went wrong, amber for a consequence, grey-with-a-lock for
 * something decided elsewhere.
 */
export function SettingsNotice({
  tone = "info",
  icon,
  title,
  children,
}: {
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
  title?: string;
  children?: React.ReactNode;
}) {
  const spec = TONES[tone];
  return (
    <Sunken
      style={{
        flexDirection: "row",
        gap: theme.spacing[3],
        backgroundColor: spec.background,
      }}
    >
      <Ionicons name={icon ?? spec.glyph} size={16} color={spec.icon} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        {title ? <Text variant="callout">{title}</Text> : null}
        {typeof children === "string" ? (
          <Text variant="caption" style={{ color: spec.text }}>
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    </Sunken>
  );
}
