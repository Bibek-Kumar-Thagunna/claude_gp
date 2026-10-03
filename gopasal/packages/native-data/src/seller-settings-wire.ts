/**
 * Shop-settings addressing, bounds, the PATCH diff, and the location-capture
 * freshness rules — with no React in it.
 *
 * Two things in here are worth testing and would be unreachable inside the hooks:
 *
 *  - **The diff.** `PATCH /seller/shops/:shopId` is a true partial update, so the
 *    only honest thing to send is what the seller actually changed. A snapshot
 *    would rewrite every column — including the ones a colleague edited while the
 *    form was open — and `UpdateShopDto` answers 400 to an explicit `null`, so a
 *    naive `Object.assign` over a form with empty fields is a request that fails on
 *    a field the seller never touched. {@link shopSettingsDiff} does it once,
 *    correctly.
 *  - **The capture freshness window.** A GPS reading is refused if it is more than
 *    two minutes old or more than thirty seconds in the future, and if its accuracy
 *    is outside 1–100 m. All four are 400s or 409s, and all four can be known on
 *    the phone that took the reading — which is the phone running this code.
 */
import type { ShopSettingsPatch } from "./seller-settings";

/* ── query keys ───────────────────────────────────────────────────────────── */

/**
 * The keys this module adds.
 *
 * **The shop list is not one of them.** `seller-wire.ts` owns `qk.shops()`, and
 * `./seller`'s `useMyShops`, `useSelectedShop` and `useShopSettings` are all built
 * on it — so a settings save here invalidates *that* key rather than a private
 * copy. A second key for the shop list would leave the shop switcher, the
 * dashboard's storefront banner and the open/closed toggle showing the values from
 * before the save.
 *
 * `shop` is the manage *detail* (`GET /seller/shops/:shopId`), which is a different
 * response from a row of the list — see `ShopDetail` — so it gets its own entry.
 * Singular, next to plural, exactly as `qk.order` sits beside `qk.orders`.
 */
export const settingsQk = {
  shop: (shopId: string) => ["seller", "shop", shopId] as const,
  locationCapture: (shopId: string, captureId: string) =>
    ["seller", "location-capture", shopId, captureId] as const,
};

/* ── bounds ───────────────────────────────────────────────────────────────── */

/**
 * `UpdateShopDto`'s bounds, mirrored so a form stops a seller at the input.
 *
 * These are the API's numbers and are deliberately the *applicant-facing* ones:
 * `ApplicationFieldsDto` created these very columns, and the DTO's own comment says
 * a seller must not be able to widen a value past what onboarding would have
 * accepted for it. The radius bounds and `SHOP_NAME_MIN_LENGTH` are exported
 * constants on the API side for exactly this purpose.
 *
 * `minOrderMax` is `2_147_483_647` and is the Postgres `integer` ceiling rather
 * than a business rule: without it a larger number reaches the database and comes
 * back as an unmapped driver error instead of a 400 naming the field.
 */
export const SHOP_LIMITS = {
  nameMin: 2,
  nameMax: 120,
  nameNpMax: 120,
  descriptionMax: 1000,
  categoryIdMax: 60,
  phoneMax: 20,
  areaMax: 160,
  fullAddressMax: 300,
  hoursMax: 120,
  emojiMax: 16,
  radiusMinKm: 0.5,
  radiusMaxKm: 20,
  minOrderMin: 0,
  minOrderMax: 2_147_483_647,
} as const;

export type ShopSettingIssue = {
  field: keyof ShopSettingsPatch;
  message: string;
};

const isWholeNumber = (value: number): boolean => Number.isInteger(value) && Number.isFinite(value);

/**
 * Everything wrong with a settings patch.
 *
 * Every rule here is one `UpdateShopDto` enforces, and two properties of that DTO
 * shape the whole function:
 *
 *  - **`null` is never a value.** Every field is `@OptionalField()`, a `ValidateIf`
 *    that skips validation only when a property is genuinely *absent*, so a JSON
 *    `null` falls through to `@IsString()` / `@IsNumber()` / `@IsBoolean()` and is
 *    answered with a 400 naming the field. Omit a key to leave its column alone;
 *    clear a nullable text column with `""`. `categoryId` can therefore be changed
 *    and not emptied. This function refuses `null` for the same reason rather than
 *    quietly dropping it, because a form that silently discarded a field the seller
 *    cleared would be worse than one that says it cannot clear it.
 *  - **Numbers and booleans must be real ones.** Body validation runs without
 *    implicit conversion, so `"200"` and `"true"` are 400s. A phone keypad produces
 *    strings; something has to parse them, and a type is not a parser.
 *
 * `name` is the one with teeth. Before the API was hardened `UpdateShopDto` had no
 * `MinLength` on it at all, so `{"name":""}` was accepted for a live storefront.
 */
export function shopSettingsIssues(patch: ShopSettingsPatch): ShopSettingIssue[] {
  const issues: ShopSettingIssue[] = [];

  const text = (
    field: keyof ShopSettingsPatch,
    value: string | null | undefined,
    max: number,
    label: string,
  ) => {
    if (value === undefined) return;
    if (value === null) {
      issues.push({ field, message: `${label} cannot be emptied that way. Use a blank value.` });
      return;
    }
    if (value.length > max) {
      issues.push({ field, message: `${label} can be at most ${max} characters.` });
    }
  };

  if (patch.name !== undefined) {
    const name = patch.name?.trim();
    if (!name || name.length < SHOP_LIMITS.nameMin) {
      issues.push({
        field: "name",
        message: `The shop name needs at least ${SHOP_LIMITS.nameMin} characters.`,
      });
    } else if (name.length > SHOP_LIMITS.nameMax) {
      issues.push({
        field: "name",
        message: `The shop name can be at most ${SHOP_LIMITS.nameMax} characters.`,
      });
    }
  }

  text("nameNp", patch.nameNp, SHOP_LIMITS.nameNpMax, "The Nepali name");
  text("description", patch.description, SHOP_LIMITS.descriptionMax, "The description");
  text("phone", patch.phone, SHOP_LIMITS.phoneMax, "The phone number");
  text("area", patch.area, SHOP_LIMITS.areaMax, "The area");
  text("fullAddress", patch.fullAddress, SHOP_LIMITS.fullAddressMax, "The address");
  text("hours", patch.hours, SHOP_LIMITS.hoursMax, "The opening hours");
  text("emoji", patch.emoji, SHOP_LIMITS.emojiMax, "The emoji");

  if (patch.categoryId !== undefined) {
    const categoryId = patch.categoryId;
    if (!categoryId) {
      // `""` would pass `@IsString()` and be written, leaving a shop pointing at a
      // category that does not exist. The column is nullable and no seller route
      // can set it back to null, so this is a one-way mistake.
      issues.push({ field: "categoryId", message: "Choose a category; it cannot be cleared." });
    } else if (categoryId.length > SHOP_LIMITS.categoryIdMax) {
      issues.push({ field: "categoryId", message: "That category is not a real one." });
    }
  }

  if (patch.deliveryRadiusKm !== undefined) {
    const radius = patch.deliveryRadiusKm;
    if (
      typeof radius !== "number" ||
      !Number.isFinite(radius) ||
      radius < SHOP_LIMITS.radiusMinKm ||
      radius > SHOP_LIMITS.radiusMaxKm
    ) {
      issues.push({
        field: "deliveryRadiusKm",
        message: `The delivery radius must be between ${SHOP_LIMITS.radiusMinKm} and ${SHOP_LIMITS.radiusMaxKm} km.`,
      });
    }
  }

  if (patch.minOrder !== undefined) {
    const minOrder = patch.minOrder;
    if (
      typeof minOrder !== "number" ||
      !isWholeNumber(minOrder) ||
      minOrder < SHOP_LIMITS.minOrderMin ||
      minOrder > SHOP_LIMITS.minOrderMax
    ) {
      issues.push({
        field: "minOrder",
        message: "The minimum order is a whole number of rupees, zero or more.",
      });
    }
  }

  return issues;
}

/**
 * What actually changed, as the body to send.
 *
 * `PATCH /seller/shops/:shopId` leaves an omitted column alone, so a diff is not an
 * optimisation — it is the only shape that says what the seller meant. Three
 * separate problems it avoids:
 *
 *  - **It does not overwrite a colleague's edit.** Two people hold
 *    `settings.manage` on a shop often enough; sending a full snapshot means the
 *    last save wins on every column, including the ones the second person never
 *    looked at.
 *  - **It does not 400 on an untouched empty field.** A form seeded from a shop
 *    with no `nameNp` holds `null` or `""` for it. Sending `null` is a 400 naming a
 *    field the seller never went near, and sending `""` *writes* an empty string
 *    over a genuine null — a change nobody asked for.
 *  - **It does not send a no-op.** An empty result means there is nothing to save,
 *    and a screen can disable its button on exactly that rather than on a
 *    hand-maintained dirty flag.
 *
 * A nullable text column that the seller genuinely cleared appears in the diff as
 * `""`, which is how `UpdateShopDto` clears one. A `null` in the draft is read as
 * "unchanged, and it was already empty" rather than as an instruction, because the
 * API has no way to express the instruction.
 */
export function shopSettingsDiff(
  current: {
    name: string;
    nameNp: string | null;
    description: string | null;
    categoryId: string | null;
    phone: string | null;
    area: string | null;
    fullAddress: string | null;
    deliveryRadiusKm: number;
    emoji: string | null;
    hours: string | null;
    isOpen: boolean;
    minOrder: number;
    soloMode: boolean;
  },
  draft: ShopSettingsPatch,
): ShopSettingsPatch {
  const patch: ShopSettingsPatch = {};

  const text = <K extends "name" | "nameNp" | "description" | "categoryId" | "phone" | "area" | "fullAddress" | "emoji" | "hours">(
    field: K,
    was: string | null,
  ) => {
    const next = draft[field];
    if (next === undefined || next === null) return;
    // `??` and not `||`: the stored value may legitimately be an empty string, and
    // treating that as "no value" would make clearing a field look like a change
    // every time the form was opened.
    if (next !== (was ?? "")) patch[field] = next;
  };

  text("name", current.name);
  text("nameNp", current.nameNp);
  text("description", current.description);
  text("categoryId", current.categoryId);
  text("phone", current.phone);
  text("area", current.area);
  text("fullAddress", current.fullAddress);
  text("emoji", current.emoji);
  text("hours", current.hours);

  if (draft.deliveryRadiusKm !== undefined && draft.deliveryRadiusKm !== current.deliveryRadiusKm) {
    patch.deliveryRadiusKm = draft.deliveryRadiusKm;
  }
  if (draft.minOrder !== undefined && draft.minOrder !== current.minOrder) {
    patch.minOrder = draft.minOrder;
  }
  if (draft.isOpen !== undefined && draft.isOpen !== current.isOpen) {
    patch.isOpen = draft.isOpen;
  }
  if (draft.soloMode !== undefined && draft.soloMode !== current.soloMode) {
    patch.soloMode = draft.soloMode;
  }

  return patch;
}

/** True when there is nothing to save. A screen's save button reads this. */
export function isEmptyPatch(patch: ShopSettingsPatch): boolean {
  return Object.keys(patch).length === 0;
}

/* ── location capture ─────────────────────────────────────────────────────── */

/**
 * The accuracy window `SubmitCapturedLocationDto` accepts: `@Min(1) @Max(100)`
 * metres.
 *
 * The ceiling is the interesting one. A reading worse than 100 m is refused
 * outright — there is no "recorded, approximately" — because a shop pin is what
 * `VERIFIED_LOCATION` and the whole serviceability calculation rest on, and a pin
 * with a 500 m error covers streets the shop does not deliver to. The floor exists
 * because `0` is what a device reports when it has no idea rather than when it is
 * perfect.
 */
export const CAPTURE_ACCURACY_MIN_M = 1;
export const CAPTURE_ACCURACY_MAX_M = 100;

/**
 * How stale a reading may be, and how far ahead of the server's clock it may
 * claim to be.
 *
 * `LocationCaptureService.submit` computes `age = now - capturedAt` and rejects
 * `age > 2 minutes` or `age < -30 seconds` with 409 "That GPS reading is not fresh.
 * Ask the phone for location again." The asymmetry is deliberate on the server's
 * part: the negative arm is clock skew tolerance, not a window.
 *
 * Both are checked against the *server's* clock, so a phone whose time is wrong by
 * more than thirty seconds cannot capture a location at all, however good its GPS
 * is. That is worth telling a seller, because the symptom — "not fresh" on a
 * reading taken a second ago — is otherwise inexplicable.
 */
export const CAPTURE_MAX_AGE_MS = 2 * 60 * 1000;
export const CAPTURE_MAX_SKEW_AHEAD_MS = 30_000;

/** How long a capture link lives: `CAPTURE_TTL_SECONDS`, ten minutes. */
export const CAPTURE_TTL_MS = 10 * 60 * 1000;

export type CaptureIssue = {
  reason: "ACCURACY" | "STALE" | "AHEAD";
  message: string;
};

/**
 * Why this GPS reading will be refused, or null.
 *
 * Run before submitting. Every branch mirrors a server rejection, and the point of
 * mirroring them is that the fix is local in each case: wait for a better fix, take
 * a fresh reading, or correct the phone's clock. A round trip cannot tell the seller
 * any of that faster than the phone can.
 *
 * `capturedAtMs` is the reading's own timestamp — `position.timestamp` from the
 * geolocation API, not the moment the code ran. They differ by however long the fix
 * took, which on a cold GPS is exactly the two minutes this window is about.
 */
export function captureIssue(
  reading: { accuracyM: number; capturedAtMs: number },
  now: number = Date.now(),
): CaptureIssue | null {
  if (
    !Number.isFinite(reading.accuracyM) ||
    reading.accuracyM < CAPTURE_ACCURACY_MIN_M ||
    reading.accuracyM > CAPTURE_ACCURACY_MAX_M
  ) {
    return {
      reason: "ACCURACY",
      message: `The location needs to be accurate to within ${CAPTURE_ACCURACY_MAX_M} m. Step outside and try again.`,
    };
  }
  const age = now - reading.capturedAtMs;
  if (age > CAPTURE_MAX_AGE_MS) {
    return { reason: "STALE", message: "That reading is too old. Ask for the location again." };
  }
  if (age < -CAPTURE_MAX_SKEW_AHEAD_MS) {
    return {
      reason: "AHEAD",
      message: "This phone's clock is wrong, so the location cannot be recorded.",
    };
  }
  return null;
}
