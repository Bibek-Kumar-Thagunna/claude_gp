/**
 * The team surface's rules and cache addressing, with no React in it.
 *
 * ## Why this is a file of its own
 *
 * `seller-team.ts` reaches `./GopasalProvider`, which imports `react-native`, so
 * nothing in it can be loaded off a phone. What is here is the part that has to be
 * provably right, and it is all one idea: **a control the shopkeeper will be
 * refused for must not be offered.**
 *
 * Every refusal below is a real guard in
 * `apps/api/src/rbac/memberships.service.ts` or `roles.service.ts`, pinned by
 * `shop-staff-tenancy.spec.ts` and `role-writes.spec.ts`. The API answers each
 * one with a sentence written for a human, and each predicate carries that
 * sentence verbatim — so a disabled button explains itself in the same words the
 * error would have used, rather than in a paraphrase that drifts. The alternative
 * is what happens without this file: the shopkeeper taps *Suspend* on the owner
 * and reads a red strip.
 *
 * It is a UI affordance and nothing more. The server remains the authority on
 * every one of these, and a screen that skipped the round trip on the strength of
 * a predicate here would be wrong — see {@link permissionsFor}.
 */
import type { MeResult, ShopAccess } from "@gopasal/api-client/types";

/* ── query keys ───────────────────────────────────────────────────────────── */

/**
 * Two roots, because the team surface asks two different kinds of question.
 *
 * **The shop's team** rides `["seller", "team", shopId, …]`. It extends `qk` in
 * `./seller-wire` rather than sitting beside it, deliberately: `isShopScopedKey`
 * treats every `["seller", x]` with `x !== "shops"` as an answer about the
 * selected shop and drops it when the counter switches shop, which is exactly
 * right for a roster, a role list and a pending-invite list. Collision with `qk`
 * is avoided by the second segment — it owns `orders`, `order`, `products`,
 * `conversations`, `conversation`, `finance`, `analytics`, `riders`, `reviews` and
 * `shops`, and `team` is none of them. Grouping everything under one segment also
 * means a sibling module adding `["seller", "coupons", …]` cannot collide with
 * anything here however it spells its leaves, and `shopId` stays in third
 * position so all of one shop's team answers match by prefix.
 *
 * **The caller's own invitations and access** use `["seller-team-me", …]`. An
 * invitation waiting for my phone number, and what `/auth/me` says I may do, are
 * not answers about the selected shop — the whole point of a pending invite is
 * that I am not a member yet — so being swept by a shop switch would be wrong
 * rather than merely wasteful.
 */
export const tqk = {
  all: () => ["seller", "team"] as const,
  /** Everything about one shop's team. The prefix a shop switch matches. */
  shop: (shopId: string) => ["seller", "team", shopId] as const,

  staff: (shopId: string) => ["seller", "team", shopId, "staff"] as const,
  invitesRoot: (shopId: string) => ["seller", "team", shopId, "invites"] as const,
  invites: (shopId: string, status: InviteListStatus) =>
    ["seller", "team", shopId, "invites", status] as const,
  roles: (shopId: string) => ["seller", "team", shopId, "roles"] as const,
  permissionCatalog: (shopId: string) =>
    ["seller", "team", shopId, "permission-catalog"] as const,

  /** `GET /auth/me` — the resolved permission lists, for every shop at once. */
  access: () => ["seller-team-me", "access"] as const,
  /** `GET /invites/mine/pending` — invitations waiting for my number. */
  myInvites: () => ["seller-team-me", "invites"] as const,
  /** `GET /invites/:token` — the public join-link preview. */
  invitePreview: (token: string) => ["seller-team-me", "invite", token] as const,
};

/* ── wire rows ────────────────────────────────────────────────────────────── */

/** `MembershipStatus` in `prisma/schema.prisma`. Only ACTIVE grants permissions. */
export type MembershipStatus = "INVITED" | "ACTIVE" | "SUSPENDED";

/** `UserStatus`. A DELETED user keeps its membership row until it is removed. */
export type UserStatus = "ACTIVE" | "SUSPENDED" | "DELETED";

/** `InviteStatus`. `list` lazily flips a lapsed PENDING invite to EXPIRED. */
export type InviteStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export type RbacScope = "SHOP" | "PLATFORM";

/**
 * What every staff mutation answers with: the `ShopMembership` row and nothing
 * joined to it.
 *
 * Typed separately from `StaffMember` on purpose. Merging one of these into a
 * loaded roster would blank the `user` and `role` the screen is already drawing,
 * so the mutations refetch — and a type that cannot be mistaken for a roster row
 * is what makes that impossible to forget. There is no `updatedAt` on the model.
 */
export type MembershipRow = {
  id: string;
  userId: string;
  shopId: string;
  roleId: string;
  status: MembershipStatus;
  invitedAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
};

/**
 * One row of `GET …/staff`: the membership plus the two things a team screen
 * cannot render without.
 *
 * `user.phone` is the real number, unmasked. This is the shop's own team and an
 * owner ringing a teammate is the point, so the API sends it in full — which also
 * means a screen must not put it somewhere a customer can see.
 *
 * `role.isPrivileged` is the Owner marker, and it is the single field every
 * predicate in this file reads.
 */
export type StaffMember = MembershipRow & {
  user: { id: string; name: string | null; phone: string; status: UserStatus };
  role: { id: string; name: string; isPrivileged: boolean };
};

/**
 * `InvitesService.toView` — deliberately hash-free: no token, no code.
 *
 * `delivery` is what the last SMS attempt did, verbatim from the provider path
 * (`"sent"` or `` `failed: ${reason}` ``); read it through {@link inviteDelivery}
 * rather than assuming the 201 meant a text message arrived.
 * `attemptsRemaining` counts down from `INVITE_MAX_ATTEMPTS` wrong-code tries.
 * `invitedBy` is a display name, not an id.
 */
export type ShopInvite = {
  id: string;
  scope: RbacScope;
  shopId: string | null;
  phone: string;
  name: string | null;
  note: string | null;
  role: { id: string; name: string };
  status: InviteStatus;
  expiresAt: string;
  lastSentAt: string;
  sendCount: number;
  delivery: string | null;
  attemptsRemaining: number;
  invitedBy: string | null;
  acceptedAt: string | null;
  createdAt: string;
};

/**
 * The half of `create`/`resend` that exists exactly once.
 *
 * The server stores only `tokenHash` and `codeHash`, so this response is the whole
 * lifetime of the plaintext — a screen that does not show it immediately has
 * destroyed a credential the owner may need to read down the counter. On a phone
 * this is the surface's one clear advantage over the console: the owner is
 * standing next to the person being invited, and `link` can go straight into the
 * OS share sheet while `code` is read out loud.
 */
export type InviteShareOnce = { link: string; code: string; expiresAt: string };

/** What `POST …/invites` and `POST …/invites/:id/resend` return. */
export type InviteIssued = { invite: ShopInvite; shareOnce: InviteShareOnce };

/** `GET /invites/:token` — public, masked, and safe to render before sign-in. */
export type InvitePreview = {
  status: InviteStatus;
  scope: RbacScope;
  shop: { id: string; name: string; slug: string } | null;
  role: { id: string; name: string; description: string | null };
  invitedBy: string | null;
  name: string | null;
  note: string | null;
  /** `98•••••210`. The full number is never on this route. */
  phoneMasked: string;
  expiresAt: string;
  /** What the join screen should tell them to do. Always `"phone-otp"`. */
  signInWith: "phone-otp";
};

/** One row of `GET /invites/mine/pending`. Narrower than {@link ShopInvite}. */
export type PendingInvite = {
  id: string;
  scope: RbacScope;
  shop: { id: string; name: string } | null;
  /** The role's *name*, not an object — this payload has no id. */
  role: string;
  note: string | null;
  expiresAt: string;
  /** Always true: accepting from this list needs the code, not the link. */
  requiresCode: true;
};

/** What `POST /invites/accept` answers with. */
export type InviteAccepted = {
  accepted: true;
  scope: RbacScope;
  shopId: string | null;
  /** The role's name. */
  role: string;
  membership:
    | { kind: "shop"; id: string; shopId: string }
    | { kind: "platform"; id: string };
  /** Always true. Permissions have changed, so `/auth/me` has to be re-read. */
  refreshAccess: true;
};

/** A `RolePermission` join row. The key is the permission; there is nothing else. */
export type RolePermission = { roleId: string; permissionKey: string };

/**
 * A `Role` as `GET …/roles` returns it.
 *
 * `isPrivileged` is the Owner marker and its `permissions` rows are *not* the
 * whole story: the guard short-circuits every granular check for it, so treat it
 * as "everything in this scope, including keys added later".
 *
 * `_count.shopMemberships` needs care — see {@link roleMemberScope}.
 */
export type ShopRole = {
  id: string;
  name: string;
  description: string | null;
  scope: RbacScope;
  /** `null` for a shared system template; this shop's id for its own roles. */
  shopId: string | null;
  isSystem: boolean;
  isPrivileged: boolean;
  permissions: RolePermission[];
  createdAt: string;
  updatedAt: string;
  _count: { shopMemberships: number };
};

/** What a role write answers with: the role and its permissions, no `_count`. */
export type ShopRoleRow = Omit<ShopRole, "_count">;

/** One group of `GET …/roles/catalog` — the API's own grouping and order. */
export type PermissionCatalogGroup = {
  group: string;
  permissions: {
    key: string;
    label: string;
    group: string;
    scope: RbacScope;
    description?: string;
  }[];
};

/* ── bodies ───────────────────────────────────────────────────────────────── */

/**
 * `CreateInviteDto`. All four keys, and only these — the pipe runs `whitelist` +
 * `forbidNonWhitelisted`, so a fifth is a 400.
 *
 * `phone` is normalised server-side by `normalizeNepalPhone`, so a local
 * ten-digit number is fine and a screen need not reformat. `roleId` must belong
 * to *this* shop or be a system template, and the Owner role is refused outright
 * — {@link canAssignRole}.
 */
export type InviteCreateBody = {
  phone: string;
  /** Shown on the join screen so the teammate recognises the invitation. */
  name?: string;
  roleId: string;
  /** Free text carried into the SMS, e.g. "you'll handle evening orders". */
  note?: string;
};

/**
 * `CreateRoleDto`. `name` is 2–60 characters, `description` at most 200, and
 * `permissions` is `@ArrayNotEmpty` — a role with no permissions is a 400, not an
 * empty role. Unknown or wrong-scope keys are refused by name.
 */
export type RoleCreateBody = {
  name: string;
  description?: string;
  permissions: string[];
};

/**
 * `UpdateRoleDto`. Omitting `permissions` **keeps** the current set; sending it
 * replaces the lot, because the service deletes and re-creates the join rows in
 * one transaction. There is no partial add or remove, and `[]` is a 400 rather
 * than a way to revoke everyone at once.
 */
export type RoleUpdateBody = {
  name?: string;
  description?: string;
  permissions?: string[];
};

/** `CloneRoleDto`. Omit `name` and the server uses `${source.name} (copy)`. */
export type RoleCloneBody = { name?: string };

/** `@MinLength(2) @MaxLength(60)` on a role's name, and 200 on its description. */
export const ROLE_NAME_LENGTH = { min: 2, max: 60 } as const;
export const ROLE_DESCRIPTION_MAX = 200;
/** `@MaxLength` on `CreateInviteDto`'s two optional fields. */
export const INVITE_NAME_MAX = 80;
export const INVITE_NOTE_MAX = 200;
/** `INVITE_MAX_ATTEMPTS` — wrong-code tries before an invite locks. */
export const INVITE_MAX_ATTEMPTS = 8;
/** `INVITE_TTL_DAYS` — how long a fresh link and code stay good. */
export const INVITE_TTL_DAYS = 7;

/** What `GET …/invites?status=` accepts. The API defaults to PENDING. */
export type InviteListStatus = InviteStatus | "ALL";

export const INVITE_LIST_STATUSES: readonly InviteListStatus[] = [
  "PENDING",
  "ACCEPTED",
  "REVOKED",
  "EXPIRED",
  "ALL",
];

/* ── what the signed-in user may do here ──────────────────────────────────── */

/**
 * The resolved permissions for one shop, in the form a screen checks.
 *
 * **This is a UI affordance. The server remains the authority.** Every route
 * still runs `PermissionsGuard`, and a screen must never take `has()` as
 * permission to skip a request or to act as if a write had succeeded. What it is
 * for is the other direction: not offering a control that would be answered 403,
 * because a button that always fails is worse than no button.
 *
 * `keys` is already *effective*. `RbacService.describe` resolves a privileged
 * role to every key in the scope and then filters the lot through
 * `shopStatusAllows`, so a shop still awaiting approval reports only the
 * set-up keys and a suspended shop only the `.view` ones. That is why
 * `restricted` and `restrictionReason` matter: a missing key here can mean "you
 * were not granted it" *or* "this shop cannot trade yet", and those need
 * completely different sentences. The reason is the server's own, written for the
 * owner to read.
 */
export type ShopPermissions = {
  /** Null when `/auth/me` has not been read yet, or names a shop I am not in. */
  shopId: string | null;
  /** True when my membership's role is the privileged one. */
  owner: boolean;
  /** The shop's lifecycle, which is half of why a key may be absent. */
  status: ShopAccess["status"] | null;
  /** True when the shop's state is withholding keys my role actually grants. */
  restricted: boolean;
  /** The server's sentence for that, or null. Worth rendering verbatim. */
  restrictionReason: string | null;
  /** The effective keys. Empty when I have no active membership here. */
  keys: readonly string[];
  /** The cheap check a screen makes per control. */
  has: (key: string) => boolean;
  /** True when every one of these is held — for a screen gated on two keys. */
  hasAll: (...keys: string[]) => boolean;
  /** True when at least one is held. */
  hasAny: (...keys: string[]) => boolean;
};

/**
 * The permission keys this surface actually gates on, named so a screen cannot
 * misspell one.
 *
 * Worth knowing how coarse the API is here, because it decides what a team screen
 * can offer: reading the roster and the invite list is `team.view`, while
 * *changing a role, suspending, removing, inviting, resending and revoking* are
 * all the single grant `team.invite`. There is nothing finer, so "may invite but
 * may not remove" is not a shape a GoPasal shop can have.
 *
 * `rbac.manage` is separate and stricter than it looks: it guards the role
 * **reads** as well as the writes. A teammate with `team.invite` and no
 * `rbac.manage` can see that somebody is a "Manager" — the name rides on the
 * staff row — but cannot list the roles to move them to a different one, so the
 * role picker has nothing to offer. That is a real hole in the API rather than
 * something to paper over with a guessed list; a screen should say so.
 */
export const TEAM_PERMISSIONS = {
  view: "team.view",
  manageStaff: "team.invite",
  manageRoles: "rbac.manage",
} as const;

/**
 * Pull one shop's access block out of `/auth/me`.
 *
 * `access.shops` carries only shops with an **ACTIVE** membership, so a suspended
 * teammate simply does not appear — which reads as "no permissions here", and is.
 */
export function permissionsFor(
  me: MeResult | null | undefined,
  shopId: string | null | undefined,
): ShopPermissions {
  const access = me && shopId ? (me.access.shops.find((s) => s.shopId === shopId) ?? null) : null;
  const keys: readonly string[] = access?.permissions ?? [];
  const held = new Set(keys);
  const has = (key: string): boolean => held.has(key);

  return {
    shopId: access?.shopId ?? null,
    owner: access?.owner ?? false,
    status: access?.status ?? null,
    restricted: access?.restricted ?? false,
    restrictionReason: access?.restrictionReason ?? null,
    keys,
    has,
    hasAll: (...wanted: string[]) => wanted.every(has),
    hasAny: (...wanted: string[]) => wanted.some(has),
  };
}

/* ── owner protections and the other refusals ─────────────────────────────── */

/** Which guard refused, for a screen that wants to branch rather than read prose. */
export type TeamRefusal =
  | "owner-role-is-fixed"
  | "owner-cannot-be-suspended"
  | "owner-cannot-be-removed"
  | "cannot-promote-to-owner"
  | "role-not-assignable"
  | "already-in-that-state"
  | "system-role-is-a-template"
  | "privileged-role-is-fixed"
  | "role-still-has-members"
  | "invite-already-accepted"
  | "invite-was-revoked"
  | "missing-permission";

/**
 * Whether an action may be attempted, and if not, why — in the API's own words.
 *
 * `reason` is the sentence the server would have answered with, copied rather
 * than paraphrased, so the explanation on a disabled control and the explanation
 * in a red strip cannot say different things. `refusal` is the same fact as a code,
 * for a screen that would rather choose its own wording or its own icon.
 */
export type TeamVerdict =
  | { allowed: true }
  | { allowed: false; refusal: TeamRefusal; reason: string };

const ALLOWED: TeamVerdict = { allowed: true };

const deny = (refusal: TeamRefusal, reason: string): TeamVerdict => ({
  allowed: false,
  refusal,
  reason,
});

/**
 * The owner's own membership cannot be re-roled.
 *
 * Not a nicety: without it any holder of `team.invite` could move the owner to
 * "Order Handler" and lock them out of their own shop.
 * `MembershipsService.changeRole` answers 400 "The owner’s role cannot be
 * changed", pinned by `shop-staff-tenancy.spec.ts`.
 */
export function canChangeMemberRole(member: Pick<StaffMember, "role">): TeamVerdict {
  if (member.role.isPrivileged) {
    return deny("owner-role-is-fixed", "The owner’s role cannot be changed");
  }
  return ALLOWED;
}

/**
 * Nobody can be promoted *into* the privileged role.
 *
 * The other half of the same lockout, read backwards: without it `rbac.manage`
 * would be a self-service path to Owner. The role picker should therefore only
 * offer what {@link assignableRoles} returns.
 *
 * The scope check is here too because the API answers a deliberately opaque 404
 * ("Role not found") for a PLATFORM role and for another shop's private role
 * alike — the distinction would turn the endpoint into a map of the platform's
 * role table. A picker built from `GET …/roles` cannot produce either, so this
 * arm exists to catch a screen that built its list some other way.
 */
export function canAssignRole(role: Pick<ShopRole, "scope" | "isPrivileged">): TeamVerdict {
  if (role.scope !== "SHOP") return deny("role-not-assignable", "Role not found");
  if (role.isPrivileged) return deny("cannot-promote-to-owner", "Cannot promote staff to Owner");
  return ALLOWED;
}

/** The roles a picker may offer: everything listed for this shop bar the Owner. */
export function assignableRoles<T extends Pick<ShopRole, "scope" | "isPrivileged">>(
  roles: readonly T[],
): T[] {
  return roles.filter((role) => canAssignRole(role).allowed);
}

/**
 * Suspend or reactivate.
 *
 * `SetMembershipStatusDto` is `@IsIn(['ACTIVE', 'SUSPENDED'])`, so those two are
 * the whole vocabulary of the route and `INVITED` is a 400. `MembershipStatus`
 * *has* a third member and `ShopMembership.status` defaults to it, but no code
 * path in the API ever writes it — accepting an invite creates the membership
 * ACTIVE, and a *pending* invite is a `StaffInvite` row rather than a placeholder
 * membership. A real roster row is therefore only ever ACTIVE or SUSPENDED, which
 * also means a screen must not describe ACTIVE as "accepted" or "signed in": it
 * means "not suspended", and nothing more.
 *
 * The no-op arm is not pedantry. Suspension is the one team control a screen will
 * render as a switch, and a switch that sends a request when it is already in the
 * asked-for position is how a double tap becomes two writes.
 */
export function canSetMemberStatus(
  member: Pick<StaffMember, "role" | "status">,
  status: "ACTIVE" | "SUSPENDED",
): TeamVerdict {
  if (member.role.isPrivileged) {
    return deny("owner-cannot-be-suspended", "The owner cannot be suspended");
  }
  if (member.status === status) {
    return deny(
      "already-in-that-state",
      status === "SUSPENDED" ? "They are already suspended." : "They are already active.",
    );
  }
  return ALLOWED;
}

/**
 * Removal is a real row delete: the person keeps their GoPasal account and loses
 * this shop, and it cannot be undone — they have to be invited again.
 *
 * `MembershipsService.removeStaff` answers 400 "The owner cannot be removed".
 */
export function canRemoveMember(member: Pick<StaffMember, "role">): TeamVerdict {
  if (member.role.isPrivileged) {
    return deny("owner-cannot-be-removed", "The owner cannot be removed");
  }
  return ALLOWED;
}

/**
 * Editing a role. Both refusals are 403s from `RolesService.mustBeEditable`.
 *
 * A system template is shared by every shop on GoPasal, which is why it is
 * read-only and why the answer names the way out: clone it.
 */
export function canEditRole(role: Pick<ShopRole, "isSystem" | "isPrivileged">): TeamVerdict {
  if (role.isSystem) {
    return deny("system-role-is-a-template", "System roles cannot be edited — clone it first.");
  }
  if (role.isPrivileged) {
    return deny("privileged-role-is-fixed", "Privileged roles cannot be edited.");
  }
  return ALLOWED;
}

/**
 * Deleting a role: editable, and held by nobody.
 *
 * The member check is safe to make here only because the first two arms have
 * already excluded templates: `_count.shopMemberships` on a shop's *own* role
 * counts this shop's people, because a role with a `shopId` cannot be held
 * anywhere else. On a template the same number spans the platform — see
 * {@link roleMemberScope} — and that is the case this never reaches.
 */
export function canDeleteRole(
  role: Pick<ShopRole, "isSystem" | "isPrivileged" | "_count">,
): TeamVerdict {
  const editable = canEditRole(role);
  if (!editable.allowed) return editable;
  if (role._count.shopMemberships > 0) {
    return deny("role-still-has-members", "Reassign the members of this role before deleting it.");
  }
  return ALLOWED;
}

/**
 * Cloning, which is always allowed for a role this shop can see.
 *
 * `RolesService.clone` checks visibility but not editability, so the Owner
 * template can be cloned too — and the copy is never privileged, however
 * privileged the source was. A predicate that refused it would be inventing a
 * rule the API does not have; it exists so a screen has one shape for every
 * control on a role row.
 */
export function canCloneRole(role: Pick<ShopRole, "scope">): TeamVerdict {
  if (role.scope !== "SHOP") return deny("role-not-assignable", "Role not found");
  return ALLOWED;
}

/**
 * What a role's `_count.shopMemberships` is actually counting.
 *
 * For a role this shop owns, it is this shop's people. For a shared system
 * template (`shopId: null`) the same number spans every shop on GoPasal using the
 * template, so printing it as "N people in your shop" would be a fabrication.
 */
export function roleMemberScope(
  role: Pick<ShopRole, "shopId">,
  shopId: string,
): "this-shop" | "platform-wide" {
  return role.shopId === shopId ? "this-shop" : "platform-wide";
}

/** The permission keys a role grants, as a set. Not the whole story if privileged. */
export function rolePermissionKeys(role: Pick<ShopRole, "permissions">): Set<string> {
  return new Set(role.permissions.map((p) => p.permissionKey));
}

/* ── invitations ──────────────────────────────────────────────────────────── */

/**
 * Resending re-rolls **both** secrets and extends the expiry, so anything already
 * handed out stops working. That is the point: the usual reason to resend is
 * "they never got it" or "they read the code wrong", and re-rolling also clears a
 * code somebody has been guessing at.
 *
 * Legal from PENDING and EXPIRED only; the other two answer 400.
 */
export function canResendInvite(invite: Pick<ShopInvite, "status">): TeamVerdict {
  if (invite.status === "ACCEPTED") {
    return deny("invite-already-accepted", "This invite was already accepted.");
  }
  if (invite.status === "REVOKED") {
    return deny("invite-was-revoked", "This invite was revoked. Send a new one instead.");
  }
  return ALLOWED;
}

/**
 * Revoking. Refused only for an accepted invitation, and the message says what to
 * do instead — the person is on the team now, so the control they need is
 * *remove*, not *revoke*.
 */
export function canRevokeInvite(invite: Pick<ShopInvite, "status">): TeamVerdict {
  if (invite.status === "ACCEPTED") {
    return deny(
      "invite-already-accepted",
      "This invite was already accepted — remove the teammate from the team list instead.",
    );
  }
  return ALLOWED;
}

/**
 * Whether the last SMS actually went out — read from `delivery`, never assumed
 * from the 201.
 *
 * `InvitesService.deliver` writes `"sent"` on success and `` `failed: ${reason}` ``
 * on failure, and **returns 201 either way**, because the invitation is valid
 * regardless of whether the text message landed. So "failed" means "hand them the
 * code yourself" rather than "try again", and a screen that reports "invite sent"
 * without reading this is telling the owner something the API did not say. On a
 * phone that is a recoverable failure rather than a dead end: the owner is
 * standing next to the person and can share the link from `shareOnce`.
 *
 * Anything this build has not seen is reported as `unknown` with the raw string,
 * rather than guessed at as a success.
 */
export function inviteDelivery(invite: Pick<ShopInvite, "delivery">): {
  state: "sent" | "failed" | "unknown";
  detail: string | null;
} {
  const d = invite.delivery;
  if (!d) return { state: "unknown", detail: null };
  if (d === "sent") return { state: "sent", detail: null };
  if (d.startsWith("failed")) return { state: "failed", detail: d.replace(/^failed:\s*/, "") };
  // The log transport used in development writes its own prefix and never sends
  // anything, which is a failure to be honest about rather than a third state.
  if (d.startsWith("development")) {
    return { state: "failed", detail: "local SMS delivery is switched off" };
  }
  return { state: "unknown", detail: d };
}

/** True once `expiresAt` has passed. The API flips the row lazily, on the next list. */
export function isInviteLapsed(
  invite: Pick<ShopInvite, "status" | "expiresAt">,
  now: Date = new Date(),
): boolean {
  if (invite.status !== "PENDING") return invite.status === "EXPIRED";
  return new Date(invite.expiresAt).getTime() <= now.getTime();
}

/* ── searching the roster, on the phone ───────────────────────────────────── */

/** What to call someone who has not set a name: their number, never "Unknown". */
export function memberDisplayName(member: {
  user: { name: string | null; phone: string };
}): string {
  const name = member.user.name?.trim();
  return name && name.length > 0 ? name : member.user.phone;
}

/**
 * Case-insensitive match over the fields a team search should cover.
 *
 * Client-side, unlike every other seller list, and that is the *correct*
 * implementation rather than a shortcut. `GET …/staff` takes no `?page`, `?limit`
 * or `?q` because `ShopMembership` does not grow with trade: a row appears only
 * when a person accepts an invitation, and `setStatus` and `removeStaff` prune it
 * — so the ceiling is how many people a shopkeeper has handed keys to. The API
 * returns the roster whole (see `MembershipsService#listStaff`), and filtering a
 * list already in hand needs no round trip and counts the real roster rather than
 * a page. On a phone that is worth more than elsewhere: it works with no signal.
 */
export function staffMatches(member: StaffMember, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return (
    memberDisplayName(member).toLowerCase().includes(q) ||
    member.user.phone.includes(q) ||
    member.role.name.toLowerCase().includes(q)
  );
}

/**
 * The same for an invitation, bounded differently: `GET …/invites` defaults to
 * `status=PENDING` and the service carries `take: 200`, because invites are
 * history — a revoked or expired one stays. So this filters at most 200 rows.
 */
export function inviteMatches(invite: ShopInvite, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return (
    (invite.name ?? "").toLowerCase().includes(q) ||
    invite.phone.includes(q) ||
    invite.role.name.toLowerCase().includes(q)
  );
}

/**
 * The roster split the way a team screen reads it.
 *
 * Owner first, then active staff, then the suspended — because "who can accept
 * orders here right now?" is the question being asked, and a suspended teammate
 * mixed in among the active ones answers it wrongly. Order within each group is
 * the API's (oldest membership first), which is stable across refetches.
 */
export function groupStaff(members: readonly StaffMember[]): {
  owners: StaffMember[];
  active: StaffMember[];
  suspended: StaffMember[];
} {
  const owners: StaffMember[] = [];
  const active: StaffMember[] = [];
  const suspended: StaffMember[] = [];
  for (const member of members) {
    if (member.role.isPrivileged) owners.push(member);
    else if (member.status === "SUSPENDED") suspended.push(member);
    else active.push(member);
  }
  return { owners, active, suspended };
}
