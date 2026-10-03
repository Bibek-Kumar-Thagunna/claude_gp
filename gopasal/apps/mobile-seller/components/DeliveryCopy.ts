import {
  ZONE_LIMITS,
  distinctVertexCount,
  type LatLng,
  type RiderIssue,
  type ShopRider,
  type VehicleType,
  type ZoneIssue,
} from "@gopasal/native-data/seller-delivery";
import { theme, type useT } from "@gopasal/native-ui";

type T = ReturnType<typeof useT>;

/**
 * Words and small facts for the delivery screens.
 *
 * The same arrangement as `SettingsCopy`: the data layer's validators speak
 * English, so each issue is re-said here from its field and the value that
 * failed, never from its message.
 */

/**
 * The number as `normalizeNepalPhone` will store it: ten digits, no prefix.
 *
 * Done here, and the normalised form is what gets *sent*, so the number shown in
 * the confirmation is byte-for-byte the number the account will be created or
 * renamed under. Showing the typed "+977 98-4123 4567" and sending something the
 * server reshapes would be asking the shopkeeper to check a number that is not
 * the one being used. Null when it is not a number `riderPhoneIssue` accepts.
 */
export function normaliseRiderPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("977")) digits = digits.slice(3);
  return /^9[678]\d{8}$/.test(digits) ? digits : null;
}

/** "98412 34567" — grouped so it can be read aloud against another handset. */
export function spacedPhone(phone: string): string {
  return phone.length === 10 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;
}

export function riderIssueText(issue: RiderIssue, phone: string, t: T): string {
  if (issue.field === "name") {
    return t("delivery.rider.issue.name", undefined, "Enter the rider's name — at least 2 letters.");
  }
  return phone.trim()
    ? t("delivery.rider.issue.phone", undefined, "That isn't a ten-digit Nepali mobile number (98…, 97… or 96…).")
    : t("delivery.rider.issue.phoneMissing", undefined, "Enter the rider's mobile number.");
}

/**
 * One `zoneDraftIssues` entry, said from the draft that produced it.
 *
 * The polygon field fails four different ways and they need four different
 * fixes — walk more corners, drop some, you were standing still, a reading was
 * garbage — so the draft is inspected again in the validator's own order.
 */
export function zoneIssueText(
  issue: ZoneIssue,
  draft: { name: string; polygon: readonly LatLng[] },
  t: T,
): string {
  if (issue.field === "name") {
    return draft.name.trim().length > ZONE_LIMITS.nameMax
      ? t("delivery.zone.issue.nameLong", { max: ZONE_LIMITS.nameMax }, "A zone name can be at most {max} characters.")
      : t("delivery.zone.issue.nameShort", { min: ZONE_LIMITS.nameMin }, "Give the zone a name of at least {min} letters.");
  }
  if (issue.field === "feeOverride") {
    return t(
      "delivery.zone.issue.fee",
      { max: ZONE_LIMITS.feeMax },
      "The zone fee is a whole number of rupees, up to {max}.",
    );
  }
  const count = draft.polygon.length;
  if (count < ZONE_LIMITS.pointsMin) {
    return t(
      "delivery.zone.issue.fewPoints",
      { min: ZONE_LIMITS.pointsMin, count },
      "A zone needs at least {min} corners. You have {count}.",
    );
  }
  if (count > ZONE_LIMITS.pointsMax) {
    return t(
      "delivery.zone.issue.manyPoints",
      { max: ZONE_LIMITS.pointsMax },
      "A zone can have at most {max} corners. Undo some.",
    );
  }
  if (distinctVertexCount(draft.polygon) < ZONE_LIMITS.pointsMin) {
    return t(
      "delivery.zone.issue.samePlace",
      undefined,
      "Those corners are all in the same place, so the zone covers nothing. Walk to each corner before adding it.",
    );
  }
  return t(
    "delivery.zone.issue.badPoint",
    undefined,
    "One of those corners isn't a real place. Undo it and take it again.",
  );
}

export const VEHICLES: readonly VehicleType[] = ["MOTORBIKE", "SCOOTER", "BICYCLE", "WALK", "VAN"];

export function vehicleLabel(vehicle: VehicleType, t: T): string {
  switch (vehicle) {
    case "MOTORBIKE":
      return t("delivery.vehicle.motorbike", undefined, "Motorbike");
    case "SCOOTER":
      return t("delivery.vehicle.scooter", undefined, "Scooter");
    case "BICYCLE":
      return t("delivery.vehicle.bicycle", undefined, "Bicycle");
    case "WALK":
      return t("delivery.vehicle.walk", undefined, "On foot");
    case "VAN":
      return t("delivery.vehicle.van", undefined, "Van");
    default:
      return vehicle;
  }
}

/**
 * Whether a rider could take a bag right now.
 *
 * The roster's own rule, kept identical to `ShopRiderRoster`'s so the Shop tab
 * and this screen never disagree: `activeDeliveries` beats `status`, because a
 * rider marked online with two orders on the road is not free.
 */
export function riderAvailability(rider: ShopRider, t: T): { label: string; color: string; assignable: boolean } {
  if (rider.activeDeliveries > 0) {
    return {
      label: t("shop.rider.busy", { count: rider.activeDeliveries }),
      color: theme.color.warning,
      assignable: false,
    };
  }
  if (rider.status === "ON_DELIVERY") {
    return {
      label: t("delivery.rider.onDelivery", undefined, "On a delivery"),
      color: theme.color.warning,
      assignable: false,
    };
  }
  if (rider.status === "ONLINE") {
    return { label: t("shop.rider.free"), color: theme.color.success, assignable: true };
  }
  return { label: t("shop.rider.offline"), color: theme.color.textFaint, assignable: false };
}
