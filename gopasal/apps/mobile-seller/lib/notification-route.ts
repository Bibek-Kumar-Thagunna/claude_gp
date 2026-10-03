/**
 * Where a tapped notification should land, in the seller app.
 *
 * Pure, and in a file of its own, because it runs at the least forgiving
 * moment there is: the phone buzzed on the counter, a shopkeeper tapped it,
 * and whatever this returns is the first thing they see. The whole reason
 * this app exists is that "a new order came in" must reach a person, so a
 * wrong answer here is not a routing bug — it is a cold samosa.
 *
 * An incoming order goes straight to that order, not to the queue: the
 * shopkeeper tapped *this* notification and the next thing they want is the
 * Accept button, not a list to find it in.
 *
 * Nothing here trusts the payload. It arrives from a push service, over the
 * air, and `data` is whatever was in the notification, so every field is
 * checked for being a string before it is used and an unrecognised shape
 * lands on the queue — a real screen that explains itself — rather than
 * nowhere.
 */
export function routeForNotification(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const type = typeof data.type === "string" ? data.type : "";
  const orderId = typeof data.orderId === "string" ? data.orderId : null;
  const conversationId = typeof data.conversationId === "string" ? data.conversationId : null;

  if (conversationId) return `/chat/${conversationId}`;
  if (orderId) return `/order/${orderId}`;
  if (type.startsWith("order.")) return "/(tabs)/queue";
  if (type.startsWith("message.") || type.startsWith("conversation.")) return "/(tabs)/messages";
  if (type.startsWith("review.")) return "/reviews";
  if (type.startsWith("invite.") || type.startsWith("team.") || type.startsWith("staff."))
    return "/team";
  // Approved means there is a shop now: the gate takes it from there.
  if (type === "application.approved") return "/";
  if (type.startsWith("application.") || type.startsWith("onboarding.")) return "/register";
  if (type.startsWith("payout.") || type.startsWith("settlement.")) return "/(tabs)/money";
  return "/(tabs)/queue";
}
