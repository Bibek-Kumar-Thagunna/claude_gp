import { Stack } from "expo-router";
import { theme } from "@gopasal/native-ui";

/**
 * Coupons: a list and one editor.
 *
 * The editor is pushed rather than shown as a sheet because writing a coupon is
 * the slowest, most careful thing a shopkeeper does in this app — six of its
 * numbers can never be changed afterwards — and a sheet invites a flick that
 * throws the half-written form away.
 */
export default function PromotionsLayout() {
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
