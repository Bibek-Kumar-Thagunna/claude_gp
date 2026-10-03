import * as React from "react";
import { interpolate, translate, type Dictionary, type Language, type Vars } from "./translate";

export type { Dictionary, Language } from "./translate";

/**
 * Two languages, one dictionary, no framework.
 *
 * GoPasal is for Nepal and the app was English-only, which is not a small
 * omission: the customer who most needs a shop to deliver to them is the least
 * likely to read an English button. This is the smallest layer that fixes that
 * honestly.
 *
 * What it deliberately is not:
 *
 *  - **Not i18next.** The app needs a lookup, a plural rule and an
 *    interpolation. That is thirty lines, against a dependency with its own
 *    initialisation order, async backends and a bundle cost on a phone that may
 *    be on 3G.
 *  - **Not automatic.** A missing key falls back to English rather than
 *    rendering the key, because a customer seeing `cart.empty.title` is worse
 *    than a customer seeing English. In development the miss is logged once so
 *    it gets fixed.
 *
 * The dictionary is supplied by the app, not held here: this package draws
 * buttons and knows nothing about shopping. Its own handful of strings are
 * looked up with the same hook and the same English fallback, so a screen can
 * be translated without touching the design system.
 */

export type I18n = {
  language: Language;
  /** Translate, with `{name}` interpolation. */
  t: (key: string, vars?: Vars, fallback?: string) => string;
  setLanguage: (next: Language) => void;
  /** Both, for a language switch that names each in its own script. */
  languages: { code: Language; label: string; english: string }[];
};

export const LANGUAGES: I18n["languages"] = [
  { code: "en", label: "English", english: "English" },
  { code: "np", label: "नेपाली", english: "Nepali" },
];

const missing = new Set<string>();

const Ctx = React.createContext<I18n | null>(null);

export function I18nProvider({
  dictionary,
  language,
  onLanguageChange,
  children,
}: {
  dictionary: Dictionary;
  language: Language;
  onLanguageChange: (next: Language) => void;
  children: React.ReactNode;
}) {
  const value = React.useMemo<I18n>(
    () => ({
      language,
      languages: LANGUAGES,
      setLanguage: onLanguageChange,
      t: (key, vars, fallback) =>
        translate(dictionary, language, key, vars, fallback, (miss) => {
          // Once per key, not once per render — a missing string in a list
          // would otherwise fill the log and hide everything else.
          if (__DEV__ && !missing.has(miss)) {
            missing.add(miss);
            console.warn(`[i18n] no string for "${miss}"`);
          }
        }),
    }),
    [dictionary, language, onLanguageChange],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * The hook every screen uses.
 *
 * Outside a provider it still works and returns English, so a component can be
 * rendered in a test or a storybook without the whole app around it.
 */
export function useI18n(): I18n {
  const ctx = React.useContext(Ctx);
  return (
    ctx ?? {
      language: "en",
      languages: LANGUAGES,
      setLanguage: () => undefined,
      t: (key, vars, fallback) => interpolate(fallback ?? key, vars),
    }
  );
}

/** `const t = useT()` — the common case, where only the function is wanted. */
export function useT(): I18n["t"] {
  return useI18n().t;
}
