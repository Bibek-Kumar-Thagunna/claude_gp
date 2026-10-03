import { Stack } from "expo-router";
import { theme } from "@gopasal/native-ui";

/**
 * Riders and zones, as a plain stack.
 *
 * Headerless because every screen in it draws `SettingsHeader` itself: the zone
 * screen has to intercept Back to protect a half-walked boundary, and a native
 * header's back button is harder to hold than one the screen owns.
 */
export default function DeliveryLayout() {
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
