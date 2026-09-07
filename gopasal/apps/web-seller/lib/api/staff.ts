/**
 * Seller team endpoints — the people in a shop, and the invitations that put
 * them there.
 *
 * Two controllers on the API, deliberately kept apart, and this module keeps
 * them apart too:
 *
 * - `apps/api/src/rbac/staff.controller.ts` — `/seller/shops/:shopId/staff`.
 *   Reading is `team.view`; changing a role, suspending and removing are all the
 *   *same* grant, `team.invite`. The API splits nothing finer than that.
 * - `apps/api/src/modules/invites/invites.shop.controller.ts` —
 *   `/seller/shops/:shopId/invites`. Reading is `team.view`; creating, resending
 *   and revoking are `team.invite`.
 *
 * Adding a teammate is an invitation, never an insert: the owner names a phone
 * number and a role, the teammate signs in with their own OTP, and a membership
 * appears only once they accept. There is no "create staff" route, so nothing
 * here pretends there is.
 *
 * Three facts shape every caller:
 *
 * 1. **`create` and `resend` are the only moment the join link and code are
 *    readable.** The server stores hashes (`tokenHash`, `codeHash`) and
 *    `resend` re-rolls both, so a screen that does not show `shareOnce`
 *    immediately has destroyed a credential the owner may need to read out over
 *    the phone. They cannot be recovered afterwards.
 * 2. **A delivery failure is not a request failure.** `InvitesService.deliver`
 *    records `delivery: "sent"` or `` `failed: ${reason}` `` on the invite and
 *    returns 201 either way, because the invite is valid regardless of whether
 *    the SMS landed. A console that reports "invite sent" without reading
 *    `delivery` is telling the owner something the API did not say.
 * 3. **Mutations answer with a bare `ShopMembership` row** — no `user`, no
 *    `role` — so merging one into a loaded list would blank the name and role
 *    already drawn. Refetch instead. {@link MembershipRowWire} is typed to make
 *    that impossible to forget.
 *
 * The owner's own membership is protected server-side: its role cannot be
 * changed, it cannot be suspended and it cannot be removed. That is detectable
 * before the click — `role.isPrivileged` — so those controls are never offered
 * for it rather than failing on press.
 *
 * Fields are typed as Prisma serialises them: `null` for an unset nullable
 * column, never `undefined`. Dates arrive as ISO strings.
 */

import { authedRequest } from "./client";

/* ------------------------------------------------------------------ Wire rows */

/** `MembershipStatus` in `prisma/schema.prisma`. Only ACTIVE grants permissions. */
export type MembershipStatusWire = "INVITED" | "ACTIVE" | "SUSPENDED";

/** `UserStatus`. A DELETED user keeps its membership row until it is removed. */
export type UserStatusWire = "ACTIVE" | "SUSPENDED" | "DELETED";

/** `InviteStatus`. `list` lazily flips a lapsed PENDING invite to EXPIRED. */
export type InviteStatusWire = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

/** What every mutation answers with: the membership row and nothing joined to it. */
export type MembershipRowWire = {
  id: string;
  userId: string;
  shopId: string;
  roleId: string;
  status: MembershipStatusWire;
  invitedAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
};

/**
 * One row of `GET …/staff`: the membership plus the two things a team screen
 * cannot render without — who the person is, and which role they hold.
 *
 * `user.phone` is the real number, not masked. This is the shop's own team and
 * an owner ringing a teammate is the point, so the API sends it in full.
 * `role.isPrivileged` is the Owner marker: that role resolves to every key in
 * the shop and the API refuses to change, suspend or remove its membership.
 */
export type StaffMemberWire = MembershipRowWire & {
  user: { id: string; name: string | null; phone: string; status: UserStatusWire };
  role: { id: string; name: string; isPrivileged: boolean };
};

/**
 * `InvitesService.toView` — deliberately hash-free: no token, no code.
 *
 * `delivery` is what the last SMS attempt did, verbatim from the provider path:
 * `"sent"` or `` `failed: ${reason}` ``. `attemptsRemaining` counts down from 8
 * wrong-code tries. `invitedBy` is a display name, not an id.
 */
export type InviteWire = {
  id: string;
  scope: "SHOP" | "PLATFORM";
  shopId: string | null;
  phone: string;
  name: string | null;
  note: string | null;
  role: { id: string; name: string };
  status: InviteStatusWire;
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
 * `link` is the join URL, `code` the spoken alternative for a teammate with a
 * bad signal. The server holds only hashes of both, so this response is the
 * whole lifetime of the plaintext. Show it, do not store it, and never imply it
 * can be fetched again.
 */
export type InviteShareOnce = { link: string; code: string; expiresAt: string };

/** What `POST …/invites` and `POST …/invites/:id/resend` return. */
export type InviteIssued = { invite: InviteWire; shareOnce: InviteShareOnce };

/* -------------------------------------------------------------------- Bodies */

/**
 * `CreateInviteDto`. The pipe runs `whitelist: true, forbidNonWhitelisted:
 * true`, so one unknown key is a 400 — these are all four of them.
 *
 * `phone` is normalised server-side (`normalizeNepalPhone`), so a local
 * 10-digit number is fine. `roleId` must belong to *this* shop or be a system
 * template; the Owner role is refused outright.
 */
export type InviteCreateBody = {
  phone: string;
  roleId: string;
  /** Shown on the join screen so the teammate recognises the invitation. */
  name?: string;
  /** Free text carried into the SMS, e.g. "you'll handle evening orders". */
  note?: string;
};

/* --------------------------------------------------------------------- Staff */

/**
 * `team.view`. Every membership in the shop, oldest first, INVITED ones included.
 *
 * **There is no `?page`, `?limit` or `?q` here, and that is deliberate on both
 * sides.** Orders, products, reviews and coupons are read a page at a time with a
 * server-side `q`, because those tables grow with trade and nothing prunes them.
 * `ShopMembership` grows only when a shopkeeper invites someone and that person
 * accepts, and it shrinks when they are removed — so the API returns the roster
 * whole (see `MembershipsService#listStaff` for the full reasoning).
 *
 * The consequence for callers: the team screen filters these rows in the browser
 * (`lib/team-view.ts#matchesMember`) and that is the *correct* implementation, not
 * a leftover. Searching a list you already hold in full needs no round trip, and
 * the count it produces is a count of the real roster rather than of a page. Do
 * not "fix" it into a debounced server query unless this route grows one.
 */
export function listShopStaff(shopId: string, signal?: AbortSignal): Promise<StaffMemberWire[]> {
  return authedRequest<StaffMemberWire[]>(`/seller/shops/${encodeURIComponent(shopId)}/staff`, {
    signal,
  });
}

/**
 * `team.invite`. Refused for the owner's membership ("The owner’s role cannot be
 * changed") and for any privileged target role ("Cannot promote staff to
 * Owner"). Answers with a bare row — refetch.
 */
export function changeStaffRole(
  shopId: string,
  membershipId: string,
  roleId: string,
  signal?: AbortSignal,
): Promise<MembershipRowWire> {
  return authedRequest<MembershipRowWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/staff/${encodeURIComponent(membershipId)}/role`,
    { method: "PATCH", body: { roleId }, signal },
  );
}

/**
 * `team.invite`. `SetMembershipStatusDto` is `@IsIn(['ACTIVE', 'SUSPENDED'])`, so
 * those two are the whole vocabulary of this route and anything else is a 400.
 *
 * `MembershipStatus` has a third member, `INVITED`, and `ShopMembership.status`
 * defaults to it — but **no code path in the API ever writes it**. Accepting an
 * invite creates the membership `'ACTIVE'` (`invites.service.ts`), and so does
 * claiming a shop's owner membership (`shops.service.ts`); a *pending* invite is a
 * `StaffInvite` row, not a placeholder membership. So a real roster row is only
 * ever ACTIVE or SUSPENDED, and a screen must not describe ACTIVE as "accepted" or
 * "signed in" — it means "not suspended" and nothing more.
 */
export function setStaffStatus(
  shopId: string,
  membershipId: string,
  status: "ACTIVE" | "SUSPENDED",
  signal?: AbortSignal,
): Promise<MembershipRowWire> {
  return authedRequest<MembershipRowWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/staff/${encodeURIComponent(membershipId)}/status`,
    { method: "PATCH", body: { status }, signal },
  );
}

/**
 * `team.invite`. A real row delete: the person keeps their GoPasal account and
 * loses this shop. Not undoable — they must be invited again.
 */
export function removeStaffMember(
  shopId: string,
  membershipId: string,
  signal?: AbortSignal,
): Promise<{ removed: boolean }> {
  return authedRequest<{ removed: boolean }>(
    `/seller/shops/${encodeURIComponent(shopId)}/staff/${encodeURIComponent(membershipId)}`,
    { method: "DELETE", signal },
  );
}

/* ------------------------------------------------------------------- Invites */

/** What `GET …/invites` accepts. The API defaults to `PENDING` when omitted. */
export type InviteListStatus = InviteStatusWire | "ALL";

/** `team.view`. Newest first, capped at 200 rows server-side. */
export function listShopInvites(
  shopId: string,
  status: InviteListStatus = "PENDING",
  signal?: AbortSignal,
): Promise<InviteWire[]> {
  return authedRequest<InviteWire[]>(
    `/seller/shops/${encodeURIComponent(shopId)}/invites?status=${encodeURIComponent(status)}`,
    { signal },
  );
}

/**
 * `team.invite`. Supersedes any live PENDING invite for the same number (the old
 * one becomes REVOKED), so re-inviting is safe rather than duplicating.
 *
 * Read `shareOnce` on the way past: this is the only time it exists.
 */
export function createShopInvite(
  shopId: string,
  body: InviteCreateBody,
  signal?: AbortSignal,
): Promise<InviteIssued> {
  return authedRequest<InviteIssued>(`/seller/shops/${encodeURIComponent(shopId)}/invites`, {
    method: "POST",
    body,
    signal,
  });
}

/**
 * `team.invite`. Re-rolls **both** secrets and extends the expiry, so anything
 * previously handed out stops working. That is the point: the usual reason to
 * resend is "they never got it" or "they read the code wrong".
 */
export function resendShopInvite(
  shopId: string,
  inviteId: string,
  signal?: AbortSignal,
): Promise<InviteIssued> {
  return authedRequest<InviteIssued>(
    `/seller/shops/${encodeURIComponent(shopId)}/invites/${encodeURIComponent(inviteId)}/resend`,
    { method: "POST", signal },
  );
}

/** `team.invite`. Returns the invite view alone — there is no secret to reveal. */
export function revokeShopInvite(
  shopId: string,
  inviteId: string,
  signal?: AbortSignal,
): Promise<InviteWire> {
  return authedRequest<InviteWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/invites/${encodeURIComponent(inviteId)}`,
    { method: "DELETE", signal },
  );
}
