import * as React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Text, Touchable, theme, useT } from "@gopasal/native-ui";

/**
 * The top of every pushed shop-management screen — settings, the location
 * capture, and the delivery screens that sit beside them.
 *
 * One component rather than a copy per screen because these screens are reached
 * from each other (settings links the pin, the zone screen reads the radius the
 * settings screen sets), and a back arrow that moves by a few pixels between them
 * reads as a different app.
 *
 * `onBack` exists for the two screens that hold work the shopkeeper walked for —
 * a half-drawn zone, an unsaved form — and must ask before throwing it away.
 */
export function SettingsHeader({
  title,
  subtitle,
  onBack,
  trailing,
}: {
  title: string;
  subtitle?: string | null;
  onBack?: () => void;
  trailing?: React.ReactNode;
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
        }}
      >
        <Ionicons name="arrow-back" size={20} color={theme.color.text} />
      </Touchable>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="title3" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {trailing}
    </View>
  );
}
