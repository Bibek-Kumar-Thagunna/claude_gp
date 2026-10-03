import * as React from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useConversations, useGopasal, type Conversation } from "@gopasal/native-data";
import {
  Button,
  Card,
  CategoryArt,
  ConnectionBanner,
  Skeleton,
  Text,
  Thumb,
  Touchable,
  palette,
  theme,
  useT,
} from "@gopasal/native-ui";

/**
 * The shop inbox, as a tab.
 *
 * Conversations here are with shopkeepers, not with support — so the row shows
 * the shop, and an order-scoped thread says which order it is about. That
 * distinction matters: "where is my order" belongs to the shop that is packing
 * it, and burying it in a generic help queue is how a customer ends up phoning.
 */

function relative(iso: string | null | undefined, t: ReturnType<typeof useT>): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return t("chat.time.now");
  if (mins < 60) return t("chat.time.minutes", { count: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t("chat.time.hours", { count: hours });
  const days = Math.round(hours / 24);
  if (days < 7) return t("chat.time.days", { count: days });
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
}

function Row({ conversation, index }: { conversation: Conversation; index: number }) {
  const t = useT();
  const router = useRouter();
  const last = conversation.lastMessage;
  const unread = conversation.hasUnread;

  return (
    <Card
      index={index}
      padded={false}
      onPress={() => router.push({ pathname: "/chat/[id]", params: { id: conversation.id } })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
          padding: theme.spacing[4],
        }}
      >
        <Thumb
          uri={conversation.shop.logoImage}
          size={46}
          radius={theme.radii.md}
          fallback={<CategoryArt size={30} />}
          emoji={conversation.shop.emoji ?? "🏪"}
        />

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
            <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
              {conversation.shop.name}
            </Text>
            <Text variant="overline" color="textFaint">
              {relative(conversation.lastMessageAt ?? last?.createdAt, t)}
            </Text>
          </View>

          {conversation.order ? (
            <Text variant="overline" color="brand" numberOfLines={1} style={{ marginTop: 1 }}>
              {t("chat.orderTag", { code: conversation.order.code })}
            </Text>
          ) : null}

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.spacing[2],
              marginTop: 2,
            }}
          >
            <Text
              variant="footnote"
              color={unread ? "text" : "textMuted"}
              numberOfLines={1}
              style={{ flex: 1, fontWeight: unread ? "700" : "500" }}
            >
              {last
                ? last.sender === "CUSTOMER"
                  ? t("chat.lastFromYou", { body: last.body })
                  : last.body
                : t("chat.row.noMessages")}
            </Text>
            {unread && (
              <View
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 4.5,
                  backgroundColor: theme.color.brand,
                }}
              />
            )}
          </View>
        </View>
      </View>
    </Card>
  );
}

export default function MessagesTab() {
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

  const conversations = useConversations({ poll: focused });
  const rows = conversations.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      <View
        style={{
          paddingTop: insets.top + theme.spacing[3],
          paddingBottom: theme.spacing[4],
          paddingHorizontal: theme.spacing[4],
        }}
      >
        <Text variant="title1">{t("chat.inbox.title")}</Text>
        <Text variant="footnote" color="textMuted" style={{ marginTop: 2 }}>
          {t("chat.inbox.subtitle")}
        </Text>
      </View>

      {!user ? (
        <SignedOut onPress={() => router.push("/auth/phone")} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{
            paddingHorizontal: theme.spacing[4],
            paddingBottom: theme.spacing[10],
            gap: theme.spacing[3],
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={conversations.isFetching && !conversations.isLoading}
              onRefresh={conversations.refetch}
              tintColor={theme.color.brand}
              colors={[palette.crimson[500]]}
            />
          }
          renderItem={({ item, index }) => <Row conversation={item} index={index} />}
          ListEmptyComponent={
            conversations.isLoading ? (
              <View style={{ gap: theme.spacing[3] }}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} width="100%" height={78} radius={theme.radii.lg} delay={i * 90} />
                ))}
              </View>
            ) : (
              <Animated.View
                entering={FadeIn.duration(280)}
                style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing[6] }}
              >
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: theme.radii["2xl"],
                    backgroundColor: theme.color.surfaceSunken,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="chatbubbles-outline" size={28} color={theme.color.textFaint} />
                </View>
                <Text variant="title3" style={{ marginTop: theme.spacing[4] }}>
                  {t("chat.inbox.empty.title")}
                </Text>
                <Text
                  variant="footnote"
                  color="textMuted"
                  align="center"
                  style={{ marginTop: theme.spacing[2], maxWidth: 270 }}
                >
                  {t("chat.inbox.empty.detail")}
                </Text>
                <Button
                  label={t("home.browseShops")}
                  variant="secondary"
                  full={false}
                  onPress={() => router.push("/(tabs)/home")}
                  style={{ marginTop: theme.spacing[5] }}
                />
              </Animated.View>
            )
          }
        />
      )}
    </View>
  );
}

function SignedOut({ onPress }: { onPress: () => void }) {
  const t = useT();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing[6] }}>
      <Text variant="title3" align="center">
        {t("chat.signedOut.title")}
      </Text>
      <Text
        variant="footnote"
        color="textMuted"
        align="center"
        style={{ marginTop: theme.spacing[2], maxWidth: 260 }}
      >
        {t("chat.signedOut.detail")}
      </Text>
      <Button
        label={t("common.continue")}
        full={false}
        onPress={onPress}
        style={{ marginTop: theme.spacing[5] }}
      />
    </View>
  );
}
