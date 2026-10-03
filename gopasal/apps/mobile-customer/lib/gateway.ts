import { Linking, Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";

/**
 * Paying at eSewa or Khalti, and coming back.
 *
 * The gateway leg is a web page, and a phone makes that awkward in a way a
 * desktop does not. The old code called `Linking.openURL`, which throws the
 * customer out into Chrome or Safari; they pay, land on an API callback page
 * that says nothing to them, and have to find GoPasal again in the app
 * switcher. Half of them will not, and the order sits PENDING while the money
 * has actually moved.
 *
 * So two things happen here:
 *
 *  - **The gateway opens inside the app** (SFSafariViewController on iOS, a
 *    Custom Tab on Android). It shares nothing with the app's storage and the
 *    customer can see the real URL and padlock, which is what makes it safe to
 *    type a wallet PIN into.
 *  - **The app watches the order rather than the browser.** eSewa and Khalti
 *    return to an https callback of ours, not to `gopasal://` — no amount of
 *    deep-link configuration changes that — so waiting for a redirect would
 *    wait forever. Instead the caller polls its own API for the payment status
 *    and, the moment the server says it is paid, closes the browser from this
 *    side. The customer sees the sheet drop away on its own.
 *
 * Everything degrades: if the in-app browser is unavailable the system browser
 * is used, and if the poll never turns green the order screen still shows
 * "payment not confirmed" with a way to finish it.
 */

export type GatewayOutcome = "paid" | "dismissed" | "failed";

/** How often to ask the server whether the money arrived, while the sheet is up. */
const POLL_MS = 2_500;
/** Long enough for a wallet login and an OTP, short enough not to poll forever. */
const MAX_WAIT_MS = 5 * 60_000;

export async function payAtGateway(input: {
  url: string;
  /** Resolves to true once the server says the order is paid. */
  isPaid: () => Promise<boolean>;
}): Promise<GatewayOutcome> {
  let paid = false;
  let stop = false;

  const watch = (async () => {
    const until = Date.now() + MAX_WAIT_MS;
    while (!stop && Date.now() < until) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (stop) break;
      try {
        if (await input.isPaid()) {
          paid = true;
          // Close the sheet from our side: the gateway will not do it for us.
          if (Platform.OS !== "web") WebBrowser.dismissBrowser();
          return;
        }
      } catch {
        // A failed poll is not a failed payment; keep watching.
      }
    }
  })();

  try {
    if (Platform.OS === "web") {
      await Linking.openURL(input.url);
    } else {
      await WebBrowser.openBrowserAsync(input.url, {
        // The brand, not a grey chrome bar — this is still GoPasal's checkout.
        toolbarColor: "#FFF8F5",
        controlsColor: "#E11945",
        dismissButtonStyle: "cancel",
        showTitle: true,
        enableBarCollapsing: true,
      });
    }
  } catch {
    stop = true;
    await watch;
    return paid ? "paid" : "failed";
  }

  // The browser has closed — either the customer dismissed it or the poll did.
  stop = true;
  await watch;

  if (paid) return "paid";
  // One last look: the payment may have landed in the moment between the last
  // poll and the sheet closing.
  try {
    if (await input.isPaid()) return "paid";
  } catch {
    /* the order screen will show the truth either way */
  }
  return "dismissed";
}
