import Constants from "expo-constants";
import { Platform } from "react-native";
import { resolveApiOrigin } from "./api-origin";

/**
 * The same rule, wired to the real globals.
 *
 * Two lines of plumbing kept apart from the rule in `api-origin.ts`, so that
 * file imports nothing from Expo and can be run in a test. This one cannot be,
 * and has nothing in it worth testing.
 */

type Extra = { apiUrl?: unknown; appEnv?: string };

function extra(): Extra {
  return (Constants.expoConfig?.extra ?? {}) as Extra;
}

/** `local`, `staging` or `production` — whatever the build was made with. */
export function appEnv(): string {
  return extra().appEnv ?? "local";
}

let warned = false;

export function apiOrigin(): string {
  return resolveApiOrigin({
    apiUrl: extra().apiUrl,
    hostUri:
      Constants.expoConfig?.hostUri ??
      (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig
        ?.debuggerHost,
    platform: Platform.OS,
    onUnresolved: () => {
      if (warned) return;
      warned = true;
      console.warn(
        "[api] No apiUrl in the build and no Metro host to derive one from. " +
          "Falling back to localhost, which on a device is the device itself. " +
          "Set EXPO_PUBLIC_API_URL, or run this build from `expo start`.",
      );
    },
  });
}
