import * as React from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  useConversation,
  useConversations,
  useGopasal,
  useMarkConversationRead,
  useSendMessage,
  useStartConversation,
  type ChatMessage,
} from "@gopasal/native-data";
import {
  CategoryArt,
  ConnectionBanner,
  Skeleton,
  Text,
  Thumb,
  Touchable,
  fontFamily,
  haptic,
  palette,
  theme,
  useNetwork,
  useT,
} from "@gopasal/native-ui";

/**
 * One conversation with a shop.
 *
 * Three things matter more here than anywhere else in the app:
 *
 *  - **A typed message must never be lost.** Every send goes through the outbox
 *    keyed on a `clientMessageId`, which the server treats as the message's
 *    identity — so a message written with no signal is delivered when there is
 *    one, exactly once, however many times the phone retries.
 *  - **The bubble must not lie.** Until the server has it, the bubble says it is
 *    still sending. A chat that shows a delivered tick on a message the shop
 *    never received is worse than one that admits it is trying.
 *  - **The shopkeeper is a person, not a support queue.** The header carries the
 *    shop's own name and picture, and the screen says plainly that a phone
 *    number is not shared — which is the actual question a customer has before
 *    they type.
 *
 * `id` is either a conversation id or the literal `new`, in which case the
 * first send creates the thread. The server upserts on (shop, customer,
 * context), so "new" to a shop already spoken to lands in the existing thread
 * rather than starting a second one.
 */

function Bubble({ message, index }: { message: ChatMessage; index: number }) {
  const t = useT();
  const mine = message.sender === "CUSTOMER";
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Animated.View
      entering={FadeInUp.delay(Math.min(index, 6) * 25).duration(220)}
      style={{
        alignSelf: mine ? "flex-end" : "flex-start",
        maxWidth: "82%",
        marginBottom: theme.spacing[2],
      }}
    >
      <View
        style={{
          paddingHorizontal: theme.spacing[4],
          paddingVertical: theme.spacing[3],
          borderRadius: theme.radii.lg,
          // The corner nearest the sender is squared off, which is what makes a
          // run of bubbles read as one side speaking.
          borderBottomRightRadius: mine ? 4 : theme.radii.lg,
          borderBottomLeftRadius: mine ? theme.radii.lg : 4,
          backgroundColor: mine ? theme.color.brand : theme.color.surface,
          borderWidth: mine ? 0 : 1,
          borderColor: theme.color.border,
          opacity: message.pending ? 0.75 : 1,
        }}
      >
        <Text
          variant="callout"
          style={{ color: mine ? palette.white : theme.color.text }}
        >
          {message.body}
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          marginTop: 3,
          alignSelf: mine ? "flex-end" : "flex-start",
        }}
      >
        <Text variant="overline" color="textFaint">
          {message.pending ? t("chat.sending") : time}
        </Text>
        {mine && !message.pending && (
          <Ionicons name="checkmark" size={11} color={theme.color.textFaint} />
        )}
        {message.pending && (
          <Ionicons name="time-outline" size={11} color={theme.color.textFaint} />
        )}
      </View>
    </Animated.View>
  );
}

export default function ChatScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const net = useNetwork();
  const { user } = useGopasal();
  const params = useLocalSearchParams<{
    id: string;
    shopId?: string;
    shopName?: string;
  }>();

  const [conversationId, setConversationId] = React.useState(
    params.id === "new" ? "" : String(params.id ?? ""),
  );
  const [draft, setDraft] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const listRef = React.useRef<FlatList<ChatMessage>>(null);

  // Polling only while this screen is on top. expo-router keeps the screens
  // underneath mounted, so a hook that polled unconditionally would keep three
  // screens talking to the server at once.
  useFocusEffect(
    React.useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // A "new" conversation with a shop already spoken to is that existing thread.
  // Finding it here means the customer sees their history straight away instead
  // of an empty screen that fills in after they send.
  const conversations = useConversations();
  React.useEffect(() => {
    if (conversationId || !params.shopId) return;
    const existing = (conversations.data ?? []).find(
      (c) => c.shop.id === params.shopId && c.kind === "SHOP",
    );
    if (existing) setConversationId(existing.id);
  }, [conversations.data, params.shopId, conversationId]);

  const conversation = useConversation(conversationId, { poll: focused });
  const send = useSendMessage(conversationId);
  const start = useStartConversation();
  const markRead = useMarkConversationRead();

  const messages = conversation.data?.messages ?? [];
  const shop = conversation.data?.shop;
  const shopName = shop?.name ?? params.shopName ?? t("chat.shopFallback");
  const sending = send.isPending || start.isPending;

  React.useEffect(() => {
    if (conversationId && conversation.data?.hasUnread) markRead.mutate(conversationId);
    // `markRead` is a stable mutation object; depending on it would re-run this
    // on every render of the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, conversation.data?.hasUnread]);

  React.useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length]);

  const onSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setDraft("");
    haptic("light");

    if (conversationId) {
      send.mutate(body);
      return;
    }
    if (!params.shopId) return;
    try {
      const created = await start.mutateAsync({ shopId: String(params.shopId), body });
      setConversationId(created.conversationId);
    } catch {
      // Starting a thread is the one send that cannot be queued — the outbox
      // needs a conversation to post into. Put the text back so it is not lost.
      setDraft(body);
    }
  };

  if (!user) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: theme.spacing[6],
          backgroundColor: theme.color.background,
        }}
      >
        <Text variant="title3">{t("chat.signIn.title")}</Text>
        <Touchable
          haptic="light"
          onPress={() => router.push("/auth/phone")}
          style={{ marginTop: theme.spacing[4] }}
        >
          <Text variant="callout" color="brand">
            {t("common.continue")}
          </Text>
        </Touchable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      {/* header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
          paddingTop: insets.top + theme.spacing[2],
          paddingBottom: theme.spacing[3],
          paddingHorizontal: theme.spacing[4],
          backgroundColor: theme.color.surface,
          borderBottomWidth: 1,
          borderBottomColor: theme.color.border,
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

        <Thumb
          uri={shop?.logoImage}
          size={36}
          radius={theme.radii.md}
          fallback={<CategoryArt size={24} />}
          emoji={shop?.emoji ?? "🏪"}
        />

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {shopName}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {conversation.data?.order
              ? t("chat.aboutOrder", { code: conversation.data.order.code })
              : t("chat.numberPrivate")}
          </Text>
        </View>

        {shop?.slug ? (
          <Touchable
            haptic="selection"
            onPress={() => router.push({ pathname: "/shop/[slug]", params: { slug: shop.slug } })}
            accessibilityLabel={t("chat.openShop.a11y", { shop: shopName })}
            style={{ padding: theme.spacing[2] }}
          >
            <Ionicons name="storefront-outline" size={19} color={theme.color.textSecondary} />
          </Touchable>
        ) : null}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {conversationId && conversation.isLoading ? (
          <View style={{ padding: theme.spacing[4], gap: theme.spacing[3] }}>
            <Skeleton width="56%" height={40} radius={theme.radii.lg} />
            <Skeleton width="68%" height={40} radius={theme.radii.lg} delay={90} />
            <Skeleton width="44%" height={40} radius={theme.radii.lg} delay={160} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{
              padding: theme.spacing[4],
              paddingBottom: theme.spacing[4],
              flexGrow: 1,
            }}
            renderItem={({ item, index }) => <Bubble message={item} index={index} />}
            ListEmptyComponent={
              <Animated.View
                entering={FadeIn.duration(280)}
                style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing[6] }}
              >
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: theme.radii["2xl"],
                    backgroundColor: theme.color.brandSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={26} color={theme.color.brand} />
                </View>
                <Text variant="title3" align="center" style={{ marginTop: theme.spacing[4] }}>
                  {t("chat.empty.title", { shop: shopName })}
                </Text>
                <Text
                  variant="footnote"
                  color="textMuted"
                  align="center"
                  style={{ marginTop: theme.spacing[2], maxWidth: 270 }}
                >
                  {t("chat.empty.detail")}
                </Text>
              </Animated.View>
            }
          />
        )}

        {/* composer */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: theme.spacing[3],
            paddingHorizontal: theme.spacing[4],
            paddingTop: theme.spacing[3],
            paddingBottom: insets.bottom + theme.spacing[3],
            backgroundColor: theme.color.surface,
            borderTopWidth: 1,
            borderTopColor: theme.color.border,
          }}
        >
          <View
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: 120,
              justifyContent: "center",
              paddingHorizontal: theme.spacing[4],
              borderRadius: theme.radii.lg,
              backgroundColor: theme.color.surfaceSunken,
              borderWidth: 1,
              borderColor: theme.color.border,
            }}
          >
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t("chat.composer.placeholder", { shop: shopName })}
              placeholderTextColor={theme.color.textFaint}
              multiline
              // The server caps a message at 2000 characters, so the field does
              // too — a rejection after typing is a worse way to learn that.
              maxLength={2000}
              style={{
                fontFamily: fontFamily.body,
                fontSize: 15,
                lineHeight: 21,
                color: theme.color.text,
                paddingVertical: theme.spacing[3],
              }}
              accessibilityLabel={t("chat.composer.a11y")}
            />
          </View>

          <Touchable
            haptic="none"
            onPress={onSend}
            disabled={draft.trim().length === 0 || sending}
            accessibilityLabel={t("chat.send.a11y")}
            style={{
              width: 44,
              height: 44,
              borderRadius: theme.radii.full,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor:
                draft.trim().length === 0 ? theme.color.surfaceSunken : theme.color.brand,
            }}
          >
            <Ionicons
              name={net.isConnected ? "send" : "cloud-upload-outline"}
              size={18}
              color={draft.trim().length === 0 ? theme.color.textFaint : palette.white}
            />
          </Touchable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
