/**
 * Where a tapped notification should land, in the rider app.
 *
 * A job notification opens that job — the rider tapped it because something
 * about *that* delivery changed, and the next thing they want is its address
 * and its button. Anything else lands on the jobs list. Nothing in the payload
 * is trusted: every field is checked for being a string before it is used.
 */
export function routeForNotification(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const orderId = typeof data.orderId === "string" ? data.orderId : null;
  if (orderId) return `/job/${orderId}`;
  return "/(tabs)/jobs";
}
