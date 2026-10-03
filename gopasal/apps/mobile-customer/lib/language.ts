import * as React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import type { Language } from "@gopasal/native-ui";

/**
 * Which language the app is in, and where that choice lives.
 *
 * Two rules:
 *
 *  - **The phone decides first.** A handset set to Nepali should open in
 *    Nepali without anybody finding a setting. `expo-localization` reports the
 *    device's languages in preference order, so the first Nepali entry wins.
 *  - **A choice, once made, outranks the phone.** Plenty of people run their
 *    phone in English and would rather shop in Nepali, or the reverse. The
 *    stored choice is therefore read before the locale and never overwritten
 *    by it.
 *
 * Stored in AsyncStorage rather than in the session: it is a property of this
 * install, not of an account, and it must survive signing out.
 */

const KEY = "gopasal.language";

export function deviceLanguage(): Language {
  try {
    for (const locale of getLocales()) {
      const code = (locale.languageCode ?? "").toLowerCase();
      if (code === "ne" || code === "np") return "np";
      if (code === "en") return "en";
    }
  } catch {
    /* an unusual platform; English is the safe default */
  }
  return "en";
}

export async function readStoredLanguage(): Promise<Language | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw === "en" || raw === "np" ? raw : null;
  } catch {
    return null;
  }
}

/**
 * The app's language, ready on the first frame.
 *
 * Starts from the device so nothing flashes in the wrong language, then swaps
 * in the stored choice once storage answers — which is a frame or two later
 * and only ever changes the value for someone who has made a choice.
 */
export function useLanguage(): {
  language: Language;
  setLanguage: (next: Language) => void;
} {
  const [language, setLanguageState] = React.useState<Language>(deviceLanguage);

  React.useEffect(() => {
    let cancelled = false;
    void readStoredLanguage().then((stored) => {
      if (!cancelled && stored) setLanguageState(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = React.useCallback((next: Language) => {
    setLanguageState(next);
    void AsyncStorage.setItem(KEY, next).catch(() => undefined);
  }, []);

  return { language, setLanguage };
}
