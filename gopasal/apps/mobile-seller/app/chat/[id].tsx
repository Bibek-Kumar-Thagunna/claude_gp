import * as React from "react";
import {
  AppState,
  type AppStateStatus,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  useConversationActions,
  useSelectedShop,
  useShopConversation,
  useSendShopMessage,
  type ConversationMessage,
} from "@gopasal/native-data/seller";
import {
  Button,
  Confirm,
  ConnectionBanner,
  Skeleton,
  Sunken,
  Text,
  Touchable,
  fontFamily,
  haptic,
  palette,
  theme,
  useNetwork,
  useT,
} from "@gopasal/native-ui";
import { ChatBubble } from "../../components/ChatBubble";
import { ChatInitial } from "../../components/ConversationRow";

/**
 * One conversation, from behind the counter.
 *
 * The composer is the centre of gravity, and everything above it is arranged to
 * keep it reachable: the header is one row tall, the order chip is a single
 * line, and there is nothing that scrolls the input off the screen. A
 * shopkeeper is typing one-handed with a bag in the other, and the distance
 * between reading the question and answering it is the whole product.
 *
 * Four decisions worth stating, because each one could plausibly have gone the
 * other way:
 *
 *  - **A queued reply is queued, not failed.** Sending is the single seller
 *    write that goes through the durable outbox, because `MessagingService`
 *    deduplicates on `(conversationId, clientMessageId)` and a replay is
 *    provably a no-op. So a reply typed in a back room with no bars keeps its
 *    meaning while it waits, and the screen says "waiting to send" instead of
 *    offering a retry the shopkeeper does not need to tap.
 *  - **Read is marked once, and never while the app is in the background.** A
 *    thread left mounted under a lock screen would otherwise be marked read by
 *    the poll when a customer's message arrived, and the shopkeeper would never
 *    see it was unread. The mark waits for the app to be genuinely in front of
 *    somebody.
 *  - **The order chip opens the order, it does not summarise it.** Half an
 *    order rendered into a chat header is a second place for the total and the
 *    address to be wrong. One tap goes to the order screen and back.
 *  - **Closing is confirmed, and the confirmation admits it is reversible.**
 *    Closing a thread is not deleting it: the server reopens it when either
 *    side writes again, and a dialog that implied otherwise would be asking the
 *    shopkeeper to agree to something that is not true.
 */
export default function ShopChatScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const net = useNetwork();
  const params = useLocalSearchParams<{ id: string }>();
  const conversationId = String(params.id ?? "");

  const { shopId } = useSelectedShop();
  const [focused, setFocused] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [closing, setClosing] = React.useState(false);
  const listRef = React.useRef<FlatList<ConversationMessage>>(null);

  // Polling only while this screen is on top, for the same reason the inbox
  // does it: the tabs underneath stay mounted.
  useFocusEffect(
    React.useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const conversation = useShopConversation(shopId, conversationId, { poll: focused });
  const send = useSendShopMessage(shopId, conversationId);
  const { markRead, close } = useConversationActions(shopId);

  const thread = conversation.data;
  const messages = React.useMemo(() => thread?.messages ?? [], [thread?.messages]);
  const customerName = thread?.customer.name ?? t("order.customer");
  const order = thread?.order ?? null;
  const isClosed = thread?.status === "CLOSED";

  // `AppState` rather than the focus effect: a screen the router considers
  // focused is still focused behind a lock screen, and "the shopkeeper has seen
  // this" is a claim about a person, not about a navigator.
  const [active, setActive] = React.useState(() => AppState.currentState === "active");
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) =>
      setActive(state === "active"),
    );
    return () => sub.remove();
  }, []);

  // The newest message the *server* has, which is what the latch below is keyed
  // on. A pending bubble is excluded because it exists only in this cache and
  // would otherwise look like a new arrival to the effect.
  const lastServerMessageId = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message && message.pending !== true) return message.id;
    }
    return null;
  }, [messages]);

  const marked = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!shopId || !conversationId || !active) return;
    if (!thread?.hasUnread) return;
    const latch = `${conversationId}:${lastServerMessageId ?? ""}`;
    if (marked.current === latch) return;
    // Latched before the request rather than in its callback: the poll refetches
    // every five seconds and `hasUnread` stays true until the server answers,
    // which is long enough to fire the same PATCH several times.
    //
    // Keyed on the newest message rather than on the conversation alone,
    // because a customer who writes again while the shopkeeper is reading has
    // produced something genuinely unread — a latch on the id alone would leave
    // that message showing as unread in the inbox for a thread that is open on
    // the screen.
    marked.current = latch;
    markRead.mutate(conversationId);
    // `markRead` is a stable mutation object; listing it would re-run this on
    // every render of the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, conversationId, active, thread?.hasUnread, lastServerMessageId]);

  // The newest message is the one being answered, so the list opens at the
  // bottom and stays there as replies land — including the optimistic bubble a
  // send appends, which is what keeps the composer's own output in view.
  React.useEffect(() => {
    if (messages.length === 0) return;
    const frame = requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [messages.length]);

  const body = draft.trim();
  const canSend = body.length > 0 && !send.isPending;

  const onSend = () => {
    if (!canSend) return;
    setDraft("");
    haptic("light");
    send.mutate(body);
  };

  const onClose = () => {
    close.mutate(conversationId, {
      onSettled: () => setClosing(false),
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      <View
        style={{
          paddingTop: insets.top + theme.spacing[2],
          paddingBottom: theme.spacing[3],
          paddingHorizontal: theme.spacing[4],
          backgroundColor: theme.color.surface,
          borderBottomWidth: 1,
          borderBottomColor: theme.color.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
          <Touchable
            haptic="light"
            onPress={() => router.back()}
            accessibilityLabel={t("common.back")}
            style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="arrow-back" size={20} color={theme.color.text} />
          </Touchable>

          <ChatInitial name={customerName} size={36} />

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {customerName}
            </Text>
            {isClosed ? (
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {t("chat.closed")}
              </Text>
            ) : null}
          </View>

          {thread && !isClosed ? (
            <Touchable
              haptic="light"
              onPress={() => setClosing(true)}
              accessibilityLabel={t("chat.close")}
              style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="checkmark-done-outline" size={20} color={theme.color.textSecondary} />
            </Touchable>
          ) : null}
        </View>

        {order ? (
          <Touchable
            haptic="selection"
            onPress={() => router.push({ pathname: "/order/[id]", params: { id: order.id } })}
            accessibilityLabel={t("chat.openOrder.a11y", { code: order.code })}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.spacing[2],
              marginTop: theme.spacing[3],
              paddingVertical: theme.spacing[2],
              paddingHorizontal: theme.spacing[3],
              borderRadius: theme.radii.md,
              backgroundColor: theme.color.brandSoft,
              borderWidth: 1,
              borderColor: theme.color.brandBorder,
            }}
          >
            <Ionicons name="receipt-outline" size={15} color={theme.color.brand} />
            <Text variant="caption" color="brand" numberOfLines={1} style={{ flex: 1 }}>
              {t("chat.aboutOrder", { code: order.code })}
            </Text>
            <Ionicons name="chevron-forward" size={15} color={theme.color.brand} />
          </Touchable>
        ) : null}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {conversation.isLoading ? (
          <View style={{ padding: theme.spacing[4], gap: theme.spacing[3] }}>
            <Skeleton width="62%" height={40} radius={theme.radii.lg} />
            <Skeleton width="48%" height={40} radius={theme.radii.lg} delay={90} />
            <Skeleton width="70%" height={40} radius={theme.radii.lg} delay={160} />
          </View>
        ) : !thread && conversation.error ? (
          <Unreachable onRetry={() => void conversation.refetch()} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{
              padding: theme.spacing[4],
              flexGrow: 1,
              justifyContent: "flex-end",
            }}
            renderItem={({ item, index }) => (
              <ChatBubble message={item} index={index} offline={!net.isConnected} />
            )}
            // A thread the shop is looking at always has at least the message
            // that created it, so an empty list here means a brand-new thread
            // rather than a failure — it needs no illustration, only room.
            ListEmptyComponent={null}
          />
        )}

        <View
          style={{
            paddingHorizontal: theme.spacing[4],
            paddingTop: theme.spacing[3],
            paddingBottom: insets.bottom + theme.spacing[3],
            backgroundColor: theme.color.surface,
            borderTopWidth: 1,
            borderTopColor: theme.color.border,
          }}
        >
          {isClosed ? (
            <Sunken style={{ marginBottom: theme.spacing[3] }}>
              <Text variant="caption" color="textMuted">
                {t("chat.closed")}
              </Text>
            </Sunken>
          ) : null}

          {!net.isConnected ? (
            <Text variant="caption" color="textMuted" style={{ marginBottom: theme.spacing[2] }}>
              {t("chat.queuedNote")}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: theme.spacing[3] }}>
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
                placeholder={t("chat.placeholder")}
                placeholderTextColor={theme.color.textFaint}
                multiline
                // The server caps a message at 2000 characters, so the field
                // does too — a rejection after typing is a worse way to learn
                // that, and worse still when the typing was done offline.
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
              disabled={!canSend}
              accessibilityLabel={t("chat.send")}
              style={{
                width: 44,
                height: 44,
                borderRadius: theme.radii.full,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: canSend ? theme.color.brand : theme.color.surfaceSunken,
              }}
            >
              <Ionicons
                // The cloud says what the tap is about to do rather than what
                // the shopkeeper wishes it would do: with no signal this queues
                // the message, and the icon should not promise delivery.
                name={net.isConnected ? "send" : "cloud-upload-outline"}
                size={18}
                color={canSend ? palette.white : theme.color.textFaint}
              />
            </Touchable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Confirm
        visible={closing}
        title={t("chat.close.confirm")}
        message={t("chat.close.detail")}
        confirmLabel={t("chat.close")}
        cancelLabel={t("common.notNow")}
        busy={close.isPending}
        onConfirm={onClose}
        onCancel={() => setClosing(false)}
      />
    </View>
  );
}

function Unreachable({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: theme.spacing[6],
      }}
    >
      <Text variant="callout" color="textMuted" align="center">
        {t("common.somethingWrong")}
      </Text>
      <Button
        label={t("common.retry")}
        variant="secondary"
        full={false}
        onPress={onRetry}
        style={{ marginTop: theme.spacing[4] }}
      />
    </View>
  );
}
