import * as React from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
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
  theme,
  useT,
} from "@gopasal/native-ui";
import { inboxText } from "../lib/inbox-text";
import { longAgo } from "../lib/waiting";
import { routeForNotification } from "../lib/notification-route";

/**
 * Everything GoPasal told this account, newest first.
 *
 * Notifications are per person, not per shop — the API has no shop column on
 * them — so a manager at two shops sees both here, and each row opens where it
 * belongs by the same routing a tapped push uses. Unread rows are marked the
 * moment they are opened; "Mark all read" is for the morning after.
 */
function iconFor(type?: string | null): keyof typeof Ionicons.glyphMap {
  const t = (type ?? "").toLowerCase();
  if (t.startsWith("order.")) return "receipt-outline";
  if (t.startsWith("delivery.")) return "bicycle-outline";
  if (t.startsWith("message.") || t.startsWith("conversation.")) return "chatbubble-outline";
  if (t.startsWith("review.")) return "star-outline";
  if (t.startsWith("invite.") || t.startsWith("team.")) return "people-outline";
  if (t.startsWith("payout.") || t.startsWith("settlement.")) return "cash-outline";
  if (t.startsWith("application.") || t.startsWith("onboarding.")) return "document-text-outline";
  return "notifications-outline";
}

function when(iso: string, t: ReturnType<typeof useT>): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return t("queue.justNow");
  if (minutes < 60) return t("queue.minutesAgo", { minutes });
  if (minutes < 60 * 24 * 7) return longAgo(minutes, t);
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
}

export default function Inbox() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = React.useState(false);
  useFocusEffect(
    React.useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const list = useNotifications({ poll: focused });
  const { markRead, markAllRead } = useNotificationActions();
  const rows = list.data ?? [];
  const unread = rows.filter((n) => !n.readAt).length;

  const open = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate(n.id);
    const to = routeForNotification({ ...(n.data ?? {}), type: n.type ?? "" });
    if (to) router.push(to as Href);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
      <View
        style={{
          paddingTop: insets.top + theme.spacing[2],
          paddingBottom: theme.spacing[3],
          paddingHorizontal: theme.spacing[4],
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
        }}
      >
        <Touchable
          haptic="light"
          onPress={() => router.back()}
          accessibilityLabel={t("common.back")}
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
          <Ionicons name="chevron-back" size={20} color={theme.color.text} />
        </Touchable>
        <Text variant="title3" style={{ flex: 1 }} numberOfLines={1}>
          {t("inbox.title")}
        </Text>
        {unread > 0 ? (
          <Button
            label={t("inbox.readAll")}
            variant="ghost"
            size="sm"
            full={false}
            loading={markAllRead.isPending}
            onPress={() => markAllRead.mutate()}
          />
        ) : null}
      </View>

      {list.isPending ? (
        <View style={{ paddingHorizontal: theme.spacing[4], gap: theme.spacing[3] }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width="100%" height={74} radius={theme.radii.lg} delay={i * 70} />
          ))}
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{
            paddingHorizontal: theme.spacing[4],
            paddingBottom: insets.bottom + theme.spacing[8],
            gap: theme.spacing[2],
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />
          }
          ListEmptyComponent={
            <View
              style={{ alignItems: "center", paddingTop: theme.spacing[16], gap: theme.spacing[2] }}
            >
              <Ionicons name="notifications-off-outline" size={30} color={theme.color.textFaint} />
              <Text variant="title3">{t("inbox.empty")}</Text>
              <Text variant="footnote" color="textMuted" align="center">
                {t("inbox.emptyDetail")}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const words = inboxText(item, t);
            return (
              <Card index={index} onPress={() => open(item)} padded={false}>
                <View
                  style={{ flexDirection: "row", gap: theme.spacing[3], padding: theme.spacing[4] }}
                >
                  <Ionicons
                    name={iconFor(item.type)}
                    size={19}
                    color={item.readAt ? theme.color.textFaint : theme.color.brand}
                    style={{ marginTop: 2 }}
                  />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <View
                      style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}
                    >
                      <Text
                        variant={item.readAt ? "callout" : "bodyStrong"}
                        style={{ flex: 1 }}
                        numberOfLines={2}
                      >
                        {words.title}
                      </Text>
                      {!item.readAt ? (
                        <View
                          accessibilityLabel={t("inbox.a11y.new")}
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: theme.color.brand,
                          }}
                        />
                      ) : null}
                    </View>
                    {words.body ? (
                      <Text variant="footnote" color="textSecondary" numberOfLines={3}>
                        {words.body}
                      </Text>
                    ) : null}
                    <Text variant="caption" color="textFaint">
                      {when(item.createdAt, t)}
                    </Text>
                  </View>
                </View>
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}
