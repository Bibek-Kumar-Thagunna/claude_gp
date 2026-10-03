import * as React from "react";
import { View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import type { ConversationMessage } from "@gopasal/native-data/seller";
import { Text, palette, theme, useT } from "@gopasal/native-ui";
import { messageClock } from "./chat-time";

/**
 * One message, on the shop's side of the conversation.
 *
 * This is the mirror of the customer app's bubble and is deliberately the same
 * object seen from the other chair: the same corner is squared off against the
 * sender, the same radius, the same stamp underneath. What flips is *whose*
 * bubble is crimson — here it is `SHOP`, because this phone is the shop.
 *
 * ## A queued message must look queued
 *
 * Sending is the one seller write that goes through the outbox, because the
 * server deduplicates on `(conversationId, clientMessageId)` and a replay is
 * therefore provably a no-op. The consequence for this component is precise: a
 * reply typed in a stockroom with no signal has *not* failed, and must not be
 * drawn as though it had. It is dimmed and stamped as waiting, with a clock
 * rather than a warning — the honest claim is "not yet", not "not at all".
 */
export function ChatBubble({
  message,
  index,
  offline,
}: {
  message: ConversationMessage;
  index: number;
  /** Whether the phone currently has a connection, which changes what "pending" means. */
  offline: boolean;
}) {
  const t = useT();

  if (message.sender === "SYSTEM") return <SystemNote body={message.body} />;

  const mine = message.sender === "SHOP";
  const pending = message.pending === true;

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
          opacity: pending ? 0.72 : 1,
        }}
      >
        <Text variant="callout" style={{ color: mine ? palette.white : theme.color.text }}>
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
          {pending
            ? offline
              ? t("chat.queued")
              : t("chat.sending")
            : messageClock(message.createdAt)}
        </Text>
        {pending ? (
          <Ionicons name="time-outline" size={11} color={theme.color.textFaint} />
        ) : mine ? (
          <Ionicons name="checkmark" size={11} color={theme.color.textFaint} />
        ) : null}
      </View>
    </Animated.View>
  );
}

/**
 * A line the platform wrote, not a person.
 *
 * Centred and unbubbled so it cannot be mistaken for either side of the
 * conversation — "the order was cancelled" is not something the shop said to
 * the customer, and a crimson bubble would claim it was.
 */
function SystemNote({ body }: { body: string }) {
  return (
    <View
      style={{
        alignSelf: "center",
        maxWidth: "88%",
        marginBottom: theme.spacing[2],
        paddingHorizontal: theme.spacing[3],
        paddingVertical: theme.spacing[2],
        borderRadius: theme.radii.full,
        backgroundColor: theme.color.surfaceSunken,
      }}
    >
      <Text variant="caption" color="textMuted" align="center">
        {body}
      </Text>
    </View>
  );
}
