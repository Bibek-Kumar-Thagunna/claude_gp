import type {
  Coupon,
  CouponIssue,
  CouponState,
  CouponType,
} from "@gopasal/native-data/seller-promotions";
import type { useT } from "@gopasal/native-ui";

/**
 * The words the coupon screens share: what a coupon does, what state it is in,
 * and what is wrong with one being written.
 *
 * The data layer's rules answer in English sentences, which is right for a
 * package with no dictionary and wrong for a Nepali screen. They are matched
 * here to keys, sentence by sentence, so they can be translated — and each is
 * reworded in this app's voice on the way (an "order", not a "basket"; रु, not
 * "Rs"). A sentence this file has not seen still reaches the screen in the
 * package's own words, because a rule that fires and says nothing is worse
 * than one that says it in English.
 */

type T = ReturnType<typeof useT>;
type Vars = Record<string, string | number>;

/** The permission keys the coupon routes check. The data layer names them in prose only. */
export const PROMO_PERMISSIONS = {
  view: "promotions.view",
  manage: "promotions.manage",
} as const;

/** रु and Western digits, grouped the way a price tag in Nepal is. */
export function rupees(amount: number): string {
  return `रु ${Math.round(amount).toLocaleString("en-IN")}`;
}

/** "10% off, up to रु 200" or "रु 50 off" — the one-line answer to "what does it do?" */
export function describeCoupon(
  coupon: { type: CouponType; value: number; maxDiscount: number | null },
  t: T,
): string {
  if (coupon.type === "PERCENT") {
    return coupon.maxDiscount != null
      ? t(
          "promo.describe.percentCapped",
          { value: coupon.value, cap: rupees(coupon.maxDiscount) },
          "{value}% off, up to {cap}",
        )
      : t("promo.describe.percent", { value: coupon.value }, "{value}% off");
  }
  return t("promo.describe.flat", { amount: rupees(coupon.value) }, "{amount} off");
}

export function stateLabel(state: CouponState, coupon: Pick<Coupon, "validFrom">, t: T): string {
  switch (state) {
    case "RUNNING":
      return t("promo.state.running", undefined, "Working now");
    case "OFF":
      return t("promo.state.off", undefined, "Turned off");
    case "SCHEDULED":
      return t("promo.state.scheduled", { date: dateLabel(coupon.validFrom) }, "Starts {date}");
    case "EXPIRED":
      return t("promo.state.expired", undefined, "Ended");
    case "USED_UP":
      return t("promo.state.usedUp", undefined, "Used up");
  }
}

export function stateTone(state: CouponState): "success" | "muted" | "warning" | "brand" {
  switch (state) {
    case "RUNNING":
      return "success";
    case "SCHEDULED":
      return "brand";
    case "USED_UP":
      return "warning";
    default:
      return "muted";
  }
}

export function dateLabel(iso: string): string {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return "";
  const sameYear = at.getFullYear() === new Date().getFullYear();
  return at.toLocaleDateString(
    [],
    sameYear
      ? { day: "numeric", month: "short" }
      : { day: "numeric", month: "short", year: "numeric" },
  );
}

/**
 * One rule's sentence, keyed.
 *
 * Matched on the package's exact wording — the only stable handle it gives —
 * with the numbers pulled back out where a sentence carries one.
 */
const ISSUES: {
  match: string | RegExp;
  key: string;
  en: string;
  vars?: (m: RegExpMatchArray) => Vars;
}[] = [
  {
    match: /^A code needs at least (\d+) characters\.$/,
    key: "promo.issue.codeShort",
    en: "A code needs at least {min} letters or numbers.",
    vars: (m) => ({ min: m[1] ?? "" }),
  },
  {
    match: "That code is long for something a customer has to type.",
    key: "promo.issue.codeLong",
    en: "That's long for something a customer has to type at checkout.",
  },
  {
    match: "Choose a percentage off or a fixed amount off.",
    key: "promo.issue.type",
    en: "Choose a percentage off or a fixed amount off.",
  },
  { match: "Enter a whole number.", key: "promo.issue.whole", en: "Enter a whole number." },
  {
    match: /^A percentage must be between (\d+) and (\d+)\.$/,
    key: "promo.issue.percentRange",
    en: "A percentage is between {min} and {max}.",
    vars: (m) => ({ min: m[1] ?? "", max: m[2] ?? "" }),
  },
  {
    match: "100% off makes the whole order free. Is that right?",
    key: "promo.issue.percentAll",
    en: "100% off makes the whole order free. Is that really what you mean?",
  },
  {
    match: "A fixed amount must be at least Rs 1.",
    key: "promo.issue.flatMin",
    en: "A fixed amount has to be at least रु 1.",
  },
  {
    match: "A minimum basket is a whole number of rupees, or nothing.",
    key: "promo.issue.minOrder",
    en: "The smallest order is a whole number of rupees — or leave it empty.",
  },
  {
    match: "A minimum basket is a whole number of rupees.",
    key: "promo.issue.minOrderEdit",
    en: "The smallest order is a whole number of rupees.",
  },
  {
    match: "A cap must be at least Rs 1, or leave it empty.",
    key: "promo.issue.capMin",
    en: "The most it takes off has to be at least रु 1 — or leave it empty.",
  },
  {
    match: "A cap only applies to percentage coupons. It will just lower the fixed amount.",
    key: "promo.issue.capOnFlat",
    en: "A limit only makes sense on a percentage. On a fixed amount it just lowers the amount.",
  },
  {
    match: "A total limit must be at least 1, or leave it empty for unlimited.",
    key: "promo.issue.usageMin",
    en: "At least 1 — or leave it empty for no limit.",
  },
  {
    match: "A total limit must be at least 1.",
    key: "promo.issue.usageMinEdit",
    en: "At least 1.",
  },
  {
    match: /^This code has already been used (\d+) times, so that limit stops it working\.$/,
    key: "promo.issue.usageBelowUsed",
    en: "It's already been used {count} times, so this limit stops it working straight away.",
    vars: (m) => ({ count: m[1] ?? "" }),
  },
  {
    match: /^Per-customer uses must be between (\d+) and (\d+)\.$/,
    key: "promo.issue.perUser",
    en: "Between {min} and {max} times for each customer.",
    vars: (m) => ({ min: m[1] ?? "", max: m[2] ?? "" }),
  },
  {
    match: "That start date is not a date.",
    key: "promo.issue.startBad",
    en: "That start date isn't a real date.",
  },
  {
    match: "That end date is not a date.",
    key: "promo.issue.endBad",
    en: "That end date isn't a real date.",
  },
  {
    match: "The end has to be after the start.",
    key: "promo.issue.endBeforeStart",
    en: "The end has to be after the start.",
  },
  {
    match: "That end date has already passed.",
    key: "promo.issue.endPassed",
    en: "That end date has already passed.",
  },
  {
    match: "That date is in the past, so the code stops working immediately.",
    key: "promo.issue.endPastEdit",
    en: "That date has passed, so the code stops working as soon as you save.",
  },
];

export function issueText(issue: CouponIssue, t: T): string {
  for (const entry of ISSUES) {
    if (typeof entry.match === "string") {
      if (entry.match === issue.message) return t(entry.key, undefined, entry.en);
    } else {
      const m = issue.message.match(entry.match);
      if (m) return t(entry.key, entry.vars?.(m), entry.en);
    }
  }
  return t("promo.issue.unknown", undefined, issue.message);
}

/** The first issue for a field, errors before warnings, already worded. */
export function fieldIssue(
  issues: readonly CouponIssue[],
  field: CouponIssue["field"],
  t: T,
): { text: string; severity: CouponIssue["severity"] } | null {
  const hit =
    issues.find((i) => i.field === field && i.severity === "error") ??
    issues.find((i) => i.field === field);
  return hit ? { text: issueText(hit, t), severity: hit.severity } : null;
}

/**
 * A typed number, or what the rules need to see when it is not one.
 *
 * Empty is "not given" (undefined), which the rules read as "use the default".
 * Anything that is not plain digits becomes NaN rather than being quietly
 * cleaned up, so the rule that says "a whole number" gets to fire.
 */
export function parseWhole(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}
