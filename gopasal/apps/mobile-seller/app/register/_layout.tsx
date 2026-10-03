import { Stack } from "expo-router";
import { theme } from "@gopasal/native-ui";

/**
 * Registration is a stack, not a wizard.
 *
 * A wizard — next, next, next, with a progress bar — is the wrong shape for
 * this form. It is filled in over several sittings between customers, and the
 * order the questions happen to be written in is not the order a shopkeeper
 * has the answers in: the shop's name is known before the shutter opens, the
 * PAN certificate is in a drawer upstairs, the bank details are on a passbook
 * somebody else is holding.
 *
 * So the index screen is a **checklist that is also the map**: it says what is
 * left, and every item on it is a door. Each step is pushed, edits itself and
 * saves on its own, and popping back is never a loss because nothing waits for
 * a Continue button.
 */
export default function RegisterLayout() {
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
