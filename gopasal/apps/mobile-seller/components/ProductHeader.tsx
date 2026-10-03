import { View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Text, Touchable, theme, useT } from "@gopasal/native-ui";

/**
 * The top of both product screens: a way back and what this is.
 *
 * Back falls through to the shelf when there is nothing to go back to, because
 * a product screen is reachable from a notification or a deep link, and a back
 * button that does nothing on a cold start is a screen with no exit.
 */
export function ProductHeader({ title, subtitle }: { title: string; subtitle?: string | null }) {
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
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/shelf"))}
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
        style={{
          width: 40,
          height: 40,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: theme.radii.full,
          backgroundColor: theme.color.surface,
          borderWidth: 1,
          borderColor: theme.color.border,
        }}
      >
        <Ionicons name="arrow-back" size={19} color={theme.color.text} />
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
    </View>
  );
}
