export type Language = "en" | "np";

/** `{ "cart.title": { en: "Your cart", np: "तपाईंको कार्ट" } }` */
export type Dictionary = Record<string, Partial<Record<Language, string>>>;

export type Vars = Record<string, string | number>;

/**
 * One lookup, with `{name}` substitution and an honest fallback chain.
 *
 * Pulled out of the provider so it can be exercised without React, because the
 * interesting behaviour is not the context plumbing — it is what happens when
 * a string is missing, which is the thing that ships.
 *
 * The chain is: the requested language, then English, then whatever the caller
 * passed as a fallback, then the key. A customer seeing English is a gap in
 * the translation; a customer seeing `cart.empty.title` is a bug in the app,
 * and the two should not look the same.
 *
 * `onMissing` is how the provider warns once per key in development. It fires
 * only when nothing in the dictionary matched — not when the Nepali is absent
 * and English answered, which is a deliberate state, not a mistake.
 */
export function translate(
  dictionary: Dictionary,
  language: Language,
  key: string,
  vars?: Vars,
  fallback?: string,
  onMissing?: (key: string) => void,
): string {
  const entry = dictionary[key];
  const text = entry?.[language] ?? entry?.en ?? fallback;
  if (text === undefined) {
    onMissing?.(key);
    return interpolate(fallback ?? key, vars);
  }
  return interpolate(text, vars);
}

/**
 * Replace `{name}` with `vars.name`.
 *
 * A placeholder with no matching variable is left exactly as written rather
 * than blanked. "Add रु {amount} more" with the amount missing is visibly
 * broken and gets reported; "Add रु  more" looks like prose and does not.
 */
export function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}
