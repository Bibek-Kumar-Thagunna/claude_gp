import * as React from "react";
import { View } from "react-native";
import type { ShopConversation } from "@gopasal/native-data/seller";
import { Card, Text, theme, useT } from "@gopasal/native-ui";
import { chatStamp, formatChatStamp } from "./chat-time";

/**
 * One customer, one thread, one row.
 *
 * Three things are carried here that a generic chat row would not bother with,
 * and each answers a question a shopkeeper actually has:
 *
 *  - **Unread is a change of surface, not a badge.** A dot in the corner is
 *    something you find; a tinted card is something you cannot miss while
 *    scanning past with a customer in front of you. The tint, the weight of the
 *    text and the dot all move together, so the row reads as unread from arm's
 *    length and from a glance.
 *  - **The order code sits above the message.** "Where is my order" means
 *    nothing without it, and a shopkeeper who has to open the thread to find
 *    out which bag is being asked about has already lost the time the inbox was
 *    meant to save.
 *  - **A closed thread is dimmed, never hidden.** The customer can reopen it by
 *    writing, so removing it from the list would mean a reply arriving into a
 *    thread the shop believes no longer exists.
 */
export function ConversationRow({
  conversation,
  index,
  onPress,
}: {
  conversation: ShopConversation;
  index: number;
  onPress: () => void;
}) {
  const t = useT();
  const unread = conversation.hasUnread;
  const closed = conversation.status === "CLOSED";
  const last = conversation.lastMessage;
  const name = conversation.customer.name ?? t("order.customer");
  const stamp = formatChatStamp(
    chatStamp(conversation.lastMessageAt ?? last?.createdAt, Date.now()),
    t,
  );

  const preview = last
    ? last.sender === "SHOP"
      ? t("chat.lastFromYou", { body: last.body })
      : last.body
    : t("chat.noMessages");

  return (
    <Card
      index={index}
      padded={false}
      onPress={onPress}
      style={{
        backgroundColor: unread ? theme.color.brandSoft : theme.color.surface,
        borderColor: unread ? theme.color.brandBorder : theme.color.border,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
          padding: theme.spacing[4],
          // The whole row fades when the thread is closed, rather than only the
          // text: the point is that the row is quiet, not that it is unreadable.
          opacity: closed && !unread ? 0.62 : 1,
        }}
      >
        <ChatInitial name={name} unread={unread} />

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
            <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
              {name}
            </Text>
            <Text variant="overline" color={unread ? "brand" : "textFaint"} tabular>
              {stamp}
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.spacing[2],
              marginTop: 2,
            }}
          >
            {conversation.order ? (
              <Text variant="overline" color="brand" numberOfLines={1}>
                {t("order.title", { code: conversation.order.code })}
              </Text>
            ) : null}
            {closed ? (
              <View
                style={{
                  paddingHorizontal: theme.spacing[2],
                  paddingVertical: 1,
                  borderRadius: theme.radii.full,
                  backgroundColor: theme.color.surfaceSunken,
                }}
              >
                <Text variant="overline" color="textMuted">
                  {t("chat.closedTag")}
                </Text>
              </View>
            ) : null}
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.spacing[2],
              marginTop: 3,
            }}
          >
            <Text
              variant="footnote"
              color={unread ? "text" : "textMuted"}
              numberOfLines={1}
              style={{ flex: 1, fontWeight: unread ? "700" : "500" }}
            >
              {preview}
            </Text>
            {unread ? (
              <View
                accessible
                accessibilityLabel={t("chat.unread")}
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 4.5,
                  backgroundColor: theme.color.brand,
                }}
              />
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

/**
 * A letter instead of a photograph.
 *
 * Most customers have no avatar, and a grid of identical grey silhouettes is
 * worse than no picture at all — it gives the eye nothing to sort by. A letter
 * in the customer's own colour of the moment does: the shopkeeper learns the
 * shape of "R for Ramesh, unread" long before they read the name.
 */
export function ChatInitial({
  name,
  unread = false,
  size = 46,
}: {
  name: string;
  unread?: boolean;
  size?: number;
}) {
  const letter = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: theme.radii.md,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: unread ? theme.color.brand : theme.color.surfaceSunken,
      }}
    >
      <Text
        variant={size >= 40 ? "title3" : "callout"}
        style={{ color: unread ? theme.color.onBrand : theme.color.textSecondary }}
      >
        {letter}
      </Text>
    </View>
  );
}
