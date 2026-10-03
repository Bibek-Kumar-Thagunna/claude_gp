import * as React from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useGopasal } from "@gopasal/native-data";

/**
 * Getting told about your order when the app is shut.
 *
 * The in-app notification list is the source of truth and is written by the
 * server whatever happens here; this is the nudge that makes a phone buzz when
 * the shop accepts, when a rider picks up, and when someone is at the door.
 * Everything in this file is therefore best-effort: a customer who refuses the
 * permission, or an emulator with no push support, must lose nothing except the
 * buzz.
 *
 * Four things worth stating, because each is a bug somebody ships once:
 *
 *  - **Register on every launch, not at install.** The OS rotates push tokens,
 *    and a reinstall or a restore from backup issues a new one. An app that
 *    registers once ends up talking to a token nobody holds.
 *  - **Ask at the right moment.** The prompt only goes up once the customer is
 *    signed in — that is, once they have an order to be told about. Asking on
 *    first launch is how an app gets "Don't allow" forever.
 *  - **Android needs a channel before the first notification**, or the system
 *    decides the importance for us and quiet is the default.
 *  - **Sign-out unregisters.** The next person to hold this phone must not get
 *    the last person's order updates.
 */

/** The channel the server names in every push it sends. */
const CHANNEL_ID = "orders";

/**
 * Web is not a push target here.
 *
 * The same code runs in the browser — that is how this app is reviewed — and
 * `expo-notifications` on web is a different thing entirely: a service worker
 * and a VAPID key pair GoPasal does not have. Calling into it throws
 * ("not available on web, are you sure you've linked all the native
 * dependencies"), which is exactly what happened the first time this shipped.
 * So every entry point below returns early, and the browser keeps the in-app
 * notification list, which is the part that works there.
 */
export const pushSupported = Platform.OS === "ios" || Platform.OS === "android";

if (pushSupported) {
  Notifications.setNotificationHandler({
    // An order update is worth showing even while the app is open: the
    // customer may be on the shop screen when the rider picks up.
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Order updates",
    description: "Accepted, on the way, delivered.",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 160, 80, 160],
    lightColor: "#E11945",
  });
}

/** The Expo project id, which `getExpoPushTokenAsync` needs in a build. */
function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return (
    extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId
  );
}

async function currentToken(): Promise<string | null> {
  if (!pushSupported) return null;
  // A simulator has no push service to register with, and asking throws.
  if (!Device.isDevice) return null;

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain) {
    granted = (await Notifications.requestPermissionsAsync()).granted;
  }
  if (!granted) return null;

  await ensureAndroidChannel();
  const id = projectId();
  const token = await Notifications.getExpoPushTokenAsync(id ? { projectId: id } : undefined);
  return token.data;
}

/**
 * Keep this device registered for as long as somebody is signed in.
 *
 * Mounted once, at the root. It re-runs when the signed-in user changes, which
 * covers both halves of a handover: the new user's token row moves to them, and
 * the old one is told to stop.
 */
export function usePushRegistration(): void {
  const { user, http, onSignOut } = useGopasal();
  const registered = React.useRef<string | null>(null);

  // Unregister while the session still exists. Waiting for `user` to go null
  // (below) is too late on an explicit sign-out: the DELETE has no session to
  // authenticate with, fails, and this phone keeps receiving the previous
  // person's pushes.
  React.useEffect(
    () =>
      onSignOut(async () => {
        const token = registered.current;
        registered.current = null;
        if (token) {
          await http
            .request(`/notifications/devices/${encodeURIComponent(token)}`, { method: "DELETE" })
            .catch(() => undefined);
        }
      }),
    [onSignOut, http],
  );

  React.useEffect(() => {
    if (!pushSupported) return;
    let cancelled = false;

    if (!user) {
      // Signed out: stop pushing to this phone. Fire-and-forget — if the
      // request fails the server still stops when the token goes dead.
      const token = registered.current;
      registered.current = null;
      if (token) {
        void http
          .request(`/notifications/devices/${encodeURIComponent(token)}`, { method: "DELETE" })
          .catch(() => undefined);
      }
      return;
    }

    void (async () => {
      try {
        const token = await currentToken();
        if (cancelled || !token) return;
        await http.request("/notifications/devices", {
          method: "POST",
          body: {
            token,
            platform: Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web",
            appVersion: Constants.expoConfig?.version,
          },
        });
        registered.current = token;
      } catch {
        // No push. The notification list still fills; nothing else is affected.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, http]);
}

/**
 * Where a tapped notification goes.
 *
 * The logic is in `notification-route.ts`, with nothing imported from Expo, so
 * that the one decision made while the app is cold and the customer is waiting
 * can be tested without a phone. Re-exported here because this is where
 * callers already look for it.
 */
export { routeForNotification } from "./notification-route";
