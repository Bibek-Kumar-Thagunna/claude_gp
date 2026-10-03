import { Stack } from "expo-router";
import { theme } from "@gopasal/native-ui";

/**
 * The team, as a small stack: the roster, the invite form, the roles and their
 * editor.
 *
 * A stack rather than tabs because the four are not peers. The roster is where
 * everything starts and the other three are errands run from it — invite
 * somebody, check what a role allows, fix one — each of which ends by coming
 * back. Headerless like the rest of the app, so each screen draws its own back
 * arrow and the invite screen can hold it while a code is on screen.
 */
export default function TeamLayout() {
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
