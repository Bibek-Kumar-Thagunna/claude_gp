import * as React from "react";
import { RefreshControl, SectionList, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  useSelectedShop,
  useShopConversations,
  type ShopConversation,
} from "@gopasal/native-data/seller";
import { ConnectionBanner, Skeleton, Text, palette, theme, useT } from "@gopasal/native-ui";
import { ConversationRow } from "../../components/ConversationRow";

/**
 * The shop's inbox.
 *
 * A shopkeeper opens this between customers, for a second or two at a time, so
 * the screen is built around one question — *who is waiting on me?* — and
 * everything else is arranged not to get in the way of the answer.
 *
 *  - **Unread threads are lifted into their own group at the top**, under a
 *    heading, rather than merely marked where they happen to fall by recency.
 *    Sorting by time alone is correct for an archive and wrong for a queue: a
 *    question from an hour ago that nobody answered matters more than a thread
 *    that was closed out two minutes ago.
 *  - **Closed threads stay in the list**, dimmed. The server reopens a closed
 *    thread the moment either side writes again, so hiding them would mean the
 *    shop could be replied to in a conversation it believes is gone.
 *  - **Polling only while focused.** expo-router keeps the four sibling tabs
 *    mounted behind this one; a hook that polled unconditionally would have the
 *    queue, the shelf and the inbox all talking to the server at once on a
 *    phone that may be on 3G.
 */

type Section = {
  key: "unread" | "rest";
  title: string | null;
  data: ShopConversation[];
};

export default function MessagesTab() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { shopId, ready } = useSelectedShop();
  const [focused, setFocused] = React.useState(false);

  useFocusEffect(
    React.useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const conversations = useShopConversations(shopId, { poll: focused });
  const rows = React.useMemo(() => conversations.data?.data ?? [], [conversations.data]);

  const sections = React.useMemo<Section[]>(() => {
    // Sorted here rather than trusted from the wire: the split below reorders
    // the list anyway, and a group that was only *mostly* newest-first is the
    // kind of thing nobody notices until a customer says they were ignored.
    const byRecency = [...rows].sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
    );
    const unread = byRecency.filter((c) => c.hasUnread);
    const rest = byRecency.filter((c) => !c.hasUnread);

    // With nothing unread there is nothing to contrast against, so the headings
    // would be labelling a distinction that does not exist that morning.
    if (unread.length === 0) return rest.length ? [{ key: "rest", title: null, data: rest }] : [];
    return [
      { key: "unread", title: t("chat.waiting"), data: unread },
      ...(rest.length ? [{ key: "rest" as const, title: t("chat.earlier"), data: rest }] : []),
    ];
  }, [rows, t]);

  const unreadCount = rows.filter((c) => c.hasUnread).length;
  const loading = conversations.isLoading || (!ready && !conversations.data);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
          paddingTop: insets.top + theme.spacing[3],
          paddingBottom: theme.spacing[4],
          paddingHorizontal: theme.spacing[4],
        }}
      >
        <Text variant="title1" style={{ flex: 1 }}>
          {t("chat.title")}
        </Text>
        {unreadCount > 0 ? (
          <View
            accessible
            accessibilityLabel={t("chat.unreadCount", { count: unreadCount })}
            style={{
              minWidth: 26,
              height: 26,
              paddingHorizontal: theme.spacing[2],
              borderRadius: theme.radii.full,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.color.brand,
            }}
          >
            <Text variant="caption" style={{ color: theme.color.onBrand }} tabular>
              {unreadCount}
            </Text>
          </View>
        ) : null}
      </View>

      <SectionList<ShopConversation, Section>
        sections={sections}
        keyExtractor={(item) => item.id}
        // A heading that hovers over a tinted unread card muddies the one
        // distinction this screen exists to make.
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing[4],
          paddingBottom: theme.spacing[10],
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={conversations.isFetching && !conversations.isLoading}
            onRefresh={() => void conversations.refetch()}
            tintColor={theme.color.brand}
            colors={[palette.crimson[500]]}
          />
        }
        renderSectionHeader={({ section }) =>
          section.title ? (
            <Text
              variant="overline"
              color={section.key === "unread" ? "brand" : "textFaint"}
              style={{ marginTop: theme.spacing[2], marginBottom: theme.spacing[2] }}
            >
              {section.title}
            </Text>
          ) : null
        }
        renderItem={({ item, index }) => (
          <View style={{ marginBottom: theme.spacing[3] }}>
            <ConversationRow
              conversation={item}
              index={index}
              onPress={() => router.push({ pathname: "/chat/[id]", params: { id: item.id } })}
            />
          </View>
        )}
        ListEmptyComponent={loading ? <Loading /> : <Empty />}
      />
    </View>
  );
}

function Loading() {
  return (
    <View style={{ gap: theme.spacing[3] }}>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} width="100%" height={86} radius={theme.radii.lg} delay={i * 90} />
      ))}
    </View>
  );
}

function Empty() {
  const t = useT();
  return (
    <Animated.View
      entering={FadeIn.duration(280)}
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: theme.spacing[6],
      }}
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
      <Text variant="title3" align="center" style={{ marginTop: theme.spacing[4] }}>
        {t("chat.empty.title")}
      </Text>
      <Text
        variant="footnote"
        color="textMuted"
        align="center"
        style={{ marginTop: theme.spacing[2], maxWidth: 280 }}
      >
        {t("chat.empty.detail")}
      </Text>
    </Animated.View>
  );
}
