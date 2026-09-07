/**
 * The form's own copy of an application, and how it turns back into a PATCH body.
 *
 * Everything the seller types is held as a string — including the numbers — so a
 * half-typed coordinate does not become `NaN` mid-keystroke. The conversion back
 * to the wire happens once, in {@link diffFields}, and it sends **only what
 * changed**: the API runs `whitelist` + `forbidNonWhitelisted`, so an unknown or
 * pointless key is not merely wasteful, it fails the entire request.
 */

import { PAYOUT_METHODS, type Application, type ApplicationFields, type PayoutMethod } from "@/lib/api/types";

export type FormValues = {
  shopName: string;
  shopNameNp: string;
  categoryId: string;
  description: string;
  contactPhone: string;
  contactEmail: string;
  area: string;
  fullAddress: string;
  lat: string;
  lng: string;
  deliveryRadiusKm: string;
  hours: string;
  soloMode: boolean;
  ownerName: string;
  ownerNameNp: string;
  citizenshipNo: string;
  registrationNo: string;
  panNo: string;
  vatNo: string;
  payoutMethod: string;
  bankName: string;
  bankBranch: string;
  bankAccountNo: string;
  bankAccountName: string;
  walletNumber: string;
};

/** Plain text fields — same name on the form as on the wire. */
type TextKey =
  | "shopName"
  | "shopNameNp"
  | "categoryId"
  | "description"
  | "contactPhone"
  | "contactEmail"
  | "area"
  | "fullAddress"
  | "hours"
  | "ownerName"
  | "ownerNameNp"
  | "citizenshipNo"
  | "registrationNo"
  | "panNo"
  | "vatNo"
  | "bankName"
  | "bankBranch"
  | "bankAccountNo"
  | "bankAccountName"
  | "walletNumber";

const TEXT_KEYS: readonly TextKey[] = [
  "shopName",
  "shopNameNp",
  "categoryId",
  "description",
  "contactPhone",
  "contactEmail",
  "area",
  "fullAddress",
  "hours",
  "ownerName",
  "ownerNameNp",
  "citizenshipNo",
  "registrationNo",
  "panNo",
  "vatNo",
  "bankName",
  "bankBranch",
  "bankAccountNo",
  "bankAccountName",
  "walletNumber",
];

function text(value: string | null): string {
  return value ?? "";
}

function numberText(value: number | null): string {
  return value === null ? "" : String(value);
}

export function fromApplication(app: Application): FormValues {
  return {
    shopName: text(app.shopName),
    shopNameNp: text(app.shopNameNp),
    categoryId: text(app.categoryId),
    description: text(app.description),
    contactPhone: text(app.contactPhone),
    contactEmail: text(app.contactEmail),
    area: text(app.area),
    fullAddress: text(app.fullAddress),
    lat: numberText(app.lat),
    lng: numberText(app.lng),
    deliveryRadiusKm: String(app.deliveryRadiusKm),
    hours: text(app.hours),
    soloMode: app.soloMode,
    ownerName: text(app.ownerName),
    ownerNameNp: text(app.ownerNameNp),
    citizenshipNo: text(app.citizenshipNo),
    registrationNo: text(app.registrationNo),
    panNo: text(app.panNo),
    vatNo: text(app.vatNo),
    payoutMethod: text(app.payoutMethod),
    bankName: text(app.bankName),
    bankBranch: text(app.bankBranch),
    bankAccountNo: text(app.bankAccountNo),
    bankAccountName: text(app.bankAccountName),
    walletNumber: text(app.walletNumber),
  };
}

/*
 * Both helpers below are module-private. They are the mechanics of building a
 * PATCH body, not something a screen should reach for: `ApplicationForm` hands
 * `patchBody` two `FormValues` and gets the changed fields, and a component doing
 * its own diff or its own payout-method check would be a second answer to a
 * question this file already answers.
 */

function isPayoutMethod(value: string): value is PayoutMethod {
  return (PAYOUT_METHODS as readonly string[]).includes(value);
}

/** Which fields the seller has touched since the last save, by form key. */
function changedKeys(initial: FormValues, current: FormValues): Set<keyof FormValues> {
  const out = new Set<keyof FormValues>();
  for (const key of Object.keys(current) as (keyof FormValues)[]) {
    if (current[key] !== initial[key]) out.add(key);
  }
  return out;
}

/**
 * Text fields the server refuses to store empty, and the validator that refuses.
 *
 * `blankToNull` in `onboarding.service.ts` turns `""` into `null` for every text
 * column, so clearing a box really is how a seller removes something — *except*
 * where a validator rejects `""` before the service ever sees it. `@IsOptional()`
 * only skips validation for `undefined` and `null`, never for `""`.
 */
const UNCLEARABLE_TEXT: Partial<Record<TextKey, string>> = {
  shopName: "@MinLength(2)",
  contactEmail: "@IsEmail()",
};

/**
 * The PATCH body: the changed fields only, in wire shape.
 *
 * A cleared text box is sent as `""` on purpose — `blankToNull` maps blank to
 * `null` server-side, and that is how a seller removes something they had typed
 * before. Three groups are the exception, and this function drops them rather than
 * inventing a value:
 *
 * - `shopName` and `contactEmail` ({@link UNCLEARABLE_TEXT}) reject `""` outright,
 *   so sending one would be a 400 instead of a clear.
 * - `lat`, `lng` and `deliveryRadiusKm` are numbers with no null spelling in the
 *   DTO, and guessing zero would be a lie.
 * - `payoutMethod` is `@IsIn(['BANK','ESEWA','KHALTI'])`, so an unset dropdown has
 *   nothing legal to send.
 *
 * Whatever it drops is still *changed* on the form, which is why
 * {@link unsendableChanges} exists: a screen must be able to say so instead of
 * leaving Save inert and the footer stuck on "unsaved changes".
 */
export function diffFields(initial: FormValues, current: FormValues): ApplicationFields {
  const changed = changedKeys(initial, current);
  const patch: Partial<Record<TextKey, string>> = {};
  for (const key of TEXT_KEYS) {
    if (!changed.has(key)) continue;
    const value = current[key].trim();
    if (value === "" && UNCLEARABLE_TEXT[key] !== undefined) continue;
    patch[key] = value;
  }

  const out: ApplicationFields = { ...patch };

  if (changed.has("soloMode")) out.soloMode = current.soloMode;

  if (changed.has("payoutMethod") && isPayoutMethod(current.payoutMethod)) {
    out.payoutMethod = current.payoutMethod;
  }

  if (changed.has("deliveryRadiusKm")) {
    const radius = Number(current.deliveryRadiusKm);
    if (current.deliveryRadiusKm.trim() !== "" && Number.isFinite(radius)) {
      out.deliveryRadiusKm = radius;
    }
  }

  for (const key of ["lat", "lng"] as const) {
    if (!changed.has(key)) continue;
    const raw = current[key].trim();
    if (raw === "") continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) out[key] = parsed;
  }

  return out;
}

/** True when there is something worth sending. */
export function hasChanges(initial: FormValues, current: FormValues): boolean {
  return changedKeys(initial, current).size > 0;
}

/**
 * Changed fields that {@link diffFields} will refuse to send, in form-key order.
 *
 * Derived from `diffFields` itself rather than from a second copy of its rules, so
 * the two can never disagree: every form key is spelled the same on the wire, so a
 * changed key missing from the patch is a key that is not going anywhere.
 *
 * A screen needs this because "changed" and "sendable" are not the same set. Clear
 * the latitude box and the form is dirty forever otherwise — Save has nothing to
 * send, so the footer would keep saying "You have unsaved changes." and the submit
 * panel would keep refusing to send the application. Naming the fields is the
 * honest way out: the seller can retype the value or leave the old one.
 */
export function unsendableChanges(initial: FormValues, current: FormValues): (keyof FormValues)[] {
  const sent = new Set(Object.keys(diffFields(initial, current)));
  return [...changedKeys(initial, current)].filter((key) => !sent.has(key));
}
