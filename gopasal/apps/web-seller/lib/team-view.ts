/**
 * View model for the team surface — Staff and Roles.
 *
 * The API's team payloads are Prisma rows: a membership with a joined user and
 * role, an invite view, a role with permission join rows. This module turns them
 * into the handful of things two screens both need — a display name, a status
 * label, a permission list a shopkeeper can read — and nothing more. It invents
 * no field the API does not send.
 *
 * One judgement is worth stating plainly. The permission *keys and groups* come
 * from `GET /seller/shops/:shopId/roles/catalog`, never from a local list, so the
 * role editor can only offer keys the server will accept. What the console adds
 * is the Nepali label and the plain-language hint, which the API carries none of
 * — looked up by key, and simply absent when a new key arrives that this build
 * has never heard of. An unknown key is still shown, with its English label from
 * the API, because hiding it would let someone grant access they could not see.
 */

import type { InviteWire, MembershipStatusWire, StaffMemberWire } from "@/lib/api/staff";
import type { PermissionCatalogGroupWire, ShopRoleWire } from "@/lib/api/roles";
import { PERMISSION_GROUPS } from "@/lib/rbac";
import type { Tone } from "@/components/primitives";

/* ------------------------------------------------------------------- People */

/** Initials for an avatar, from a name if there is one, else the phone. */
export function initials(name: string | null, phone: string): string {
  const from = (name ?? "").trim();
  if (from.length === 0) return phone.slice(-2);
  return from
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** What to call someone who has not set a name yet: their number, not "Unknown". */
export function displayName(member: { user: { name: string | null; phone: string } }): string {
  const name = member.user.name?.trim();
  return name && name.length > 0 ? name : member.user.phone;
}

/**
 * Membership status in the seller's words.
 *
 * INVITED is a real state on `ShopMembership`, distinct from a pending
 * `StaffInvite`: the row exists but grants nothing until it is ACTIVE, which is
 * exactly what `RbacService` checks.
 */
export const MEMBERSHIP_STATUS: Record<
  MembershipStatusWire,
  { label: string; tone: Tone; hint: string }
> = {
  ACTIVE: { label: "Active", tone: "green", hint: "Signed in and holding this role’s access." },
  INVITED: {
    label: "Not signed in yet",
    tone: "blue",
    hint: "The membership exists but grants nothing until they sign in.",
  },
  SUSPENDED: {
    label: "Suspended",
    tone: "ink",
    hint: "Kept on the team, but every permission is withheld.",
  },
};

/** Invite status in the seller's words. EXPIRED is set lazily by the API's list. */
export const INVITE_STATUS: Record<InviteWire["status"], { label: string; tone: Tone }> = {
  PENDING: { label: "Waiting to be accepted", tone: "blue" },
  ACCEPTED: { label: "Accepted", tone: "green" },
  REVOKED: { label: "Revoked", tone: "ink" },
  EXPIRED: { label: "Expired", tone: "ink" },
};

/**
 * Whether the last SMS actually went out, read from `delivery` rather than
 * assumed from the 201.
 *
 * `deliver()` writes `"sent"` on success and `` `failed: ${reason}` `` on
 * failure, and the invite is valid either way — so "failed" means "hand them the
 * code yourself", not "try again".
 */
export function inviteDelivery(invite: InviteWire): {
  state: "sent" | "failed" | "unknown";
  detail: string | null;
} {
  const d = invite.delivery;
  if (!d) return { state: "unknown", detail: null };
  if (d === "sent") return { state: "sent", detail: null };
  if (d.startsWith("failed")) return { state: "failed", detail: d.replace(/^failed:\s*/, "") };
  // Anything else is a value this build has not seen. It is reported as unknown
  // with the raw string, rather than guessed at: there used to be a `"queued"`
  // arm here that treated a value `InvitesService.deliver` never writes as a
  // success. `deliver()` returns exactly `sent` or `failed: …`, and the SMS is
  // awaited, so there is no queue to be in.
  return { state: "unknown", detail: d };
}

/** "in 2 days" / "in 5 hours" / "expired" — for an invite's own expiry only. */
export function untilLabel(iso: string, now: Date = new Date()): string {
  const ms = new Date(iso).getTime() - now.getTime();
  if (ms <= 0) return "expired";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `in ${hours} hr`;
  return `in ${Math.round(hours / 24)} days`;
}

/**
 * Case-insensitive match over the fields a team search should cover.
 *
 * Browser-side filtering, unlike on every other seller list. `GET …/staff` returns
 * the complete roster because a membership only exists once a person accepted an
 * invitation and can be removed again — so there is no page to ask the server for,
 * and no `?q=` to send. Filtering the array in hand is the whole implementation.
 * See `lib/api/staff.ts#listShopStaff`.
 */
export function matchesMember(member: StaffMemberWire, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    displayName(member).toLowerCase().includes(q) ||
    member.user.phone.includes(q) ||
    member.role.name.toLowerCase().includes(q)
  );
}

/**
 * The same, for an invitation.
 *
 * Bounded differently: `GET …/invites` defaults to `status=PENDING` and the service
 * carries `take: 200`, because invites are history — a revoked or expired one stays.
 * So this filters at most 200 rows, which is also small enough to do here.
 */
export function matchesInvite(invite: InviteWire, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    (invite.name ?? "").toLowerCase().includes(q) ||
    invite.phone.includes(q) ||
    invite.role.name.toLowerCase().includes(q)
  );
}

/* -------------------------------------------------------------------- Roles */

/**
 * A decorative accent for a role, derived from what the role *is* rather than
 * invented per row: the API has no colour column and making one up per id would
 * mean the same role looked different on two machines.
 */
export function roleAccent(role: { isPrivileged: boolean; isSystem: boolean }): Tone {
  if (role.isPrivileged) return "crimson";
  return role.isSystem ? "ink" : "blue";
}

/** How a role's permission count should be described, privilege included. */
export function roleGrantSummary(role: ShopRoleWire): string {
  if (role.isPrivileged) return "Every permission, including future ones";
  const n = role.permissions.length;
  return `${n} permission${n === 1 ? "" : "s"}`;
}

/* ------------------------------------------------------- Permission catalogue */

/** The console's own translation and hint for a key, when it knows the key. */
type LocalGloss = { labelNp: string; hint: string };

const GLOSS: Map<string, LocalGloss> = new Map(
  PERMISSION_GROUPS.flatMap((g) =>
    g.permissions.map((p) => [p.id as string, { labelNp: p.labelNp, hint: p.hint }] as const),
  ),
);

/** A permission as the role editor renders it: the API's key, our gloss. */
export type CatalogPermission = {
  key: string;
  label: string;
  labelNp: string | null;
  hint: string | null;
  /** True when this build has no gloss for the key — a newer API than this UI. */
  unglossed: boolean;
};

export type CatalogGroup = { group: string; permissions: CatalogPermission[] };

/**
 * Merge the server's catalogue with the console's translations.
 *
 * Order and grouping are the API's, so what a shop owner reads here matches
 * `permissions.catalog.ts` key for key. A key this build has never seen still
 * appears — with its English label and no hint — because a permission that
 * exists but cannot be shown is a permission nobody can audit.
 */
export function toCatalogGroups(wire: PermissionCatalogGroupWire[]): CatalogGroup[] {
  return wire.map((g) => ({
    group: g.group,
    permissions: g.permissions.map((p) => {
      const gloss = GLOSS.get(p.key);
      return {
        key: p.key,
        label: p.label,
        labelNp: gloss?.labelNp ?? null,
        hint: gloss?.hint ?? p.description ?? null,
        unglossed: gloss === undefined,
      };
    }),
  }));
}

/** Every key the server's catalogue contains, flattened. */
export function catalogKeys(groups: CatalogGroup[]): string[] {
  return groups.flatMap((g) => g.permissions.map((p) => p.key));
}

/**
 * English label for a permission key, preferring the server's catalogue and
 * falling back to this console's own table, then to the raw key. A key printed
 * raw is a signal, not a bug: it means the API knows a permission this build
 * does not.
 */
export function permissionLabelFrom(groups: CatalogGroup[], key: string): string {
  for (const g of groups) {
    for (const p of g.permissions) if (p.key === key) return p.label;
  }
  for (const g of PERMISSION_GROUPS) {
    for (const p of g.permissions) if ((p.id as string) === key) return p.label;
  }
  return key;
}

/*
 * There is deliberately no `isKnownPermission` type guard here.
 *
 * It narrowed a server key to `lib/rbac.ts`'s `PermissionId` union by asking whether
 * `GLOSS` had it — and nothing called it, because nothing in the role editor needs
 * that narrowing: the editor sends and receives raw `string` keys, exactly as the
 * catalogue gives them, and `CatalogPermission.unglossed` already carries the one
 * fact the guard was computing. Narrowing a server value to a browser union is
 * also the wrong direction of trust for a catalogue the API owns.
 */
