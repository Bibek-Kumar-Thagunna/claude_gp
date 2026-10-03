/**
 * Where a tapped notification should land.
 *
 * Pure, and in a file of its own, because it runs at the least forgiving
 * moment there is: the app is cold, the customer has just tapped a banner
 * about their order, and whatever this returns is the first thing they see. A
 * wrong answer here reads as "the app ignored me".
 *
 * The order of the checks is the point. An id is more specific than a type, so
 * a payload carrying both goes to the exact screen rather than to a list the
 * customer then has to search. A conversation outranks an order because a
 * message *about* an order still carries the order's id, and the customer who
 * tapped a message wants the message.
 *
 * Nothing here trusts the payload: it arrives from a push service, over the
 * air, and `data` is whatever was in the notification. Every field is checked
 * for being a string before it is used, and an unrecognised payload lands on
 * the notification list — a real screen that explains itself — rather than
 * nowhere.
 */
export function routeForNotification(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const type = typeof data.type === "string" ? data.type : "";
  const orderId = typeof data.orderId === "string" ? data.orderId : null;
  const conversationId = typeof data.conversationId === "string" ? data.conversationId : null;

  if (conversationId) return `/chat/${conversationId}`;
  if (orderId) return `/order/${orderId}`;
  if (type.startsWith("order.")) return "/(tabs)/orders";
  if (type.startsWith("message.") || type.startsWith("conversation.")) return "/(tabs)/messages";
  return "/notifications";
}
