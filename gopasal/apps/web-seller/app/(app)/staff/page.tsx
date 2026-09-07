"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Users,
  UserPlus,
  X,
  Search,
  ShieldCheck,
  Store,
  RefreshCw,
  Copy,
  Check,
  Send,
  Ban,
  Trash2,
  PauseCircle,
  PlayCircle,
  Clock,
  MailWarning,
} from "lucide-react";
import { ApiError } from "@gopasal/api-client";
import { useAuth } from "@/components/auth-provider";
import { useShops } from "@/components/shop-provider";
import { ShopScopeState, scopeShopIds, useShopScope } from "@/components/ShopScope";
import { PageHeader, Card, Button, Badge, EmptyState } from "@/components/primitives";
import { StatCard } from "@/components/StatCard";
import { PermissionGate } from "@/components/PermissionGate";
import { ErrorPanel, InlineError, InlineNotice, SkeletonRows, Spinner } from "@/components/states";
import { cn } from "@/lib/cn";
import { num, ago } from "@/lib/format";
import { useEscape } from "@/lib/use-escape";
import { asApiError } from "@/lib/api/client";
import {
  changeStaffRole,
  createShopInvite,
  listShopInvites,
  listShopStaff,
  removeStaffMember,
  resendShopInvite,
  revokeShopInvite,
  setStaffStatus,
  type InviteIssued,
  type InviteWire,
  type StaffMemberWire,
} from "@/lib/api/staff";
import { listShopRoles, type ShopRoleWire } from "@/lib/api/roles";
import {
  INVITE_STATUS,
  MEMBERSHIP_STATUS,
  displayName,
  initials,
  inviteDelivery,
  matchesInvite,
  matchesMember,
  untilLabel,
} from "@/lib/team-view";

/**
 * The team, as two API surfaces the seller experiences as one screen.
 *
 * People come from `GET /seller/shops/:shopId/staff` and invitations from
 * `GET …/invites` — two controllers, two permissions, deliberately not merged
 * into a single list here either, because they are different things: a
 * membership is someone who has an account, an invite is a phone number that has
 * been sent a code.
 *
 * Four API facts shape everything below.
 *
 * 1. **Reading is `team.view`; every change is `team.invite`.** The API splits
 *    nothing finer, so the role picker, suspend, restore and remove all appear
 *    or vanish together — per shop, checked with `canInShop`, because a seller
 *    can hold `team.invite` on one shop and not on another.
 * 2. **Listing roles needs `rbac.manage`.** Changing someone's role only needs
 *    `team.invite`, but there is no route that will enumerate the roles to
 *    choose from without `rbac.manage`. Rather than assemble a half-list from
 *    the role names visible on staff rows, the picker is offered only where both
 *    grants are held, and says why when it is not.
 * 3. **The join link and code exist exactly once.** `create` and `resend` return
 *    them; the server keeps only hashes. They are shown immediately, in full,
 *    with the plain statement that they cannot be fetched again.
 * 4. **A failed SMS is still a valid invite.** The API answers 201 with
 *    `delivery: "failed: …"`, so this screen reports what `delivery` says
 *    instead of announcing "invite sent" on the strength of the status code.
 *
 * Mutations answer with a bare `ShopMembership` — no user, no role — so nothing
 * is merged into the loaded list. Every write refetches.
 */

export default function StaffPage() {
  return (
    <PermissionGate perm="team.view">
      <StaffInner />
    </PermissionGate>
  );
}

/**
 * One shop's answer to `GET …/roles`.
 *
 * The three states are deliberately distinct. No entry at all means the account
 * holds no `rbac.manage` on that shop, so the request was never sent. An entry
 * carrying an `error` means it was sent and failed. An entry with neither is a
 * real answer. Collapsing the middle case into an empty array — which is what
 * this screen used to do — makes a failed read indistinguishable from a shop with
 * nothing to assign, and the screen then explains it as a missing permission.
 */
type RoleRead = { roles: ShopRoleWire[]; error: ApiError | null };

/** A shop this seller may invite into, with whatever the role read produced. */
type InviteTarget = {
  shopId: string;
  shopName: string;
  roles: ShopRoleWire[];
  /** Non-null when this shop's role list could not be read; `roles` is then empty. */
  rolesError: ApiError | null;
};

function StaffInner() {
  const { canInShop } = useAuth();
  const { activeShopId, activeShop, shopById } = useShops();

  const [members, setMembers] = React.useState<StaffMemberWire[]>([]);
  const [invites, setInvites] = React.useState<InviteWire[]>([]);
  const [rolesByShop, setRolesByShop] = React.useState<Record<string, RoleRead>>({});
  /** Bumped by Refresh so the role reads re-run too, not just the staff list. */
  const [rolesNonce, setRolesNonce] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [acting, setActing] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"people" | "invites">("people");
  const [q, setQ] = React.useState("");
  const [inviting, setInviting] = React.useState(false);
  const [issued, setIssued] = React.useState<InviteIssued | null>(null);

  /*
    Ask only the shops whose team this seller may read. A shop that is missing
    the grant is an absent row, never a 403 that takes the whole screen down.
    `useShopScope` also keeps a shop list that is still loading, or that failed to
    load, from being reported as a missing grant.
  */
  const scope = useShopScope("team.view");
  const readableShopIds = scopeShopIds(scope);
  const idsKey = readableShopIds.join(",");

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      const ids = idsKey ? idsKey.split(",") : [];
      if (ids.length === 0) {
        setMembers([]);
        setInvites([]);
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
      try {
        const [staffPages, invitePages] = await Promise.all([
          Promise.all(ids.map((id) => listShopStaff(id, signal))),
          Promise.all(ids.map((id) => listShopInvites(id, "PENDING", signal))),
        ]);
        if (signal?.aborted) return;
        setMembers(staffPages.flat());
        setInvites(invitePages.flat());
        setError(null);
      } catch (err) {
        if (signal?.aborted) return;
        setError(asApiError(err));
        setMembers([]);
        setInvites([]);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [idsKey],
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  /*
    `GET …/roles` is `rbac.manage`, so the role list is loaded per shop and only
    where that grant is held. A shop missing it simply has no entry here, which
    is what makes the picker disappear rather than fail on press.
  */
  const roleShopIds = React.useMemo(
    () => readableShopIds.filter((id) => canInShop(id, "rbac.manage")),
    [readableShopIds, canInShop],
  );
  const roleIdsKey = roleShopIds.join(",");

  React.useEffect(() => {
    const ctrl = new AbortController();
    const ids = roleIdsKey ? roleIdsKey.split(",") : [];
    if (ids.length === 0) {
      setRolesByShop({});
      return;
    }
    void Promise.all(
      ids.map((id) =>
        listShopRoles(id, ctrl.signal)
          .then((roles) => [id, { roles, error: null }] as const)
          // The failure is kept rather than swallowed. It is what lets a member row
          // say "this list could not be read" instead of showing a role label with
          // no picker and no explanation, which is how a failed read used to look.
          .catch((err: unknown) => [id, { roles: [], error: asApiError(err) }] as const),
      ),
    ).then((pairs) => {
      if (!ctrl.signal.aborted) setRolesByShop(Object.fromEntries(pairs));
    });
    return () => ctrl.abort();
  }, [roleIdsKey, rolesNonce]);

  /**
   * True while a shop we are allowed to read roles for has not answered yet.
   *
   * Derived rather than held: every shop in `roleShopIds` ends up with an entry,
   * successful or failed, so a missing key is precisely "still in flight". Without
   * this the invite notice below asserts a missing permission during the first
   * render of a fully-permitted account.
   */
  const rolesPending = roleShopIds.some((id) => !(id in rolesByShop));

  /** Every write answers with a bare row, so the list is re-read, never patched. */
  const runAction = React.useCallback(
    async (id: string, fn: () => Promise<unknown>) => {
      setActing(id);
      setActionError(null);
      try {
        await fn();
        await load();
      } catch (err) {
        setActionError(
          err instanceof ApiError ? err.message : "That didn’t go through. Please try again.",
        );
      } finally {
        setActing(null);
        setConfirming(null);
      }
    },
    [load],
  );

  /** Shops this seller may invite into, whether or not a role list came back. */
  const inviteTargets = React.useMemo<InviteTarget[]>(
    () =>
      readableShopIds
        .filter((id) => canInShop(id, "team.invite"))
        .map((id) => ({
          shopId: id,
          shopName: shopById(id)?.name ?? id,
          roles: (rolesByShop[id]?.roles ?? []).filter((r) => !r.isPrivileged),
          rolesError: rolesByShop[id]?.error ?? null,
        })),
    [readableShopIds, canInShop, shopById, rolesByShop],
  );
  const invitableTargets = inviteTargets.filter((t) => t.roles.length > 0);
  const canInviteSomewhere = inviteTargets.length > 0;
  /** The first role read that failed on a shop this seller could otherwise invite into. */
  const inviteRolesError = inviteTargets.find((t) => t.rolesError)?.rolesError ?? null;
  /** Whether any invitable shop answered its role list at all — i.e. holds `rbac.manage`. */
  const anyInviteRolesReadable = inviteTargets.some((t) => t.shopId in rolesByShop);

  const query = q.trim();
  const people = members.filter((m) => matchesMember(m, query));
  const pending = invites.filter((i) => matchesInvite(i, query));

  const activeCount = members.filter((m) => m.status === "ACTIVE").length;
  const rolesInUse = new Set(members.map((m) => m.roleId)).size;

  /**
   * Whether the four cards below are counting anything yet.
   *
   * Unlike the catalogue and review screens there is no server-side summary here —
   * these are tallies of the rows that were fetched. Before the first answer, or
   * after a failed one, every tally is zero, which reads as a shop with no staff
   * and no pending invitations. It is not zero, it is not yet known.
   */
  const countsKnown =
    scope.kind === "ready" && !error && !(loading && members.length === 0 && invites.length === 0);
  const stat = (value: number) => (countsKnown ? num(value) : "—");

  return (
    <div>
      <PageHeader
        icon={<Users className="h-5 w-5" />}
        title="Staff"
        subtitle={
          activeShop
            ? [activeShop.name, activeShop.area].filter(Boolean).join(" · ")
            : `Your team across ${readableShopIds.length} shop${readableShopIds.length === 1 ? "" : "s"}`
        }
        actions={
          <>
            {/* Refresh re-reads the role lists as well. It did not, which meant a
                shop whose roles had failed to load stayed broken for the whole
                visit however many times the button was pressed. */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setRolesNonce((n) => n + 1);
                void load();
              }}
              disabled={loading}
            >
              {loading ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Refresh
            </Button>
            {canInviteSomewhere && (
              <Button size="sm" onClick={() => setInviting(true)}>
                <UserPlus className="h-4 w-4" /> Invite staff
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <StatCard label="Team members" value={stat(members.length)} icon={Users} tone="crimson" />
        {/* `MembershipStatus.ACTIVE` means "not suspended". It is not a sign-in
            record — nothing on a membership says when, or whether, the person last
            opened the console — so the old "Signed in" label was reading a fact the
            row does not carry. */}
        <StatCard
          label="Not suspended"
          value={stat(activeCount)}
          icon={Check}
          tone="green"
          hint="Can use the console today"
        />
        <StatCard
          label="Invites waiting"
          value={stat(invites.length)}
          icon={UserPlus}
          tone="blue"
          hint="Sent, not yet accepted"
        />
        <StatCard
          label="Roles in use"
          value={stat(rolesInUse)}
          icon={ShieldCheck}
          tone="marigold"
        />
      </div>

      {/* Three different reasons an invitation cannot be completed, and the screen
          has to name the right one. It used to name the permission for all of them,
          including while the role reads were still in flight and when one had just
          failed — telling a seller who holds “manage roles & permissions” that they
          do not. `rolesPending` keeps the notice quiet until there is an answer. */}
      {canInviteSomewhere &&
        invitableTargets.length === 0 &&
        !rolesPending &&
        (inviteRolesError ? (
          <InlineError
            className="mt-4"
            message={`Inviting someone needs a role to invite them into, and the role list could not be read. ${inviteRolesError.message}`}
          />
        ) : !anyInviteRolesReadable ? (
          <InlineNotice
            className="mt-4"
            message="Inviting someone needs a role to invite them into, and reading the role list needs the “manage roles & permissions” permission — which this account doesn’t have on any shop. Ask an owner for it, or ask them to send the invitation."
          />
        ) : (
          <InlineNotice
            className="mt-4"
            message="Inviting someone needs a role to invite them into, and there isn’t one yet that can be given to a new member. Create one under Roles & permissions first."
          />
        ))}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5 rounded-xl bg-ink-100 p-1">
          {(
            [
              ["people", `People (${stat(members.length)})`],
              ["invites", `Invitations (${stat(invites.length)})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              // Which tab is showing was white-background-only, which a screen reader
              // cannot see. The console's other segmented controls already say it.
              aria-pressed={tab === id}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                tab === id ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone or role"
            className="h-10 w-full rounded-xl border border-ink-200 pl-9 pr-3 text-sm outline-none focus:border-crimson-300 sm:w-72"
          />
        </div>
      </div>

      {actionError && <InlineError message={actionError} className="mt-4" />}

      <div className="mt-4 space-y-2.5">
        {loading && members.length === 0 && invites.length === 0 ? (
          <SkeletonRows rows={4} />
        ) : error ? (
          <ErrorPanel
            title="Couldn’t load your team"
            message={error.message}
            offline={error.offline}
            onRetry={() => void load()}
          />
        ) : scope.kind !== "ready" ? (
          <ShopScopeState
            scope={scope}
            what="your team"
            permLabel="view team"
            icon={<Users className="h-6 w-6" />}
          />
        ) : tab === "people" ? (
          people.length === 0 ? (
            <Card className="p-0">
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title={members.length === 0 ? "Only you so far" : "Nothing matches"}
                description={
                  members.length === 0
                    ? "Invite someone by phone number — they join by signing in with their own code."
                    : "Try clearing the search."
                }
                action={
                  members.length === 0 && invitableTargets.length > 0 ? (
                    <Button onClick={() => setInviting(true)}>Invite staff</Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            people.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                shopName={activeShopId === null ? shopById(m.shopId)?.name : undefined}
                roles={(rolesByShop[m.shopId]?.roles ?? []).filter((r) => !r.isPrivileged)}
                rolesError={rolesByShop[m.shopId]?.error ?? null}
                canManage={canInShop(m.shopId, "team.invite")}
                canSeeRoles={canInShop(m.shopId, "rbac.manage")}
                busy={acting === m.id}
                confirming={confirming === m.id}
                onConfirm={() => setConfirming(m.id)}
                onCancelConfirm={() => setConfirming(null)}
                onRole={(roleId) =>
                  void runAction(m.id, () => changeStaffRole(m.shopId, m.id, roleId))
                }
                onStatus={(status) =>
                  void runAction(m.id, () => setStaffStatus(m.shopId, m.id, status))
                }
                onRemove={() => void runAction(m.id, () => removeStaffMember(m.shopId, m.id))}
              />
            ))
          )
        ) : pending.length === 0 ? (
          <Card className="p-0">
            <EmptyState
              icon={<UserPlus className="h-6 w-6" />}
              title={invites.length === 0 ? "No invitations waiting" : "Nothing matches"}
              description={
                invites.length === 0
                  ? "Invitations appear here until they are accepted, revoked or expire."
                  : "Try clearing the search."
              }
            />
          </Card>
        ) : (
          pending.map((i) => (
            <InviteRow
              key={i.id}
              invite={i}
              shopName={activeShopId === null && i.shopId ? shopById(i.shopId)?.name : undefined}
              canManage={i.shopId !== null && canInShop(i.shopId, "team.invite")}
              busy={acting === i.id}
              onResend={() =>
                void runAction(i.id, async () => {
                  if (!i.shopId) return;
                  setIssued(await resendShopInvite(i.shopId, i.id));
                })
              }
              onRevoke={() =>
                void runAction(i.id, () => {
                  if (!i.shopId) return Promise.resolve();
                  return revokeShopInvite(i.shopId, i.id);
                })
              }
            />
          ))
        )}
      </div>

      <AnimatePresence>
        {inviting && (
          <InviteDrawer
            targets={invitableTargets}
            unreadableShops={inviteTargets.filter((t) => t.rolesError).map((t) => t.shopName)}
            preferredShopId={activeShopId}
            onClose={() => setInviting(false)}
            onIssued={(result) => {
              setInviting(false);
              setIssued(result);
              void load();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {issued && <ShareOnceDialog issued={issued} onClose={() => setIssued(null)} />}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ One person */

function MemberRow({
  member: m,
  shopName,
  roles,
  rolesError,
  canManage,
  canSeeRoles,
  busy,
  confirming,
  onConfirm,
  onCancelConfirm,
  onRole,
  onStatus,
  onRemove,
}: {
  member: StaffMemberWire;
  shopName?: string | undefined;
  roles: ShopRoleWire[];
  /** Non-null when this shop's role list could not be read; `roles` is then empty. */
  rolesError: ApiError | null;
  canManage: boolean;
  canSeeRoles: boolean;
  busy: boolean;
  confirming: boolean;
  onConfirm: () => void;
  onCancelConfirm: () => void;
  onRole: (roleId: string) => void;
  onStatus: (status: "ACTIVE" | "SUSPENDED") => void;
  onRemove: () => void;
}) {
  const status = MEMBERSHIP_STATUS[m.status];
  /*
    The API protects the owner's own membership from every one of these three
    calls, and `role.isPrivileged` says so before the click — so the controls are
    never offered for it rather than failing on press.
  */
  const editable = canManage && !m.role.isPrivileged;

  return (
    <Card className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink-100 text-sm font-bold text-ink-500">
          {initials(m.user.name, m.user.phone)}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-ink-900">{displayName(m)}</span>
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
            {m.role.isPrivileged && <Badge tone="crimson">Owner</Badge>}
            {m.user.status !== "ACTIVE" && (
              <Badge tone="red">Account {m.user.status.toLowerCase()}</Badge>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-400">
            <span>{m.user.phone}</span>
            <span>·</span>
            <span>joined {ago(m.acceptedAt ?? m.createdAt)}</span>
            {shopName && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Store className="h-3 w-3" /> {shopName}
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {editable && roles.length > 0 ? (
          <select
            value={m.roleId}
            disabled={busy}
            onChange={(e) => onRole(e.target.value)}
            aria-label={`Role for ${displayName(m)}`}
            className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-sm font-medium text-ink-700 outline-none focus:border-crimson-300 disabled:opacity-50"
          >
            {/* The member's current role may be one this list does not contain —
                a system template, or a role since deleted — so it is offered
                explicitly rather than silently re-pointed by the browser. */}
            {roles.some((r) => r.id === m.roleId) ? null : (
              <option value={m.roleId}>{m.role.name}</option>
            )}
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-700">
            <ShieldCheck className="h-3.5 w-3.5 text-ink-400" />
            {m.role.name}
          </span>
        )}

        {/* Why the picker above is missing. All three reasons produce an empty
            `roles`, and the row used to explain only one of them — so a failed read
            and a shop with nothing assignable both showed a bare role label with no
            word about either. The colour matches the remove-confirmation line
            below rather than introducing a panel per row. */}
        {editable &&
          roles.length === 0 &&
          (rolesError ? (
            <span className="text-xs font-medium text-[#c02636]">
              This shop’s roles couldn’t be read, so the role can’t be changed here yet.{" "}
              {rolesError.message}
            </span>
          ) : canSeeRoles === false ? (
            <span className="text-xs text-ink-400">
              Changing the role needs the “manage roles” permission
            </span>
          ) : (
            <span className="text-xs text-ink-400">
              No other role can be assigned — create one under Roles &amp; permissions
            </span>
          ))}

        {editable &&
          (confirming ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-xs font-medium text-[#c02636]">
                Remove from the shop? They keep their account.
              </span>
              <Button variant="danger" size="sm" disabled={busy} onClick={onRemove}>
                {busy ? <Spinner /> : <Trash2 className="h-4 w-4" />} Remove
              </Button>
              <Button variant="ghost" size="sm" onClick={onCancelConfirm}>
                Keep
              </Button>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              {m.status === "SUSPENDED" ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => onStatus("ACTIVE")}
                >
                  {busy ? <Spinner /> : <PlayCircle className="h-4 w-4" />} Restore
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => onStatus("SUSPENDED")}
                >
                  {busy ? <Spinner /> : <PauseCircle className="h-4 w-4" />} Suspend
                </Button>
              )}
              <button
                type="button"
                onClick={onConfirm}
                aria-label={`Remove ${displayName(m)}`}
                className="rounded-lg p-2 text-ink-400 hover:bg-red-50 hover:text-[#c02636]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </span>
          ))}
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- One invitation */

function InviteRow({
  invite: i,
  shopName,
  canManage,
  busy,
  onResend,
  onRevoke,
}: {
  invite: InviteWire;
  shopName?: string | undefined;
  canManage: boolean;
  busy: boolean;
  onResend: () => void;
  onRevoke: () => void;
}) {
  const status = INVITE_STATUS[i.status];
  const delivery = inviteDelivery(i);

  return (
    <Card className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-ink-400">
          <UserPlus className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-ink-900">{i.name ?? i.phone}</span>
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
            {delivery.state === "failed" && (
              <Badge tone="red">
                <MailWarning className="h-3 w-3" /> SMS didn’t send
              </Badge>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-400">
            <span>{i.phone}</span>
            <span>·</span>
            <span>{i.role.name}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> expires {untilLabel(i.expiresAt)}
            </span>
            {i.sendCount > 1 && (
              <>
                <span>·</span>
                <span>sent {num(i.sendCount)}×</span>
              </>
            )}
            {shopName && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Store className="h-3 w-3" /> {shopName}
                </span>
              </>
            )}
          </p>
          {delivery.state === "failed" && (
            <p className="mt-1.5 text-xs text-[#c02636]">
              The invitation is valid — the message just didn’t reach them
              {delivery.detail ? ` (${delivery.detail})` : ""}. Resend to get a fresh code you can
              read out yourself.
            </p>
          )}
        </div>
      </div>

      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-400">
            {num(i.attemptsRemaining)} code {i.attemptsRemaining === 1 ? "try" : "tries"} left
          </span>
          <Button variant="outline" size="sm" disabled={busy} onClick={onResend}>
            {busy ? <Spinner /> : <Send className="h-4 w-4" />} Resend
          </Button>
          <Button variant="danger" size="sm" disabled={busy} onClick={onRevoke}>
            <Ban className="h-4 w-4" /> Revoke
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------- Invite a teammate */

/**
 * `CreateInviteDto`'s own bounds, mirrored so a long paste is stopped at the field
 * instead of coming back as a 400 in the middle of sending an invitation.
 * `apps/api/src/modules/invites/dto/invites.dto.ts` is the enforcing copy.
 */
const INVITE_NAME_MAX = 80;
const INVITE_NOTE_MAX = 200;

/**
 * The invite form is one shop at a time, because an invitation is one shop's
 * membership: `POST /seller/shops/:shopId/invites` takes a single `roleId` that
 * must belong to that shop. There is no multi-shop invite route, so no
 * multi-shop picker.
 */
function InviteDrawer({
  targets,
  unreadableShops,
  preferredShopId,
  onClose,
  onIssued,
}: {
  targets: InviteTarget[];
  /**
   * Names of shops left out of the picker because their role list could not be
   * read. Without saying so the drawer silently omits a shop the seller may in
   * fact invite into, which reads as "you cannot".
   */
  unreadableShops: string[];
  preferredShopId: string | null;
  onClose: () => void;
  onIssued: (issued: InviteIssued) => void;
}) {
  const initial =
    targets.find((t) => t.shopId === preferredShopId) ?? targets[0] ?? null;
  const [shopId, setShopId] = React.useState(initial?.shopId ?? "");
  const [phone, setPhone] = React.useState("");
  const [name, setName] = React.useState("");
  const [note, setNote] = React.useState("");
  const [roleId, setRoleId] = React.useState(initial?.roles[0]?.id ?? "");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  useEscape(onClose);

  const target = targets.find((t) => t.shopId === shopId) ?? null;
  const digits = phone.replace(/\D/g, "");
  const canSave = digits.length >= 10 && roleId.length > 0 && shopId.length > 0 && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    setErr(null);
    try {
      /*
        Only the four keys `CreateInviteDto` whitelists are sent — the pipe runs
        `forbidNonWhitelisted`, so a fifth would be a 400. Blank optional fields
        are omitted rather than sent as "".
      */
      const issued = await createShopInvite(shopId, {
        phone: digits,
        roleId,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onIssued(issued);
    } catch (error) {
      setErr(
        error instanceof ApiError
          ? error.message
          : "The invitation didn’t go through. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 z-50 bg-ink-900/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        // The backdrop is a mouse convenience, not content: Escape is the keyboard
        // equivalent, and the Close button below is the visible one.
        aria-hidden
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-staff-title"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl"
        initial={{ x: 40, opacity: 0.6 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={{ type: "tween", duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 id="invite-staff-title" className="text-lg font-bold text-ink-900">
            Invite staff
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-ink-500 hover:bg-ink-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="gp-scroll flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <InlineNotice message="They join by signing in on their own phone with a one-time code. Nothing is created on their behalf, and nothing is granted until they accept." />

          {err && <InlineError message={err} />}

          {unreadableShops.length > 0 && (
            <InlineError
              message={`${unreadableShops.join(", ")} ${unreadableShops.length === 1 ? "is" : "are"} missing from this list because ${unreadableShops.length === 1 ? "its" : "their"} role list couldn’t be read. Close this and press Refresh to try again.`}
            />
          )}

          {targets.length > 1 && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-700">Shop</span>
              <select
                value={shopId}
                onChange={(e) => {
                  const next = targets.find((t) => t.shopId === e.target.value);
                  setShopId(e.target.value);
                  setRoleId(next?.roles[0]?.id ?? "");
                }}
                className="h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm outline-none focus:border-crimson-300"
              >
                {targets.map((t) => (
                  <option key={t.shopId} value={t.shopId}>
                    {t.shopName}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-ink-400">
                An invitation belongs to one shop. Invite them again for another.
              </span>
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-700">Phone number</span>
            <input
              autoFocus
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98XXXXXXXX"
              inputMode="numeric"
              className="h-11 w-full rounded-xl border border-ink-200 px-3 text-sm outline-none focus:border-crimson-300"
            />
            <span className="mt-1 block text-xs text-ink-400">
              A Nepal number, 10 digits. Inviting a number that already has a waiting invitation
              replaces it.
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-700">
              Their name <span className="font-normal text-ink-400">(optional)</span>
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sita Gurung"
              maxLength={INVITE_NAME_MAX}
              className="h-11 w-full rounded-xl border border-ink-200 px-3 text-sm outline-none focus:border-crimson-300"
            />
            <span className="mt-1 block text-xs text-ink-400">
              Shown on the join screen so they recognise the invitation.
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-700">Role</span>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm outline-none focus:border-crimson-300"
            >
              {(target?.roles ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.isSystem ? " (template)" : ""}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-ink-400">
              {target?.roles.find((r) => r.id === roleId)?.description ??
                "The role decides exactly what they may do. Owner cannot be granted this way."}
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-700">
              Note in the message <span className="font-normal text-ink-400">(optional)</span>
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. you’ll handle evening orders"
              maxLength={INVITE_NOTE_MAX}
              className="w-full rounded-xl border border-ink-200 px-3 py-2 text-sm outline-none focus:border-crimson-300"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-ink-100 px-5 py-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!canSave} onClick={() => void submit()}>
            {saving ? <Spinner /> : <Send className="h-4 w-4" />} Send invitation
          </Button>
        </div>
      </motion.div>
    </>
  );
}

/* ----------------------------------------------------------- The one-time secret */

/**
 * The join link and code, shown at the only moment they exist.
 *
 * The server stores `tokenHash` and `codeHash`; this response is the whole
 * lifetime of the plaintext, and a resend re-rolls both. Nothing here is
 * persisted by the console — closing the dialog is the end of it, which is why
 * that is said out loud rather than implied.
 */
function ShareOnceDialog({
  issued,
  onClose,
}: {
  issued: InviteIssued;
  onClose: () => void;
}) {
  const { invite, shareOnce } = issued;
  const delivery = inviteDelivery(invite);
  const [copied, setCopied] = React.useState<"link" | "code" | null>(null);
  /**
   * The pending "Copied" reset.
   *
   * Held in a ref and cleared on unmount for two reasons, both reachable here.
   * Copying is the last thing anyone does in this dialog, so pressing Close inside
   * 1.6s is the normal case, not an edge one — and the timer was left running to
   * fire `setCopied` on a gone component. Copying the link and then the code within
   * the same window also used to let the first timer clear the second's label
   * early. Re-arming replaces the outstanding timer instead of racing it.
   */
  const copiedTimer = React.useRef<number | null>(null);
  useEscape(onClose);
  React.useEffect(
    () => () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  const copy = async (what: "link" | "code", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => {
        copiedTimer.current = null;
        setCopied(null);
      }, 1600);
    } catch {
      /* A browser that refuses the clipboard still shows both values in full. */
    }
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 z-[60] bg-ink-900/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Invitation created"
        className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: "tween", duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink-900">
              Invitation created for {invite.name ?? invite.phone}
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              {invite.role.name} · expires {untilLabel(shareOnce.expiresAt)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-ink-500 hover:bg-ink-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {delivery.state === "failed" ? (
          <InlineError
            className="mt-4"
            message={`The SMS didn’t send${delivery.detail ? ` (${delivery.detail})` : ""} — but the invitation is live. Read the code below out to them.`}
          />
        ) : delivery.state === "sent" ? (
          <InlineNotice
            className="mt-4"
            message="The message has gone out to their phone. You can also pass on the link or code yourself."
          />
        ) : (
          <InlineNotice
            className="mt-4"
            message="The invitation is live. The API didn’t report a delivery result, so hand over the link or code as well."
          />
        )}

        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-ink-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Join link</p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate text-sm text-ink-800">{shareOnce.link}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void copy("link", shareOnce.link)}
              >
                {copied === "link" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied === "link" ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-ink-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
              Spoken code
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 text-xl font-bold tracking-[0.2em] text-ink-900">
                {shareOnce.code}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void copy("code", shareOnce.code)}
              >
                {copied === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied === "code" ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-ink-400">
              {num(invite.attemptsRemaining)} tries before the code locks.
            </p>
          </div>
        </div>

        <p className="mt-4 text-sm font-medium text-[#c02636]">
          This is the only time these are readable. Close this and they are gone — a resend issues a
          new link and code, and stops the old ones working.
        </p>

        <div className="mt-5 flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </motion.div>
    </>
  );
}

