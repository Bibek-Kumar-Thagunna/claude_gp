import * as React from "react";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Stack, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  BrandIntro,
  I18nProvider,
  NetworkProvider,
  palette,
  theme,
  useNetwork,
  useT,
} from "@gopasal/native-ui";
import { GopasalProvider } from "@gopasal/native-data";
import { Baloo2_600SemiBold, Baloo2_800ExtraBold, useFonts } from "@expo-google-fonts/baloo-2";
import { Inter_500Medium, Inter_700Bold } from "@expo-google-fonts/inter";
import { Hind_600SemiBold } from "@expo-google-fonts/hind";
import { pushSupported, routeForNotification, usePushRegistration } from "../lib/push";
import { useLanguage } from "../lib/language";
import { strings } from "../lib/strings";
import { apiOrigin } from "../lib/api-origin.expo";

/**
 * The root every screen mounts under.
 *
 * Order matters: gestures wrap safe-area wraps the providers screens read. A
 * sheet dragged from the bottom needs both the gesture root and the inset it has
 * to clear, and a screen rendering before the network provider exists would
 * throw on its first `useNetwork()`.
 *
 * ## The splash
 *
 * Auto-hide is turned off at module scope — before React runs — because the
 * default behaviour hides the splash as soon as the first frame paints, which is
 * a frame where the fonts have not loaded. The app then visibly re-renders from
 * the system font into Baloo and Inter, which is the single cheapest way to look
 * unfinished. Holding the splash until the faces are ready means the first thing
 * anyone sees is already the real typography.
 *
 * `fadeOut` rather than a cut: the native splash dissolves into the first screen
 * instead of being replaced between frames.
 */
void SplashScreen.preventAutoHideAsync();
void SplashScreen.setOptions({ duration: 320, fade: true });

export default function RootLayout() {
  const [fontsReady, fontError] = useFonts({
    Baloo2_800ExtraBold,
    Baloo2_600SemiBold,
    Inter_500Medium,
    Inter_700Bold,
    Hind_600SemiBold,
  });

  // A font that fails to load must not hold the app hostage: the fallback stack
  // is the platform UI font, which is perfectly readable. Better a slightly
  // off-brand render than a permanent splash screen.
  const ready = fontsReady || fontError != null;

  const onLayout = React.useCallback(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // The brand intro plays once per cold start, over the first screen.
  const [intro, setIntro] = React.useState(true);

  if (!ready) return null;

  return (
    <GestureHandlerRootView
      onLayout={onLayout}
      style={{ flex: 1, backgroundColor: theme.color.background }}
    >
      <SafeAreaProvider>
        {/* Language wraps everything, including the network banner: an
            offline message in the wrong language is the least useful message
            there is. */}
        <Localised>
          {/* `/shops` is public, cheap and always present — the right thing to ask
            when the question is "can this phone reach GoPasal at all". The
            seller's own routes all need a shop id, which the banner cannot
            assume it has. */}
          <NetworkProvider probeUrl={`${apiOrigin()}/api/v1/shops?limit=1`}>
            <DataLayer>
              <StatusBar style={intro ? "light" : "dark"} />
              <View style={{ flex: 1, backgroundColor: theme.color.background }}>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: theme.color.background },
                    animation: "slide_from_right",
                    // Matches the house curve closely enough that a push feels
                    // like the same product as a web route change.
                    animationDuration: 280,
                  }}
                />
                {intro ? <Intro onDone={() => setIntro(false)} /> : null}
              </View>
            </DataLayer>
          </NetworkProvider>
        </Localised>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * English or Nepali, chosen by the phone until the customer says otherwise.
 *
 * A component rather than inline state because the choice has to be readable
 * from anywhere — the account screen switches it — and because the stored
 * preference arrives a frame after the device locale does.
 */
function Localised({ children }: { children: React.ReactNode }) {
  const { language, setLanguage } = useLanguage();
  return (
    <I18nProvider dictionary={strings} language={language} onLanguageChange={setLanguage}>
      {children}
    </I18nProvider>
  );
}

/**
 * The data layer, given the network provider's own verdict on connectivity.
 *
 * It is a separate component rather than props on the line above because
 * `useNetwork` can only be called *inside* `NetworkProvider`. Passing the
 * getter rather than the boolean matters too: the transport reads it at the
 * moment it is about to send, so a request that began while the signal was
 * fading is stopped by the state at send time, not at render time.
 */
function DataLayer({ children }: { children: React.ReactNode }) {
  const net = useNetwork();
  const isConnected = React.useCallback(() => net.isConnected, [net.isConnected]);
  return (
    <GopasalProvider origin={apiOrigin()} isConnected={isConnected}>
      <Push />
      {children}
    </GopasalProvider>
  );
}

/**
 * Device push, mounted once, inside the provider it needs a session from.
 *
 * Renders nothing: it registers this phone while somebody is signed in and
 * unregisters on sign-out, and it turns a tapped notification into a route.
 * Both taps are handled — the one that arrives while the app is open, and the
 * one that launched it from cold, which `getLastNotificationResponseAsync`
 * reports and `addNotificationResponseReceivedListener` does not.
 */
function Push() {
  const router = useRouter();
  usePushRegistration();

  React.useEffect(() => {
    if (!pushSupported) return;
    let handled = false;
    const go = (response: Notifications.NotificationResponse | null) => {
      if (!response || handled) return;
      handled = true;
      const data = response.notification.request.content.data as Record<string, unknown>;
      const route = routeForNotification(data);
      // A short delay lets the router finish mounting the tab it is about to
      // push onto; without it a cold start can land on a screen with no back.
      if (route) setTimeout(() => router.push(route as never), 120);
    };

    void Notifications.getLastNotificationResponseAsync().then(go);
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      handled = false;
      go(response);
    });
    return () => sub.remove();
  }, [router]);

  return null;
}

/** The one-second brand intro, in the reader's language. */
function Intro({ onDone }: { onDone: () => void }) {
  const t = useT();
  return (
    <BrandIntro
      background="#241829"
      title="GoPasal"
      badge={t("intro.badge")}
      sill={palette.crimson[500]}
      tagline={t("intro.tagline")}
      onDone={onDone}
    />
  );
}
