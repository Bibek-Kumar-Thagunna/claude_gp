/**
 * The people in a shop: staff, invitations and roles, as typed calls and hooks.
 *
 * Three controllers on the API, deliberately kept apart, and this module keeps
 * them apart too:
 *
 *  - `apps/api/src/rbac/staff.controller.ts` — `/seller/shops/:shopId/staff`.
 *    Reading is `team.view`; changing a role, suspending and removing are all the
 *    *same* grant, `team.invite`.
 *  - `apps/api/src/modules/invites/invites.shop.controller.ts` —
 *    `/seller/shops/:shopId/invites`, plus the invitee's own side on
 *    `invites.public.controller.ts` (`/invites/*`).
 *  - `apps/api/src/rbac/roles.controller.ts` — `/seller/shops/:shopId/roles`.
 *    Every route is `rbac.manage`, **including the two reads**.
 *
 * Adding a teammate is an invitation, never an insert: the owner names a phone
 * number and a role, GoPasal texts that number a link and a code, and a
 * membership appears only once that person signs in with their own OTP and
 * accepts. There is no "create staff" route, so nothing here pretends there is —
 * and the owner never sets, sees or transmits a password, because there isn't one.
 *
 * Reached as `@gopasal/native-data/seller-team`, and deliberately **not**
 * re-exported from `./index`, for the same reason as the rest of the seller
 * surface: the customer app imports this package.
 *
 * ## Why a phone is the right place for this
 *
 * Inviting somebody is not a desk job. The person being invited is standing at
 * the counter, and the two secrets that make an invitation work exist exactly
 * once, in the response to `create`: `shareOnce.link` can go straight into the OS
 * share sheet and `shareOnce.code` can be read out loud while they are both
 * looking at it. A console does the same thing worse — the owner reads a code off
 * a monitor and types it into a chat app.
 *
 * ## Writes do not go through the outbox
 *
 * Per the note at the top of `./seller.ts`, and here the argument is at its
 * strongest: a queued *suspend* replayed ten minutes later suspends somebody the
 * shopkeeper may by then have reinstated, a queued *remove* deletes a membership
 * that was re-invited in between, and a queued *invite* re-rolls a code the
 * teammate has already used. No seller route reads an `Idempotency-Key`, so a
 * replay lands as a second real request. A failure the shopkeeper can see and
 * retry is the better failure.
 *
 * ## Permissions are an affordance, not a gate
 *
 * {@link useShopPermissions} exists so a control the shopkeeper would be 403'd for
 * is never offered, and {@link canRemoveMember} and its neighbours exist so a
 * control the *server* would refuse is disabled with the server's own explanation.
 * Neither is authority. `PermissionsGuard` still runs on every route, and a screen
 * that treated a local predicate as permission to skip a request or to act as if a
 * write had landed would be wrong.
 */
import * as React from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { MeResult } from "@gopasal/api-client/types";
import { STALE, useGopasal } from "./GopasalProvider";
// The freshness tiers are `./seller`'s, imported rather than re-derived.
import { SELLER_STALE } from "./seller";
// The shop list is `qk`'s, and accepting a SHOP invitation adds a shop to it —
// so this module has to be able to name that one key. Imported from the wire
// companion, which is free of `react-native`.
import { qk } from "./seller-wire";
import {
  TEAM_PERMISSIONS,
  assignableRoles,
  permissionsFor,
  tqk,
  type InviteAccepted,
  type InviteCreateBody,
  type InviteIssued,
  type InviteListStatus,
  type InvitePreview,
  type MembershipRow,
  type PendingInvite,
  type PermissionCatalogGroup,
  type RoleCloneBody,
  type RoleCreateBody,
  type RoleUpdateBody,
  type ShopInvite,
  type ShopPermissions,
  type ShopRole,
  type ShopRoleRow,
  type StaffMember,
} from "./seller-team-wire";

export { tqk } from "./seller-team-wire";

/**
 * The pure half, re-exported so a screen has one import.
 *
 * All of it lives in `./seller-team-wire` because this file cannot be loaded off
 * a phone — it reaches `react-native` through the provider — and the owner
 * protections are exactly the logic that has to be tested rather than trusted.
 */
export {
  INVITE_LIST_STATUSES,
  INVITE_MAX_ATTEMPTS,
  INVITE_NAME_MAX,
  INVITE_NOTE_MAX,
  INVITE_TTL_DAYS,
  ROLE_DESCRIPTION_MAX,
  ROLE_NAME_LENGTH,
  TEAM_PERMISSIONS,
  assignableRoles,
  canAssignRole,
  canChangeMemberRole,
  canCloneRole,
  canDeleteRole,
  canEditRole,
  canRemoveMember,
  canResendInvite,
  canRevokeInvite,
  canSetMemberStatus,
  groupStaff,
  inviteDelivery,
  inviteMatches,
  isInviteLapsed,
  memberDisplayName,
  permissionsFor,
  roleMemberScope,
  rolePermissionKeys,
  staffMatches,
  type InviteAccepted,
  type InviteCreateBody,
  type InviteIssued,
  type InviteListStatus,
  type InvitePreview,
  type InviteShareOnce,
  type InviteStatus,
  type MembershipRow,
  type MembershipStatus,
  type PendingInvite,
  type PermissionCatalogGroup,
  type RbacScope,
  type RoleCloneBody,
  type RoleCreateBody,
  type RolePermission,
  type RoleUpdateBody,
  type ShopInvite,
  type ShopPermissions,
  type ShopRole,
  type ShopRoleRow,
  type StaffMember,
  type TeamRefusal,
  type TeamVerdict,
  type UserStatus,
} from "./seller-team-wire";

const shopBase = (shopId: string) => `/seller/shops/${encodeURIComponent(shopId)}`;

/* ── what this account may do ─────────────────────────────────────────────── */

/**
 * `GET /auth/me` — the account, its memberships, and its resolved permissions for
 * every shop at once.
 *
 * `STALE.mine` because this is the signed-in user's own record: it changes when
 * somebody re-roles them or a shop's lifecycle moves, not minute to minute. The
 * one moment it must be re-read immediately is after accepting an invitation, and
 * {@link useAcceptInvite} invalidates it for exactly that reason — the API says so
 * in the response (`refreshAccess: true`).
 *
 * Cached under its own root rather than under `["seller", …]`: this is an answer
 * about the *user*, so a shop switch must not drop it.
 */
export function useMyAccess() {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: tqk.access(),
    staleTime: STALE.mine,
    enabled: Boolean(user),
    queryFn: () => http.request<MeResult>("/auth/me"),
  });
}

/**
 * What the signed-in user may do at one shop, as a predicate a screen can check
 * per control.
 *
 * **A UI affordance. The server remains the authority** — every route still runs
 * `PermissionsGuard`, and this exists only so a button that would be answered 403
 * is never drawn. `keys` is already the *effective* list: `RbacService.describe`
 * expands a privileged role to every key in the scope and then filters the lot
 * through `shopStatusAllows`, so a shop still awaiting approval reports only the
 * set-up keys and a suspended shop only the `.view` ones. Read `restricted` and
 * `restrictionReason` before telling somebody they lack a permission — the reason
 * may be the shop's state rather than their role, and those need different
 * sentences.
 *
 * `ready` is separate from the permissions themselves because the honest answer
 * while `/auth/me` is in flight is "not known yet", and a screen that treated that
 * as "not permitted" would flash a locked state on every cold start.
 */
export function useShopPermissions(shopId: string | null | undefined): ShopPermissions & {
  /** False while `/auth/me` has not been read. Not the same as "no permissions". */
  ready: boolean;
} {
  const access = useMyAccess();
  const me = access.data ?? null;

  return React.useMemo(
    () => ({ ...permissionsFor(me, shopId), ready: !access.isPending }),
    [me, shopId, access.isPending],
  );
}

/* ── staff ────────────────────────────────────────────────────────────────── */

/**
 * `team.view`. Every membership in the shop, oldest first.
 *
 * **There is no `?page`, `?limit` or `?q`, and that is deliberate on both sides.**
 * Orders, products and reviews are read a page at a time because each grows with
 * trade and nothing prunes them; `ShopMembership` grows only when somebody accepts
 * an invitation and shrinks when they are removed, so the ceiling is a staffing
 * decision rather than a function of volume. The API returns the roster whole —
 * see `MembershipsService#listStaff` — and searching it happens on the device
 * through {@link staffMatches}, which is the correct implementation rather than a
 * leftover: it needs no round trip, it works with no signal, and the count it
 * produces is a count of the real roster rather than of a page.
 *
 * `SELLER_STALE.counter`: a second person with `team.invite` can change this while
 * it is on screen, and a minute is short enough that two people do not work from
 * different pictures for long.
 */
export function useShopStaff(shopId: string | null | undefined) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: tqk.staff(shopId ?? ""),
    staleTime: SELLER_STALE.counter,
    enabled: Boolean(shopId) && Boolean(user),
    queryFn: () => http.request<StaffMember[]>(`${shopBase(shopId!)}/staff`),
  });
}

/**
 * The three things that can be done to a teammate, all `team.invite`.
 *
 * Every one of them answers with a bare `ShopMembership` row — no `user`, no
 * `role` — so nothing is merged: splicing one into the loaded roster would blank
 * the name and the role name already drawn. The list is refetched instead, and
 * {@link MembershipRow} is typed apart from {@link StaffMember} to make that
 * impossible to forget.
 *
 * Before calling any of these, check the matching predicate from the wire
 * companion — {@link canChangeMemberRole}, {@link canSetMemberStatus},
 * {@link canRemoveMember}. They encode the owner protections, so the control can
 * be disabled *and explain why* rather than failing on press.
 */
export function useStaffActions(shopId: string | null | undefined) {
  const { http } = useGopasal();
  const qc = useQueryClient();
  const staffKey = React.useMemo(() => tqk.staff(shopId ?? ""), [shopId]);

  const settle = React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: staffKey });
    // A role's member count is part of whether it can be deleted, and it has
    // just moved.
    void qc.invalidateQueries({ queryKey: tqk.roles(shopId ?? "") });
  }, [qc, staffKey, shopId]);

  return {
    /**
     * Move a membership to a different role.
     *
     * Refused for the owner's own membership and for any privileged *target*
     * role, both 400s. A role id that is not assignable in this shop — a PLATFORM
     * role, or another shop's private role — answers a deliberately opaque 404
     * ("Role not found"), the same as one that does not exist, so the picker must
     * only ever offer what {@link useAssignableRoles} returned.
     */
    changeRole: useMutation({
      mutationFn: (input: { membershipId: string; roleId: string }) =>
        http.request<MembershipRow>(
          `${shopBase(shopId!)}/staff/${encodeURIComponent(input.membershipId)}/role`,
          { method: "PATCH", body: { roleId: input.roleId } },
        ),
      onSettled: settle,
    }),

    /**
     * Suspend or reactivate. `ACTIVE` and `SUSPENDED` are the whole vocabulary of
     * the route; `INVITED` is a 400.
     *
     * Optimistic, and this is the one team control that earns it: a screen will
     * render this as a switch, and a switch that waits for a round trip gets
     * pressed twice — the second press reactivating somebody who was being
     * suspended. Only `status` is patched, so nothing is invented; the rollback
     * puts the row back to exactly the value the server last confirmed, which
     * matters because this really does fail — the owner's membership answers 400
     * "The owner cannot be suspended" even though the switch would have drawn.
     */
    setStatus: useMutation({
      mutationFn: (input: { membershipId: string; status: "ACTIVE" | "SUSPENDED" }) =>
        http.request<MembershipRow>(
          `${shopBase(shopId!)}/staff/${encodeURIComponent(input.membershipId)}/status`,
          { method: "PATCH", body: { status: input.status } },
        ),
      onMutate: async (input) => {
        if (!shopId) return { previous: undefined };
        await qc.cancelQueries({ queryKey: staffKey });
        const previous = qc.getQueryData<StaffMember[]>(staffKey);
        qc.setQueryData<StaffMember[]>(staffKey, (rows) =>
          rows?.map((row) =>
            row.id === input.membershipId ? { ...row, status: input.status } : row,
          ),
        );
        return { previous };
      },
      onError: (_error, _input, context) => {
        if (context?.previous) qc.setQueryData(staffKey, context.previous);
      },
      onSettled: settle,
    }),

    /**
     * A real row delete: the person keeps their GoPasal account and loses this
     * shop. **Not undoable** — they have to be invited again, which means a new
     * SMS and a new code, so a screen should confirm rather than offer this behind
     * a swipe.
     *
     * Not optimistic, for that reason: a row that vanishes and comes back is a
     * worse answer than a row that is still there while the request is in flight.
     */
    remove: useMutation({
      mutationFn: (membershipId: string) =>
        http.request<{ removed: boolean }>(
          `${shopBase(shopId!)}/staff/${encodeURIComponent(membershipId)}`,
          { method: "DELETE" },
        ),
      onSettled: settle,
    }),
  };
}

/* ── invitations: the shop's side ─────────────────────────────────────────── */

/**
 * `team.view`. Invitations for this shop, newest first, capped at 200 server-side.
 *
 * Defaults to `PENDING`, which is what a team screen wants: the others are
 * history, because a revoked or expired invitation is kept rather than pruned.
 * Listing also *settles* expiry — `InvitesService.list` flips a lapsed PENDING row
 * to EXPIRED as it goes — so the status on these rows is current in a way
 * {@link isInviteLapsed} only approximates between reads.
 */
export function useShopInvites(
  shopId: string | null | undefined,
  status: InviteListStatus = "PENDING",
) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: tqk.invites(shopId ?? "", status),
    staleTime: SELLER_STALE.counter,
    enabled: Boolean(shopId) && Boolean(user),
    queryFn: () =>
      http.request<ShopInvite[]>(
        `${shopBase(shopId!)}/invites?status=${encodeURIComponent(status)}`,
      ),
  });
}

/**
 * Creating, resending and revoking an invitation. All `team.invite`.
 *
 * **`create` and `resend` are the only moment the link and the code are
 * readable.** The server holds only `tokenHash` and `codeHash`, and `resend`
 * re-rolls both, so `data.shareOnce` on a settled mutation is the whole lifetime
 * of the plaintext. A screen must show it — or hand it to the share sheet —
 * before the next mutation resets `data`, and must never imply it can be fetched
 * again, because it cannot.
 *
 * **A delivery failure is not a request failure.** `InvitesService.deliver` records
 * `delivery: "sent"` or `` `failed: ${reason}` `` on the invitation and answers 201
 * either way, because the invitation is valid regardless of whether the SMS
 * landed. Read it through {@link inviteDelivery}; a screen that says "invite sent"
 * without doing so is telling the owner something the API did not say. On a phone
 * that failure is recoverable rather than fatal — the owner is next to the person
 * and can share the link directly.
 */
export function useInviteActions(shopId: string | null | undefined) {
  const { http } = useGopasal();
  const qc = useQueryClient();

  // Every status bucket, because an invitation moves between them: revoking takes
  // a row out of PENDING and puts it into REVOKED, and a screen with both tabs
  // loaded would otherwise show it in neither or both.
  const settle = React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: tqk.invitesRoot(shopId ?? "") });
  }, [qc, shopId]);

  return {
    /**
     * Invite a teammate by phone number.
     *
     * Supersedes any live PENDING invitation for the same number — the old one
     * becomes REVOKED — so re-inviting is safe rather than duplicating, and the
     * owner never has to reason about which link is live. Somebody who is already
     * on the team is refused plainly instead of being sent an invitation that
     * would do nothing.
     *
     * `phone` is normalised server-side (`normalizeNepalPhone`), so a local
     * ten-digit number is fine and a screen should not reformat it.
     */
    create: useMutation({
      mutationFn: (body: InviteCreateBody) =>
        http.request<InviteIssued>(`${shopBase(shopId!)}/invites`, { method: "POST", body }),
      onSettled: settle,
    }),

    /**
     * Re-issue an invitation. Re-rolls **both** secrets and extends the expiry, so
     * anything previously handed out stops working — which is the point: the usual
     * reason to resend is "they never got it" or "they read the code wrong", and
     * re-rolling also clears a code somebody has been guessing at. Legal from
     * PENDING and EXPIRED only ({@link canResendInvite}).
     */
    resend: useMutation({
      mutationFn: (inviteId: string) =>
        http.request<InviteIssued>(
          `${shopBase(shopId!)}/invites/${encodeURIComponent(inviteId)}/resend`,
          { method: "POST" },
        ),
      onSettled: settle,
    }),

    /**
     * Revoke a pending invitation. Answers with the invite view alone — there is
     * no secret to reveal. The token hash is kept on purpose, so a revoked link
     * resolves to a clear "no longer valid" rather than a bare 404 the invitee
     * cannot interpret.
     */
    revoke: useMutation({
      mutationFn: (inviteId: string) =>
        http.request<ShopInvite>(
          `${shopBase(shopId!)}/invites/${encodeURIComponent(inviteId)}`,
          { method: "DELETE" },
        ),
      onSettled: settle,
    }),
  };
}

/* ── invitations: the invitee's side ──────────────────────────────────────── */

/**
 * Preview a join link before signing in — `GET /invites/:token`, the one public
 * route on this surface.
 *
 * Public on purpose: the join screen has to be able to say "Ram's Kirana invited
 * you as Order Handler — sign in with 98•••••210" *before* asking anybody to
 * authenticate. It carries no secrets and masks the phone number, and it is rate
 * limited (20 a minute) because a public token lookup is the only enumerable
 * surface here.
 *
 * Sent `anonymous`, which is deliberate rather than incidental: a deep link opened
 * on a phone that is already signed in as somebody else must get the same answer
 * as one opened on a fresh install, and skipping the bearer header also skips a
 * token refresh on the very first screen of the flow.
 *
 * `status` is worth reading before offering *Accept*: a REVOKED or EXPIRED
 * invitation previews perfectly well and then fails on accept, and `scope` must be
 * `"SHOP"` — a PLATFORM invitation belongs in the admin console and cannot be
 * accepted here.
 */
export function useInvitePreview(token: string | null | undefined) {
  const { http } = useGopasal();
  return useQuery({
    queryKey: tqk.invitePreview(token ?? ""),
    staleTime: SELLER_STALE.counter,
    // A minute of `gcTime`, against the provider's default week. The *answer*
    // carries no secret, but the cache key carries the token — and this cache is
    // persisted to AsyncStorage, so a week's default would leave a working join
    // credential in a plain file long after the invitation was accepted.
    gcTime: 60_000,
    enabled: Boolean(token),
    queryFn: () =>
      http.request<InvitePreview>(`/invites/${encodeURIComponent(token!)}`, { anonymous: true }),
  });
}

/**
 * Invitations waiting for the signed-in phone number — the banner after a sign-in.
 *
 * This is the path that matters on a phone, because a link opened in a browser
 * does not reliably come back to the app. Somebody who was texted a code can sign
 * in with their own number and find the invitation here, which is why every row
 * carries `requiresCode: true`: accepting from this list needs the code, not the
 * link.
 */
export function useMyPendingInvites() {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: tqk.myInvites(),
    staleTime: SELLER_STALE.counter,
    enabled: Boolean(user),
    queryFn: () => http.request<PendingInvite[]>("/invites/mine/pending"),
  });
}

/**
 * Accept an invitation, with either the link token or the spoken code.
 *
 * Both arms need a session **on the invited number**: the link alone is never
 * enough, so forwarding it grants nobody anything, and a mismatch is a 403 naming
 * the masked number to sign in with — which is worth showing verbatim, because the
 * real-world cause is a shared phone or a second SIM rather than an attack.
 *
 * `scope: "SHOP"` should be sent on the code path. A link token identifies one
 * exact invitation, but a code is looked up by number, and the same phone can hold
 * invitations to both a shop and the admin console; without the scope this app
 * could accept the wrong one.
 *
 * Accepting changes what this account may do, and the API says so in the response
 * (`refreshAccess: true`). So three things are invalidated: `/auth/me`, the
 * pending list, and — the one that is easy to forget — `qk.shops()`. A SHOP
 * invitation adds a shop to `GET /seller/shops`, which is what the shop switcher
 * renders; without it the teammate accepts an invitation and lands in an app that
 * still believes they have no shop.
 */
export function useAcceptInvite() {
  const { http } = useGopasal();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: { token?: string; code?: string; scope?: "SHOP" | "PLATFORM" }) =>
      http.request<InviteAccepted>("/invites/accept", { method: "POST", body: input }),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: tqk.access() });
      void qc.invalidateQueries({ queryKey: tqk.myInvites() });
      void qc.invalidateQueries({ queryKey: qk.shops() });
      if (result.shopId) {
        void qc.invalidateQueries({ queryKey: tqk.shop(result.shopId) });
      }
    },
  });
}

/* ── roles ────────────────────────────────────────────────────────────────── */

/**
 * `rbac.manage`. This shop's own roles, plus the shared system templates.
 *
 * Two things about this list shape what a screen can do with it. Roles are **per
 * shop**, so there is no cross-shop role view to build. And system templates are
 * shared rows with `shopId: null`: they cannot be edited or deleted, only cloned,
 * and their `_count.shopMemberships` therefore counts memberships across *every*
 * shop using the template rather than this one — see {@link roleMemberScope}.
 *
 * `SELLER_STALE.money`, the longest tier, because a role list is an administrative
 * artefact: it changes when somebody deliberately edits it, and refetching it on
 * every visit to a team screen would spend a seller's data redrawing the same
 * five rows.
 *
 * Note that the **read** needs `rbac.manage`, not `team.view`. A screen should
 * check {@link useShopPermissions} before mounting this, or it will spend a
 * guaranteed 403 on every teammate who can invite but not administer roles.
 */
export function useShopRoles(
  shopId: string | null | undefined,
  options?: {
    /**
     * False stops the request without unmounting the hook — how
     * {@link useAssignableRoles} avoids a guaranteed 403.
     */
    enabled?: boolean;
  },
) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: tqk.roles(shopId ?? ""),
    staleTime: SELLER_STALE.money,
    enabled: Boolean(shopId) && Boolean(user) && options?.enabled !== false,
    queryFn: () => http.request<ShopRole[]>(`${shopBase(shopId!)}/roles`),
  });
}

/**
 * The roles a picker may offer, and an honest answer when it can offer none.
 *
 * Two different empty states hide behind "no roles to choose from", and telling
 * them apart is the whole reason this is a hook rather than a `.filter()` at the
 * call site:
 *
 *  - **`needsRbacManage`** — the account holds `team.invite` but not
 *    `rbac.manage`, so the role list itself is a 403. Inviting somebody needs a
 *    role to invite them *into*, so on this account the invite flow cannot work at
 *    all, and the thing to say is "ask an owner for the roles permission, or ask
 *    them to send the invitation". This is a real gap in the API's permission
 *    split, not something to paper over with a guessed list of role ids.
 *  - **`empty`** — the list loaded and the Owner role was the only thing in it.
 *    Nothing can be assigned until somebody creates or clones a role.
 *
 * The Owner role is filtered out by {@link assignableRoles} because nobody can be
 * promoted into it: `rbac.manage` would otherwise be a self-service path to Owner.
 */
export function useAssignableRoles(shopId: string | null | undefined) {
  const permissions = useShopPermissions(shopId);
  const mayRead = permissions.has(TEAM_PERMISSIONS.manageRoles);

  // The same cache entry as `useShopRoles`, not a parallel one — it is the same
  // question. Not asked for at all without the grant: the alternative is a 403 on
  // every mount for a teammate whose role simply does not include this.
  const roles = useShopRoles(shopId, { enabled: permissions.ready && mayRead });

  const list = roles.data;
  return {
    roles: React.useMemo(() => (list ? assignableRoles(list) : []), [list]),
    /** True when this account cannot read the role list, so cannot invite either. */
    needsRbacManage: permissions.ready && !mayRead,
    /** True when the list loaded and held nothing assignable. */
    empty: Boolean(list) && assignableRoles(list!).length === 0,
    isPending: permissions.ready && mayRead ? roles.isPending : false,
    error: roles.error,
  };
}

/**
 * `rbac.manage`. The grouped permission catalogue the role editor renders.
 *
 * Fetched rather than mirrored, and that is load-bearing: a role editor built from
 * a local copy would offer keys the server rejects with `Unknown permission: …`,
 * or silently omit ones added since this build shipped. The grouping and the order
 * are the API's own (`SHOP_PERMISSIONS`), so what a shop owner reads matches
 * `permissions.catalog.ts` key for key.
 *
 * `STALE.catalog` — it is a compiled-in constant on the server, so the only thing
 * that changes it is a deployment.
 *
 * The API carries no translation and no plain-language hint for a key, only an
 * English label. That gloss is a screen's contribution and is deliberately not
 * invented here; a key this build has never heard of should still be *shown*, with
 * its English label, because a permission that exists but cannot be displayed is a
 * permission nobody can audit.
 */
export function useShopPermissionCatalog(shopId: string | null | undefined) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: tqk.permissionCatalog(shopId ?? ""),
    staleTime: STALE.catalog,
    enabled: Boolean(shopId) && Boolean(user),
    queryFn: () =>
      http.request<PermissionCatalogGroup[]>(`${shopBase(shopId!)}/roles/catalog`),
  });
}

/**
 * Creating, cloning, patching and deleting a role. All `rbac.manage`, all audited
 * server-side so a shop's own team can answer "who changed what access, and when".
 *
 * Every write answers with the role **including** `permissions` but **without**
 * `_count`, so merging one into the loaded list would blank the member count
 * already drawn. The list is refetched instead — {@link ShopRoleRow} is typed
 * apart from {@link ShopRole} to make that visible in the signature.
 *
 * The refusals are all 403s or 400s with sentences worth showing, and all four are
 * knowable in advance: {@link canEditRole}, {@link canDeleteRole},
 * {@link canCloneRole}.
 */
export function useRoleActions(shopId: string | null | undefined) {
  const { http } = useGopasal();
  const qc = useQueryClient();

  const settle = React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: tqk.roles(shopId ?? "") });
  }, [qc, shopId]);

  return {
    /**
     * Always created as a custom, non-privileged shop role.
     *
     * `permissions` is `@ArrayNotEmpty`: a role with no permissions is a 400
     * rather than an empty role, so a screen must require at least one toggle
     * before it enables Save.
     */
    create: useMutation({
      mutationFn: (body: RoleCreateBody) =>
        http.request<ShopRoleRow>(`${shopBase(shopId!)}/roles`, { method: "POST", body }),
      onSettled: settle,
    }),

    /**
     * The one way to get an editable copy of a template — and the copy is never
     * privileged, however privileged the source was. Omit `name` and the server
     * uses `${source.name} (copy)`.
     */
    clone: useMutation({
      mutationFn: (input: { roleId: string; body?: RoleCloneBody }) =>
        http.request<ShopRoleRow>(
          `${shopBase(shopId!)}/roles/${encodeURIComponent(input.roleId)}/clone`,
          { method: "POST", body: input.body ?? {} },
        ),
      onSettled: settle,
    }),

    /**
     * Patch a custom role.
     *
     * Omitting `permissions` **keeps** the current set; sending it replaces the
     * lot, because the service deletes and re-creates the join rows in one
     * transaction. There is no partial add or remove, so a permission editor has
     * to send the whole intended set — and `[]` is refused by `@ArrayNotEmpty`,
     * which is the guard that stops one character of JSON dropping every holder of
     * a role to default-deny while the role keeps its name and its members.
     */
    update: useMutation({
      mutationFn: (input: { roleId: string; body: RoleUpdateBody }) =>
        http.request<ShopRoleRow>(
          `${shopBase(shopId!)}/roles/${encodeURIComponent(input.roleId)}`,
          { method: "PATCH", body: input.body },
        ),
      onSettled: settle,
    }),

    /**
     * Delete a custom role. Refused while anyone still holds it ("Reassign the
     * members of this role before deleting it."), and for templates and the Owner
     * role. {@link canDeleteRole} knows all three, so the control can be disabled
     * with the reason rather than failing on press.
     */
    remove: useMutation({
      mutationFn: (roleId: string) =>
        http.request<{ deleted: boolean }>(
          `${shopBase(shopId!)}/roles/${encodeURIComponent(roleId)}`,
          { method: "DELETE" },
        ),
      onSettled: settle,
    }),
  };
}

/* ── cache plumbing ───────────────────────────────────────────────────────── */

/**
 * Drop everything about one shop's team.
 *
 * Exported because the acceptance of an invitation is not the only thing that can
 * change a roster out from under a screen — a platform suspension of the shop
 * changes every effective permission on it — and a screen that has just learned
 * something like that needs one call rather than four keys.
 */
export function invalidateShopTeam(qc: QueryClient, shopId: string): void {
  void qc.invalidateQueries({ queryKey: tqk.shop(shopId) });
}
