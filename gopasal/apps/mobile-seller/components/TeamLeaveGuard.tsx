import * as React from "react";
import { useNavigation } from "expo-router";
import { Confirm, useT } from "@gopasal/native-ui";

/**
 * Hold a screen open while an invitation's secrets are in flight or on screen.
 *
 * `shareOnce` is the whole lifetime of an invitation's link and code — the
 * server keeps only hashes — so leaving this screen at the wrong moment destroys
 * a credential the owner was about to read out. Two moments are wrong:
 *
 *  - **while the request is in the air**, because the answer then arrives to a
 *    screen that no longer exists and nobody ever sees it;
 *  - **while the result is showing and has not been dismissed**, because a back
 *    swipe is a reflex and the code cannot be fetched again.
 *
 * Every way out is caught in one place — the header arrow, the hardware back
 * button and the swipe all go through `beforeRemove` — and the dialog says what
 * leaving actually costs: a resend, which re-rolls both secrets. It never
 * refuses outright. Somebody who genuinely wants to leave can.
 */
export function useTeamLeaveGuard({
  pending,
  showing,
}: {
  /** A create or resend has been sent and not answered. */
  pending: boolean;
  /** A link and code are on screen and have not been dismissed. */
  showing: boolean;
}): {
  guard: React.ReactNode;
  hold: boolean;
  /**
   * Let the next navigation through. Called by the screen's own Done button,
   * which is the deliberate way out — the listener is only removed on the next
   * render, and `router.back()` in the same tap would otherwise be caught.
   */
  release: () => void;
} {
  const t = useT();
  const navigation = useNavigation();
  const hold = pending || showing;

  const [asked, setAsked] = React.useState<null | (() => void)>(null);

  // A ref, not the state itself: the listener is registered once per `hold`
  // flip, and it must read whether the request has since answered.
  const pendingRef = React.useRef(pending);
  pendingRef.current = pending;

  const released = React.useRef(false);

  React.useEffect(() => {
    if (!hold) return;
    released.current = false;
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (released.current) return;
      event.preventDefault();
      const action = event.data.action;
      setAsked(() => () => {
        // Chosen, so let it through — the listener is still registered and
        // would otherwise catch the very navigation it just allowed.
        released.current = true;
        navigation.dispatch(action);
      });
    });
    return unsubscribe;
  }, [hold, navigation]);

  const guard = (
    <Confirm
      visible={asked !== null}
      title={pendingRef.current ? t("team.leave.pendingTitle") : t("team.leave.showingTitle")}
      message={pendingRef.current ? t("team.leave.pendingDetail") : t("team.leave.showingDetail")}
      confirmLabel={t("team.leave.go")}
      cancelLabel={t("team.leave.stay")}
      destructive
      onConfirm={() => {
        const leave = asked;
        setAsked(null);
        leave?.();
      }}
      onCancel={() => setAsked(null)}
    />
  );

  const release = React.useCallback(() => {
    released.current = true;
  }, []);

  return { guard, hold, release };
}
