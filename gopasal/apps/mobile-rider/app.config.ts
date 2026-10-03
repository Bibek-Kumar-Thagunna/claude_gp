import type { ExpoConfig } from "expo/config";

/**
 * The rider app's configuration, as a function of which build this is.
 *
 * This replaced a static `app.json` whose `extra.apiUrl` was
 * `http://localhost:4000`. On a handset that address is the handset, so every
 * build that was not the web export pointed the app at itself — the kind of
 * value that is invisible until the first time somebody installs the thing.
 *
 * Three environments, and they are allowed to coexist on one phone. The staging
 * build gets its own bundle identifier and its own name, because a tester who
 * has to uninstall production to try a release candidate will not try it, and a
 * bug report from someone who cannot say which build they were on is worth very
 * little.
 *
 * Nothing secret lives here. `app.config.ts` is compiled into the binary and
 * can be read out of it, so this holds only the API origin and the Expo project
 * id — the same things the app would reveal in its first network request.
 */

type Env = "local" | "staging" | "production";

/**
 * Expo honours several keys the published `ExpoConfig` type has not caught up
 * with — the new architecture switch, and Android's edge-to-edge and
 * predictive-back flags, all of which were in the `app.json` this replaced.
 * Deleting working configuration to satisfy a stale type would be the wrong way
 * round, so the type is widened here, once, where it can be seen.
 */
type Config = ExpoConfig & {
  newArchEnabled?: boolean;
  android?: ExpoConfig["android"] & {
    edgeToEdgeEnabled?: boolean;
    predictiveBackGestureEnabled?: boolean;
  };
};

const APP_ENV = ((process.env.APP_ENV ?? "local") as Env);

if (!["local", "staging", "production"].includes(APP_ENV)) {
  throw new Error(
    `APP_ENV="${APP_ENV}" is not one of local, staging, production. ` +
      "Fix the build profile in eas.json rather than guessing a default here: " +
      "a build that silently falls back to the wrong API is worse than one that fails.",
  );
}

/**
 * Where the API lives, per environment.
 *
 * `local` is deliberately `null`. A development build runs on a real phone over
 * the same wifi as the laptop, so the right address is the laptop's LAN IP —
 * which nobody should have to type. The app derives it at runtime from the
 * Metro host Expo already knows (`lib/api-origin.ts`); this file has no way to
 * know it at build time and does not pretend to.
 */
const API_URL: Record<Env, string | null> = {
  local: null,
  staging: process.env.EXPO_PUBLIC_API_URL ?? "https://staging-api.gopasal.com",
  production: process.env.EXPO_PUBLIC_API_URL ?? "https://api.gopasal.com",
};

/**
 * The Expo project this app pushes from.
 *
 * TODO: run `eas init` in this folder once, which writes the id into
 * `extra.eas.projectId` — or set `EXPO_PUBLIC_EAS_PROJECT_ID` in the build
 * profile. Until then `getExpoPushTokenAsync` has no project to issue a token
 * against, so push registration returns null and the app carries on without it
 * rather than failing to start.
 */
const EAS_PROJECT_ID = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? undefined;

const NAME: Record<Env, string> = {
  local: "Rider (dev)",
  staging: "Rider (staging)",
  production: "GoPasal Rider",
};

/** Suffixed so the three builds install side by side rather than replacing each other. */
const BUNDLE_SUFFIX: Record<Env, string> = {
  local: ".dev",
  staging: ".staging",
  production: "",
};

const bundleId = `com.velayon.gopasal.rider${BUNDLE_SUFFIX[APP_ENV]}`;

const config: Config = {
  name: NAME[APP_ENV],
  slug: "gopasal-rider",
  // Its own scheme: "gopasal" is the customer app's, "gopasal-seller" the
  // shop's, and two apps claiming one scheme make Android ask on every link.
  scheme: "gopasal-rider",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  backgroundColor: "#FFF8F5",
  primaryColor: "#E11945",
  newArchEnabled: true,
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: false,
    bundleIdentifier: bundleId,
    infoPlist: {
      CFBundleDisplayName: NAME[APP_ENV],
      NSLocationWhenInUseUsageDescription:
        "GoPasal shares your location with the shop and the customer while you are carrying their order.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "GoPasal keeps sharing your location during a delivery when the screen is off, so the customer can see you coming. It stops when you go offline.",
      UIBackgroundModes: ["location", "remote-notification"],
    },
  },
  android: {
    package: bundleId,
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: true,
    adaptiveIcon: {
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      backgroundColor: "#F6A609",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    // Background location is declared because deliveries continue with the
    // screen off. It is asked for only after the in-app explanation
    // (app/location-consent.tsx), which Google Play requires, and it runs as
    // a visible foreground service with a notification while a job is live.
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
      "VIBRATE",
      "CALL_PHONE",
      "CAMERA",
    ],
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-image-picker",
      {
        cameraPermission: "GoPasal uses your camera to photograph the parcel at the door, as proof of delivery.",
        photosPermission: "GoPasal opens your photos so you can attach a proof-of-delivery picture.",
        microphonePermission: false,
      },
    ],
    "expo-secure-store",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "GoPasal shares your location with the shop and the customer while you are carrying their order.",
        locationAlwaysAndWhenInUsePermission:
          "GoPasal keeps sharing your location during a delivery when the screen is off, so the customer can see you coming. It stops when you go offline.",
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    [
      "expo-splash-screen",
      {
        // Full-bleed brand colour with the bare mark: the same frame the
        // in-app intro (BrandIntro) starts from, so the hand-off is seamless.
        image: "./assets/splash-icon.png",
        imageWidth: 104,
        resizeMode: "contain",
        backgroundColor: "#F6A609",
      },
    ],
    ["expo-font", { fonts: [] }],
    ["expo-notifications", { color: "#E11945" }],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    appEnv: APP_ENV,
    // Spread rather than set to null: Expo serialises a null `extra` value as
    // `{}`, which is truthy, so a development build would have read an empty
    // object as a perfectly good API origin and thrown on the first request.
    ...(API_URL[APP_ENV] ? { apiUrl: API_URL[APP_ENV] } : {}),
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
};

export default config;
