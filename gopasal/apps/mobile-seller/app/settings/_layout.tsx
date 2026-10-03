import { Stack } from "expo-router";
import { theme } from "@gopasal/native-ui";

/**
 * The shop profile and its location capture, as a plain stack.
 *
 * Headerless for the same reason as the delivery stack: the profile form asks
 * before discarding unsaved edits, so the screen owns its back button.
 */
export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.color.background },
        animation: "slide_from_right",
        animationDuration: 280,
      }}
    />
  );
}
