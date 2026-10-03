import * as React from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  useGopasal,
  useNotificationActions,
  useNotifications,
  type AppNotification,
} from "@gopasal/native-data";
import {
  Button,
  Card,
  ConnectionBanner,
  Skeleton,
  Text,
  Touchable,
  palette,
  theme,
  useT,
} from "@gopasal/native-ui";

/**
 * Notifications.
 *
 * Every row that belongs to an order opens that order — a notification you
 * cannot act on is a notification that should not have been sent. Opening one
 * marks it read on the way, rather than making the customer tidy up after
 * reading.
 */

function iconFor(type?: string | null): keyof typeof Ionicons.glyphMap {
  const t = (type ?? "").toUpperCase();
  if (t.includes("ORDER")) return "receipt-outline";
  if (t.includes("DELIVER")) return "bicycle-outline";
  if (t.includes("MESSAGE")) return "chatbubble-outline";
  if (t.includes("COIN") || t.includes("REWARD") || t.includes("REFERR")) return "gift-outline";
  if (t.includes("REFUND") || t.includes("PAYMENT")) return "card-outline";
  return "notifications-outline";
}

function relative(iso: string, t: ReturnType<typeof useT>): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return t("notif.time.now");
  if (mins < 60) return t("notif.time.minutes", { count: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t("notif.time.hours", { count: hours });
  const days = Math.round(hours / 24);
  if (days < 7) return t("notif.time.days", { count: days });
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
}

export default function NotificationsScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useGopasal();
  const [focused, setFocused] = React.useState(false);

  useFocusEffect(
    React.useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const notifications = useNotifications({ poll: focused });
  const { markRead, markAllRead } = useNotificationActions();
  const rows = notifications.data ?? [];
  const unread = rows.filter((n) => !n.readAt).length;

  const open = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate(n.id);
    if (n.orderId) router.push({ pathname: "/order/[id]", params: { id: n.orderId } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
          paddingTop: insets.top + theme.spacing[2],
          paddingBottom: theme.spacing[3],
          paddingHorizontal: theme.spacing[4],
        }}
      >
        <Touchable
          haptic="light"
          onPress={() => router.back()}
          accessibilityLabel={t("common.back")}
          style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="arrow-back" size={20} color={theme.color.text} />
        </Touchable>
        <Text variant="title2" style={{ flex: 1 }}>
          {t("account.notifications")}
        </Text>
        {unread > 0 && (
          <Touchable
            haptic="light"
            onPress={() => markAllRead.mutate()}
            accessibilityLabel={t("notif.markAll.a11y")}
            style={{ padding: theme.spacing[2] }}
          >
            <Text variant="caption" color="brand">
              {t("notif.markAll")}
            </Text>
          </Touchable>
        )}
      </View>

      {!user ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing[6] }}>
          <Text variant="title3" align="center">
            {t("notif.signIn")}
          </Text>
          <Button
            label={t("common.continue")}
            full={false}
            onPress={() => router.push("/auth/phone")}
            style={{ marginTop: theme.spacing[5] }}
          />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{
            paddingHorizontal: theme.spacing[4],
            paddingBottom: theme.spacing[10],
            gap: theme.spacing[3],
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={notifications.isFetching && !notifications.isLoading}
              onRefresh={notifications.refetch}
              tintColor={theme.color.brand}
              colors={[palette.crimson[500]]}
            />
          }
          renderItem={({ item, index }) => (
            <Card
              index={index}
              padded={false}
              onPress={() => open(item)}
              style={item.readAt ? undefined : { borderColor: theme.color.brandBorder }}
            >
              <View
                style={{
                  flexDirection: "row",
                  gap: theme.spacing[3],
                  padding: theme.spacing[4],
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: theme.radii.md,
                    backgroundColor: item.readAt ? theme.color.surfaceSunken : theme.color.brandSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name={iconFor(item.type)}
                    size={17}
                    color={item.readAt ? theme.color.textMuted : theme.color.brand}
                  />
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
                    <Text
                      variant="callout"
                      numberOfLines={1}
                      style={{ flex: 1, fontWeight: item.readAt ? "500" : "700" }}
                    >
                      {item.title}
                    </Text>
                    <Text variant="overline" color="textFaint">
                      {relative(item.createdAt, t)}
                    </Text>
                  </View>
                  {item.body ? (
                    <Text variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
                      {item.body}
                    </Text>
                  ) : null}
                </View>

                {!item.readAt && (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: theme.color.brand,
                      marginTop: 6,
                    }}
                  />
                )}
              </View>
            </Card>
          )}
          ListEmptyComponent={
            notifications.isLoading ? (
              <View style={{ gap: theme.spacing[3] }}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} width="100%" height={76} radius={theme.radii.lg} delay={i * 80} />
                ))}
              </View>
            ) : (
              <Animated.View
                entering={FadeIn.duration(260)}
                style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing[6] }}
              >
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: theme.radii["2xl"],
                    backgroundColor: theme.color.surfaceSunken,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="notifications-outline" size={26} color={theme.color.textFaint} />
                </View>
                <Text variant="title3" style={{ marginTop: theme.spacing[4] }}>
                  {t("notif.empty.title")}
                </Text>
                <Text
                  variant="footnote"
                  color="textMuted"
                  align="center"
                  style={{ marginTop: theme.spacing[2], maxWidth: 260 }}
                >
                  {t("notif.empty.detail")}
                </Text>
              </Animated.View>
            )
          }
        />
      )}
    </View>
  );
}
