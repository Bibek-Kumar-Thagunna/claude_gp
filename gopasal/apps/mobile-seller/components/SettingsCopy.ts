import { ApiError } from "@gopasal/native-data";
import {
  SHOP_LIMITS,
  type CaptureIssue,
  type ShopSettingIssue,
} from "@gopasal/native-data/seller-settings";
import type { useT } from "@gopasal/native-ui";

type T = ReturnType<typeof useT>;

/**
 * Turning the data layer's answers into sentences, for the settings and
 * delivery screens.
 *
 * The validators in `@gopasal/native-data` return English prose, because the
 * package has no dictionary. Showing that prose directly would put English on a
 * Nepali screen, so each issue is re-said here from its *field and rule* — which
 * the validators expose — rather than from its message. Where one field can fail
 * two ways (a name too short or too long), the value is looked at again to tell
 * which, using the same limits the validator used.
 */

/**
 * A server refusal the shopkeeper can act on, or the generic line.
 *
 * `known` lets a screen translate the handful of refusals it expects by a
 * fragment of the API's own sentence — those are stable strings thrown by the
 * services. Anything else below 500 is shown in the API's words, as the sign-in
 * screens already do, because a 400 that names the problem is more useful than
 * "something went wrong" even in English. A 403 is always ours to phrase: it
 * means the role changed under the screen, and the fix is to ask the owner.
 */
export function apiProblemText(
  cause: unknown,
  t: T,
  known: ReadonlyArray<{ match: string; text: string }> = [],
): string {
  if (cause instanceof ApiError) {
    if (cause.status === 0) {
      return t(
        "settings.problem.offline",
        undefined,
        "Couldn't reach GoPasal. Nothing was changed — try again when you're connected.",
      );
    }
    if (cause.status === 403) {
      return t(
        "settings.problem.forbidden",
        undefined,
        "Your role in this shop doesn't allow that any more. Ask the owner.",
      );
    }
    const message = cause.message.toLowerCase();
    const hit = known.find((entry) => message.includes(entry.match.toLowerCase()));
    if (hit) return hit.text;
    if (cause.status >= 400 && cause.status < 500 && cause.status !== 401 && cause.message) {
      return cause.message;
    }
  }
  return t("common.somethingWrong");
}

/**
 * One `shopSettingsIssues` entry, said properly.
 *
 * `value` is the draft value for that field, so a name issue can say "too
 * short" or "too long" rather than both.
 */
export function settingIssueText(issue: ShopSettingIssue, value: string | number | undefined, t: T): string {
  const tooLong = (max: number) =>
    t("settings.issue.tooLong", { max }, "{max} characters at most.");

  switch (issue.field) {
    case "name": {
      const length = typeof value === "string" ? value.trim().length : 0;
      return length > SHOP_LIMITS.nameMax
        ? t("settings.issue.nameLong", { max: SHOP_LIMITS.nameMax }, "The shop name can be at most {max} characters.")
        : t("settings.issue.nameShort", { min: SHOP_LIMITS.nameMin }, "The shop name needs at least {min} characters.");
    }
    case "nameNp":
      return tooLong(SHOP_LIMITS.nameNpMax);
    case "description":
      return tooLong(SHOP_LIMITS.descriptionMax);
    case "phone":
      return tooLong(SHOP_LIMITS.phoneMax);
    case "area":
      return tooLong(SHOP_LIMITS.areaMax);
    case "fullAddress":
      return tooLong(SHOP_LIMITS.fullAddressMax);
    case "hours":
      return tooLong(SHOP_LIMITS.hoursMax);
    case "emoji":
      return tooLong(SHOP_LIMITS.emojiMax);
    case "categoryId":
      return t("settings.issue.category", undefined, "Choose a category. It can be changed but not left empty.");
    case "deliveryRadiusKm":
      return t(
        "settings.issue.radius",
        { min: SHOP_LIMITS.radiusMinKm, max: SHOP_LIMITS.radiusMaxKm },
        "The delivery radius must be between {min} and {max} km.",
      );
    case "minOrder":
      return t(
        "settings.issue.minOrder",
        undefined,
        "The minimum order is a whole number of rupees — 0 for no minimum.",
      );
    default:
      return t("common.somethingWrong");
  }
}

/** `captureIssue`, said with the fix for each reason. */
export function captureIssueText(issue: CaptureIssue, max: number, t: T): string {
  switch (issue.reason) {
    case "ACCURACY":
      return t(
        "settings.location.issue.accuracy",
        { max },
        "The reading needs to be accurate to within {max} m. Step outside, away from the roof, and wait for the number to drop.",
      );
    case "STALE":
      return t(
        "settings.location.issue.stale",
        undefined,
        "That reading is more than two minutes old. Wait for GPS to update, then try again.",
      );
    case "AHEAD":
      return t(
        "settings.location.issue.clock",
        undefined,
        "This phone's clock is wrong, so GoPasal can't accept its location. Set the date and time to automatic, then try again.",
      );
    default:
      return t("common.somethingWrong");
  }
}

/** Five decimals is about a metre — finer than any phone fix, so nothing is hidden. */
export function formatCoordinate(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** Metres under a kilometre, kilometres to one decimal above it. Western digits. */
export function formatDistance(metres: number, t: T): string {
  if (metres < 1000) return t("settings.distance.m", { metres: Math.round(metres) }, "{metres} m");
  return t("settings.distance.km", { km: (metres / 1000).toFixed(1) }, "{km} km");
}
