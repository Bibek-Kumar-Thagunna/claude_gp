import { Redirect } from "expo-router";

/**
 * `/chat` is the Messages tab now.
 *
 * Kept as a redirect rather than deleted because notification payloads and any
 * link already in the wild point here, and a dead route in a shipped app is a
 * blank screen the customer has no way out of.
 */
export default function ChatIndexRedirect() {
  return <Redirect href="/(tabs)/messages" />;
}
