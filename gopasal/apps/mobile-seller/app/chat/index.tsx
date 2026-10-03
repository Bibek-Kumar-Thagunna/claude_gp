import { Redirect } from "expo-router";

/**
 * `/chat` with no conversation is not a screen.
 *
 * It exists because a push notification, a deep link or a stale back stack can
 * all produce a bare `/chat`, and expo-router would otherwise render an
 * "unmatched route" page at a shopkeeper who did nothing wrong. The inbox is
 * the honest answer to "which conversation?".
 */
export default function ChatIndex() {
  return <Redirect href="/(tabs)/messages" />;
}
