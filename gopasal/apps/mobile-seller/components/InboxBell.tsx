import * as React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUnreadNotifications } from "@gopasal/native-data";
import { Text, Touchable, theme, useT } from "@gopasal/native-ui";

/**
 * The bell on the queue. Pushes are the loud channel; this is where they are
 * still there to read afterwards — an invite accepted, a payout, a review, a
 * delivery that failed while the phone was in a drawer.
 */
export function InboxBell({ focused }: { focused: boolean }) {
  const t = useT();
  const router = useRouter();
  const unread = useUnreadNotifications({ poll: focused }).data ?? 0;
  const label = unread > 0 ? t("inbox.a11y.unread", { count: unread }) : t("inbox.title");

  return (
    <Touchable
      haptic="light"
      onPress={() => router.push("/notifications")}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 40,
        height: 40,
        borderRadius: theme.radii.full,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.color.surface,
        borderWidth: 1,
        borderColor: theme.color.border,
      }}
    >
      <Ionicons name="notifications-outline" size={19} color={theme.color.text} />
      {unread > 0 ? (
        <View
          style={{
            position: "absolute",
            top: -3,
            right: -3,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: 9,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.color.brand,
          }}
        >
          <Text
            variant="overline"
            style={{ color: theme.color.onBrand, fontSize: 10, lineHeight: 12 }}
          >
            {unread > 99 ? "99+" : String(unread)}
          </Text>
        </View>
      ) : null}
    </Touchable>
  );
}
