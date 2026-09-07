"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Megaphone,
  Pencil,
  Percent,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Search,
  Store,
  Tag,
  Ticket,
  TrendingUp,
  X,
} from "lucide-react";
import { ApiError, SEARCH_MAX_LENGTH } from "@gopasal/api-client";
import { useAuth } from "@/components/auth-provider";
import { useShops } from "@/components/shop-provider";
import { ShopScopeState, scopeShopIds, useShopScope } from "@/components/ShopScope";
import { PageHeader, Card, Button, Badge, EmptyState } from "@/components/primitives";
import { StatCard } from "@/components/StatCard";
import { Reveal } from "@/components/Reveal";
import { PermissionGate } from "@/components/PermissionGate";
import { ErrorPanel, InlineError, InlineNotice, SkeletonRows, Spinner } from "@/components/states";
import { cn } from "@/lib/cn";
import { num, rs, dayMonth } from "@/lib/format";
import { useDebounced } from "@/lib/use-debounced";
import { useEscape } from "@/lib/use-escape";
import { asApiError } from "@/lib/api/client";
import {
  createShopCoupon,
  deactivateShopCoupon,
  listAllShopCoupons,
  mergeCouponSummaries,
  updateShopCoupon,
  COUPON_CODE_MIN_LENGTH,
  EMPTY_COUPON_SUMMARY,
  PER_USER_LIMIT_MAX,
  type CouponQuery,
  type CouponTypeWire,
  type ShopCouponSummaryWire,
} from "@/lib/api/promotions";
import {
  COUPON_FILTERS,
  EMPTY_DRAFT,
  STATUS_LABELS,
  STATUS_TONES,
  couponFilterCount,
  couponFilterQuery,
  draftBody,
  draftProblem,
  limitAlreadyReached,
  patchBody,
  patchFrom,
  patchProblem,
  toSellerCoupons,
  type CouponDraft,
  type CouponFilter,
  type CouponPatch,
  type SellerCoupon,
} from "@/lib/promotions-view";

/**
 * Coupons — the whole of "Promotions" the API actually has.
 *
 * Four routes under `/seller/shops/:shopId/coupons`: list (`promotions.view`),
 * create, patch and deactivate (all `promotions.manage`). Everything on this screen
 * is one of those four, and nothing on it is invented.
 *
 * Three things are deliberately missing, because the backend has no way to support
 * them honestly:
 *
 * - **Sponsored placement.** `model SponsoredListing` exists in the schema and no
 *   controller or service in `apps/api/src` reads or writes it. The two toggles that
 *   used to live here — "Sponsored placement" and "Feature on home" — were switches
 *   wired to nothing, so they are gone and the gap is stated instead.
 * - **Campaign analytics.** `usedCount` is a real integer the order transaction
 *   increments, and it is the only usage number a seller can see. Revenue attributed
 *   to a coupon, redemptions over time, average discount: no route returns any of it.
 *   `CouponRedemption` rows do carry an `amount`, and no seller endpoint exposes them.
 * - **Forecasting.** Nothing here estimates what a coupon will cost or earn.
 *
 * Two behaviours worth knowing before reading the render: "Deactivate" is not a
 * delete — the `DELETE` route writes `isActive: false` and `PATCH { isActive: true }`
 * puts it back, so both are offered and neither warns about being irreversible. And
 * only four columns are patchable (`isActive`, `minOrder`, `usageLimit`, `validTo`);
 * `ValidationPipe` runs `forbidNonWhitelisted`, so offering to edit anything else
 * would be offering a 400.
 *
 * The chips and the search box are **server** queries (`?status=running|idle`, `?q=`),
 * not a re-reading of rows the browser holds, and the stat cards and chip badges come
 * from the API's shop-wide `summary` — so narrowing the list cannot rewrite them. Row
 * status is derived from `summary.asOf`, the instant the server evaluated its ladder
 * at, so a browser with a wrong clock cannot label a row "Expired" inside a list the
 * server called running.
 */
export default function PromotionsPage() {
  return (
    <PermissionGate perm="promotions.view">
      <PromotionsInner />
    </PermissionGate>
  );
}

function PromotionsInner() {
  const { canInShop } = useAuth();
  const { scopedShopIds, activeShopId, shopById } = useShops();

  /**
   * The shops this account may actually list coupons for, or why there are none.
   *
   * `useSeller().can` answers "somewhere", and a staff member can hold
   * `promotions.view` on one shop and nothing on another — so the check is per
   * shop. {@link useShopScope} additionally keeps the three non-permission reasons
   * for an empty list (the shop read is in flight, it failed, the account holds no
   * shop) from being reported as a missing grant.
   */
  const scope = useShopScope("promotions.view");
  const readableShopIds = scopeShopIds(scope);
  const idsKey = readableShopIds.join(",");

  /** Shops a coupon may be created on. A coupon belongs to exactly one shop. */
  const manageTargets = React.useMemo(
    () =>
      scopedShopIds
        .filter((id) => canInShop(id, "promotions.manage"))
        .map((id) => ({ id, name: shopById(id)?.name ?? "This shop" })),
    [scopedShopIds, canInShop, shopById],
  );

  const [coupons, setCoupons] = React.useState<SellerCoupon[]>([]);
  /** Counted over every coupon these shops have, whatever the chip and search say. */
  const [summary, setSummary] = React.useState<ShopCouponSummaryWire>(EMPTY_COUPON_SUMMARY);
  /** How many coupons match the current chip and search, per the server. */
  const [matched, setMatched] = React.useState(0);
  const [truncated, setTruncated] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [filter, setFilter] = React.useState<CouponFilter>("all");
  const [q, setQ] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  /** The coupon whose edit form is open, and the one a write is in flight for. */
  const [editing, setEditing] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  // The input stays instant; only the settled value becomes a request.
  const debouncedQ = useDebounced(q.trim());
  const filtering = filter !== "all" || debouncedQ.length > 0;

  // Serialised so the loader depends on a primitive: a fresh object each render
  // would re-fire the effect on every keystroke, debounce or not.
  const queryKey = JSON.stringify({
    q: debouncedQ || undefined,
    ...couponFilterQuery(filter),
    sort: "newest",
  });

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      const ids = idsKey ? idsKey.split(",").filter(Boolean) : [];
      const query = JSON.parse(queryKey) as CouponQuery;
      if (ids.length === 0) {
        setCoupons([]);
        setSummary(EMPTY_COUPON_SUMMARY);
        setMatched(0);
        setTruncated(false);
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
      try {
        const pages = await Promise.all(ids.map((id) => listAllShopCoupons(id, query, signal)));
        if (signal?.aborted) return;
        const totals = mergeCouponSummaries(pages.map((p) => p.summary));
        /*
          Rows are labelled with the instant the *server* evaluated its running/idle
          ladder at, not with the browser's clock. A browser a minute behind would
          otherwise print "Expired" on a row the server returned as running. One
          instant for the whole list, so no two rows can disagree about whether a
          coupon has started or ended.
        */
        const asOf = Date.parse(totals.asOf);
        const now = Number.isFinite(asOf) ? asOf : Date.now();
        // Each shop comes back newest-first; concatenating several shops does not
        // preserve that, so the merged list is re-sorted on the one timestamp it has.
        setCoupons(
          toSellerCoupons(
            pages.flatMap((p) => p.coupons),
            now,
          ).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
        setMatched(pages.reduce((a, p) => a + p.matched, 0));
        setSummary(totals);
        setTruncated(pages.some((p) => p.truncated));
        setError(null);
      } catch (err) {
        if (signal?.aborted) return;
        setError(asApiError(err));
        setCoupons([]);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [idsKey, queryKey],
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  /**
   * Every write refetches rather than merging.
   *
   * The three write routes each answer with the updated `Coupon` row, which is
   * enough to patch one card — but `status` here is derived from the server's `asOf`,
   * and a list where one row was recomputed at a different instant than its
   * neighbours is a list that can contradict itself. A write also moves the shop-wide
   * summary the cards and badges are drawn from, and can move a row out of the
   * current filter. A refetch costs one request and keeps all of that consistent.
   */
  const run = React.useCallback(
    async (id: string, write: () => Promise<unknown>) => {
      setBusy(id);
      setActionError(null);
      try {
        await write();
        await load();
        return true;
      } catch (err) {
        setActionError(
          err instanceof ApiError ? err.message : "That change didn’t save. Please try again.",
        );
        return false;
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const setActive = React.useCallback(
    (c: SellerCoupon, next: boolean) =>
      run(c.id, () =>
        next
          ? updateShopCoupon(c.shopId, c.id, { isActive: true })
          : deactivateShopCoupon(c.shopId, c.id),
      ),
    [run],
  );

  const savePatch = React.useCallback(
    async (c: SellerCoupon, patch: CouponPatch) => {
      const body = patchBody(c, patch);
      if (body === null) return;
      const ok = await run(c.id, () => updateShopCoupon(c.shopId, c.id, body));
      if (ok) setEditing(null);
    },
    [run],
  );

  const hiddenShops = scopedShopIds.length - readableShopIds.length;

  /**
   * Whether the three cards below are facts yet.
   *
   * `summary` starts as `EMPTY_COUPON_SUMMARY`, so painting it before the first
   * answer — or after one that failed — says this account has no coupons and none
   * running. That is a silence, not a zero.
   */
  const summaryKnown = scope.kind === "ready" && !error && !(loading && coupons.length === 0);
  const stat = (value: number) => (summaryKnown ? num(value) : "—");

  return (
    <div>
      <PageHeader
        icon={<Megaphone className="h-5 w-5" />}
        title="Promotions"
        subtitle={
          activeShopId === null
            ? "Discount codes your shops accept at checkout."
            : "Discount codes this shop accepts at checkout."
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
            </Button>
            {manageTargets.length > 0 && (
              <Button
                size="sm"
                onClick={() => {
                  setActionError(null);
                  setCreating(true);
                }}
              >
                <Plus className="h-4 w-4" /> New coupon
              </Button>
            )}
          </div>
        }
      />

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Reveal>
          {/* Every card below is counted server-side over all of these shops'
              coupons, so filtering the list cannot rewrite them. */}
          <StatCard
            label="Coupons"
            value={stat(summary.total)}
            icon={Ticket}
            tone="crimson"
            hint="Created, including the ones that are off"
          />
        </Reveal>
        <Reveal delay={1}>
          <StatCard
            label="Running now"
            value={stat(summary.running)}
            icon={Power}
            tone="green"
            hint="Codes checkout will accept"
          />
        </Reveal>
        <Reveal delay={2}>
          {/* Sum of `usedCount`, a column the order transaction writes. Not an
              estimate, and not attributed to any revenue figure — none exists. */}
          <StatCard
            label="Times used"
            value={stat(summary.redemptions)}
            icon={Tag}
            tone="blue"
            hint="Counted by the order that used it"
          />
        </Reveal>
      </div>

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="gp-scroll -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {COUPON_FILTERS.map((f) => {
            const c = couponFilterCount(f.id, summary);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                title={f.hint}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                  filter === f.id
                    ? "bg-crimson-50 text-crimson-700"
                    : "text-ink-500 hover:bg-ink-50",
                )}
              >
                {f.label}
                {/* From the shop-wide summary, so a chip's badge counts what picking
                    it would show — not what is currently loaded. */}
                {c > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs font-semibold",
                      filter === f.id
                        ? "bg-crimson-100 text-crimson-700"
                        : "bg-ink-100 text-ink-500",
                    )}
                  >
                    {c}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search coupon codes"
            /* The code is the only text on the row — there is no name, no
               description and no note to search. */
            aria-label="Search coupons by code"
            /* The server's own ceiling on `?q=`, so a long paste is stopped here
                instead of coming back as a 400 nobody can act on. */
            maxLength={SEARCH_MAX_LENGTH}
            className="h-10 w-full rounded-xl border border-ink-200 pl-9 pr-9 text-sm outline-none focus:border-crimson-300 lg:w-72"
          />
          {loading && coupons.length > 0 && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              <Spinner />
            </span>
          )}
        </div>
      </div>

      {hiddenShops > 0 && (
        <InlineNotice
          className="mt-4"
          message={`${num(hiddenShops)} of the shops in scope ${hiddenShops === 1 ? "is" : "are"} not shown: your role there does not include “View promotions”.`}
        />
      )}
      {actionError && <InlineError className="mt-4" message={actionError} />}

      {/*
        The fan-out reads a bounded number of pages per shop. When a shop's matching
        set is deeper than that, say so — otherwise "nothing else here" would be a
        claim about rows nobody fetched.
      */}
      {truncated && (
        <InlineNotice
          className="mt-4"
          message={`Showing the ${num(coupons.length)} newest of ${num(matched)} matching coupons. Search for a code, or pick a narrower filter, to reach the rest.`}
        />
      )}

      <div className="mt-4">
        {loading && coupons.length === 0 ? (
          <SkeletonRows rows={4} />
        ) : error ? (
          <ErrorPanel message={error.message} offline={error.offline} onRetry={() => void load()} />
        ) : scope.kind !== "ready" ? (
          <ShopScopeState
            scope={scope}
            what="coupons"
            permLabel="view promotions"
            icon={<Ticket className="h-6 w-6" />}
          />
        ) : coupons.length === 0 ? (
          <EmptyState
            icon={<Ticket className="h-6 w-6" />}
            title={
              /* `summary` counts every coupon these shops hold, so it — not the
                 chip — decides whether "none match" or "none exist" is the truth.
                 A shop with no coupons at all used to read "Everything is
                 running" whenever the Idle chip happened to be selected. */
              summary.total === 0
                ? "No coupons yet"
                : debouncedQ.length > 0
                  ? "No code matches that search"
                  : filter === "running"
                    ? "Nothing is running right now"
                    : filter === "idle"
                      ? "Every coupon is running"
                      : "No coupons yet"
            }
            description={
              summary.total > 0 && filtering
                ? "This was checked against every coupon these shops have, not just a page of them."
                : "A coupon is a code a customer types at checkout. Create one and it works straight away unless you give it a start date."
            }
            action={
              summary.total === 0 && manageTargets.length > 0 ? (
                <Button onClick={() => setCreating(true)}>New coupon</Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {coupons.map((c) => (
              <CouponRow
                key={c.id}
                c={c}
                shopName={activeShopId === null ? shopById(c.shopId)?.name ?? null : null}
                canManage={canInShop(c.shopId, "promotions.manage")}
                open={editing === c.id}
                busy={busy === c.id}
                onOpen={() => {
                  setActionError(null);
                  setEditing(c.id);
                }}
                onCancel={() => setEditing(null)}
                onSave={(patch) => void savePatch(c, patch)}
                onSetActive={(next) => void setActive(c, next)}
              />
            ))}
          </div>
        )}
      </div>

      {/* What used to be two switches. Saying the feature does not exist is more
          use than a control that appears to work and changes nothing. */}
      <Card className="mt-5 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-50 text-ink-400">
            <TrendingUp className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-ink-900">Paid placement isn’t available</h2>
            <p className="mt-1 text-sm text-ink-500">
              GoPasal has no sponsored listings or featured slots to buy — there is no such
              setting to switch on, for any shop. Coupons are the only promotion tool here, and
              where your shop appears to customers is not something a payment changes.
            </p>
            <p className="mt-2 text-xs text-ink-400">
              Coupons affect price only. Nothing on this page changes delivery timing, which stays
              with you and the customer.
            </p>
          </div>
        </div>
      </Card>

      <AnimatePresence>
        {creating && manageTargets.length > 0 && (
          <CreateDrawer
            targets={manageTargets}
            preferredShopId={activeShopId}
            onClose={() => setCreating(false)}
            onCreated={() => {
              setCreating(false);
              void load();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * One coupon.
 *
 * Everything on the card is a stored column or a label built from one: the code, the
 * discount, the floor, the per-customer cap, the dates, and `usedCount`. `canManage`
 * is the caller's `canInShop(shopId, "promotions.manage")` — not `useSeller().can`,
 * which answers "somewhere" and would show buttons the API refuses on this shop.
 */
function CouponRow({
  c,
  shopName,
  canManage,
  open,
  busy,
  onOpen,
  onCancel,
  onSave,
  onSetActive,
}: {
  c: SellerCoupon;
  /** Only set on the all-shops view, where a row has to say which shop it is. */
  shopName: string | null;
  canManage: boolean;
  open: boolean;
  busy: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onSave: (patch: CouponPatch) => void;
  onSetActive: (next: boolean) => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-crimson-50 text-crimson-600">
          {c.type === "PERCENT" ? <Percent className="h-5 w-5" /> : <Tag className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold tracking-wide text-ink-900">{c.code}</span>
            <Badge tone={STATUS_TONES[c.status]} dot>
              {STATUS_LABELS[c.status]}
            </Badge>
            {shopName && (
              <span className="inline-flex items-center gap-1 text-xs text-ink-500">
                <Store className="h-3.5 w-3.5" /> {shopName}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-700">{c.discountLabel}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            {c.minOrder > 0 ? `Orders over ${rs(c.minOrder)}` : "Any order value"} · {c.usageLabel}{" "}
            · {c.perUserLimit === 1 ? "once per customer" : `${num(c.perUserLimit)} per customer`}
          </p>
          <p className="mt-0.5 text-xs text-ink-400">
            {`Started ${dayMonth(c.validFrom)}`}
            {c.validTo === null ? " · no end date" : ` · ends ${dayMonth(c.validTo)}`}
          </p>
        </div>
        {canManage && !open && (
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {/* `DELETE` writes `isActive: false` and `PATCH { isActive: true }`
                reverses it, so this pair is a switch, not a deletion. */}
            {c.isActive ? (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => onSetActive(false)}>
                <PowerOff className="h-4 w-4" /> {busy ? "Saving…" : "Turn off"}
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => onSetActive(true)}>
                <Power className="h-4 w-4" /> {busy ? "Saving…" : "Turn on"}
              </Button>
            )}
            <Button variant="ghost" size="sm" disabled={busy} onClick={onOpen}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          </div>
        )}
      </div>

      {open && <EditForm c={c} busy={busy} onCancel={onCancel} onSave={onSave} />}
    </Card>
  );
}

/**
 * The three fields a coupon can still change, and nothing else.
 *
 * `UpdateCouponDto` whitelists `isActive`, `minOrder`, `usageLimit` and `validTo`.
 * The code, the discount, its cap, the per-customer limit and the start date were
 * fixed at creation — the form says so rather than showing disabled boxes for them.
 *
 * Two asymmetries the seller cannot guess and the form states outright: an expiry
 * can be moved but never removed (the controller does
 * `validTo: dto.validTo ? new Date(dto.validTo) : undefined`, so an empty value
 * leaves the stored one alone), and the same is true of a redemption ceiling, whose
 * validator has no way to express "no limit".
 */
function EditForm({
  c,
  busy,
  onCancel,
  onSave,
}: {
  c: SellerCoupon;
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: CouponPatch) => void;
}) {
  const id = React.useId();
  const [patch, setPatch] = React.useState<CouponPatch>(() => patchFrom(c));
  const [touched, setTouched] = React.useState(false);
  const problem = patchProblem(c, patch);
  const stopsNow = limitAlreadyReached(c, patch.usageLimit);

  return (
    <form
      className="mt-4 border-t border-ink-100 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (problem !== null) return;
        onSave(patch);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-600">Minimum order (रु)</span>
          <input
            id={`${id}-min`}
            type="number"
            min={0}
            step={1}
            value={patch.minOrder}
            onChange={(e) => setPatch((p) => ({ ...p, minOrder: e.target.value }))}
            onBlur={() => setTouched(true)}
            disabled={busy}
            className="h-10 w-full rounded-xl border border-ink-200 px-3 text-sm outline-none focus:border-crimson-300 disabled:opacity-60"
          />
          <span className="mt-1 block text-[11px] text-ink-400">0 means no minimum.</span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-600">Total redemptions</span>
          <input
            id={`${id}-limit`}
            type="number"
            min={1}
            step={1}
            value={patch.usageLimit}
            onChange={(e) => setPatch((p) => ({ ...p, usageLimit: e.target.value }))}
            onBlur={() => setTouched(true)}
            disabled={busy}
            placeholder="No limit"
            className="h-10 w-full rounded-xl border border-ink-200 px-3 text-sm outline-none focus:border-crimson-300 disabled:opacity-60"
          />
          <span className="mt-1 block text-[11px] text-ink-400">
            {c.usageLimit === null
              ? "Setting a number adds a ceiling. It cannot be removed again."
              : "A ceiling can be raised or lowered, not removed."}
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-600">Ends on</span>
          <input
            id={`${id}-to`}
            type="date"
            value={patch.validTo}
            onChange={(e) => setPatch((p) => ({ ...p, validTo: e.target.value }))}
            onBlur={() => setTouched(true)}
            disabled={busy}
            className="h-10 w-full rounded-xl border border-ink-200 px-3 text-sm outline-none focus:border-crimson-300 disabled:opacity-60"
          />
          <span className="mt-1 block text-[11px] text-ink-400">
            {c.validTo === null
              ? "A date ends the coupon at the end of that day, and cannot be cleared later."
              : "An end date can be moved, not removed."}
          </span>
        </label>
      </div>

      {stopsNow && (
        <InlineNotice
          className="mt-3"
          message={`That limit is at or below the ${num(c.usedCount)} already used, so checkout will stop accepting this code as soon as you save.`}
        />
      )}
      {touched && problem !== null && <InlineError className="mt-3" message={problem} />}

      <p className="mt-3 text-[11px] text-ink-400">
        The code, discount, cap, per-customer limit and start date are fixed once a coupon exists.
        Turn this one off and create a new code to change any of them.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" size="sm" disabled={busy || (touched && problem !== null)}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          <X className="h-4 w-4" /> Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * Create one coupon on one shop.
 *
 * A coupon belongs to a single shop, so on the all-shops view this asks which one
 * rather than guessing. Every rule the DTO enforces is restated here in the seller's
 * language by `draftProblem`, with one exception it cannot pre-empt: `code` is unique
 * **across the whole platform**, so a code another shop already uses comes back as a
 * 400 and is shown verbatim — this console cannot know which shop took it.
 */
function CreateDrawer({
  targets,
  preferredShopId,
  onClose,
  onCreated,
}: {
  targets: { id: string; name: string }[];
  preferredShopId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const initial = targets.find((t) => t.id === preferredShopId) ?? targets[0] ?? null;
  const [shopId, setShopId] = React.useState(initial?.id ?? "");
  const [draft, setDraft] = React.useState<CouponDraft>(EMPTY_DRAFT);
  const [touched, setTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  useEscape(onClose);

  const problem = draftProblem(draft);
  const set = (patch: Partial<CouponDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = async () => {
    const body = draftBody(draft);
    setTouched(true);
    if (body === null || shopId.length === 0) return;
    setSaving(true);
    setErr(null);
    try {
      await createShopCoupon(shopId, body);
      onCreated();
    } catch (error) {
      setErr(
        error instanceof ApiError
          ? error.message
          : "The coupon wasn’t created. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const field =
    "h-11 w-full rounded-xl border border-ink-200 px-3 text-sm outline-none focus:border-crimson-300 disabled:opacity-60";

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
        aria-labelledby="new-coupon-title"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl"
        initial={{ x: 40, opacity: 0.6 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={{ type: "tween", duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 id="new-coupon-title" className="text-lg font-bold text-ink-900">
            New coupon
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-ink-500 hover:bg-ink-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          id="new-coupon"
          className="gp-scroll flex-1 space-y-4 overflow-y-auto px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {err && <InlineError message={err} />}

          {targets.length > 1 && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-700">Shop</span>
              <select
                value={shopId}
                onChange={(e) => setShopId(e.target.value)}
                disabled={saving}
                className="h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm outline-none focus:border-crimson-300"
              >
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-ink-400">
                A coupon belongs to one shop and works only on that shop’s orders.
              </span>
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-700">Coupon code</span>
            <input
              autoFocus
              value={draft.code}
              onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s/g, "") })}
              onBlur={() => setTouched(true)}
              disabled={saving}
              placeholder="DASHAIN10"
              className={cn(field, "font-mono uppercase tracking-wide")}
            />
            <span className="mt-1 block text-xs text-ink-400">
              At least {COUPON_CODE_MIN_LENGTH} characters, no spaces. Codes are shared across all
              of GoPasal, so a code another shop already uses will be refused.
            </span>
          </label>

          <div>
            <span className="mb-1 block text-sm font-medium text-ink-700">Discount type</span>
            <div className="grid grid-cols-2 gap-2">
              {(["PERCENT", "FLAT"] as CouponTypeWire[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set({ type: t })}
                  disabled={saving}
                  // Percent vs flat changes what the amount below means, and which one
                  // was chosen was conveyed by border and background colour alone.
                  aria-pressed={draft.type === t}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                    draft.type === t
                      ? "border-crimson-300 bg-crimson-50 text-crimson-700"
                      : "border-ink-200 text-ink-600 hover:bg-ink-50",
                  )}
                >
                  {t === "PERCENT" ? <Percent className="h-4 w-4" /> : <Tag className="h-4 w-4" />}
                  {t === "PERCENT" ? "Percent off" : "Flat amount"}
                </button>
              ))}
            </div>
            <span className="mt-1 block text-xs text-ink-400">
              Fixed once the coupon exists — it cannot be changed later.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-700">
                {draft.type === "PERCENT" ? "Percent off" : "Amount off (रु)"}
              </span>
              <input
                type="number"
                min={1}
                max={draft.type === "PERCENT" ? 100 : undefined}
                step={1}
                value={draft.value}
                onChange={(e) => set({ value: e.target.value })}
                onBlur={() => setTouched(true)}
                disabled={saving}
                placeholder={draft.type === "PERCENT" ? "10" : "100"}
                className={field}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-700">
                Minimum order (रु)
              </span>
              <input
                type="number"
                min={0}
                step={1}
                value={draft.minOrder}
                onChange={(e) => set({ minOrder: e.target.value })}
                onBlur={() => setTouched(true)}
                disabled={saving}
                placeholder="0"
                className={field}
              />
            </label>
          </div>

          {/* Offered for percent only. `computeDiscount` applies `maxDiscount` to a
              flat coupon as well, so a cap under a flat amount would quietly shrink
              the discount the seller typed just above it. */}
          {draft.type === "PERCENT" && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-700">
                Most it can take off (रु){" "}
                <span className="font-normal text-ink-400">(optional)</span>
              </span>
              <input
                type="number"
                min={1}
                step={1}
                value={draft.maxDiscount}
                onChange={(e) => set({ maxDiscount: e.target.value })}
                onBlur={() => setTouched(true)}
                disabled={saving}
                placeholder="No cap"
                className={field}
              />
              <span className="mt-1 block text-xs text-ink-400">
                Caps a percentage on a large order. Leave it empty for no cap.
              </span>
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-700">
                Total redemptions <span className="font-normal text-ink-400">(optional)</span>
              </span>
              <input
                type="number"
                min={1}
                step={1}
                value={draft.usageLimit}
                onChange={(e) => set({ usageLimit: e.target.value })}
                onBlur={() => setTouched(true)}
                disabled={saving}
                placeholder="No limit"
                className={field}
              />
              <span className="mt-1 block text-xs text-ink-400">
                Across every customer. Once reached, checkout stops accepting the code.
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-700">
                Uses per customer <span className="font-normal text-ink-400">(optional)</span>
              </span>
              <input
                type="number"
                min={1}
                max={PER_USER_LIMIT_MAX}
                step={1}
                value={draft.perUserLimit}
                onChange={(e) => set({ perUserLimit: e.target.value })}
                onBlur={() => setTouched(true)}
                disabled={saving}
                placeholder="1"
                className={field}
              />
              <span className="mt-1 block text-xs text-ink-400">
                Defaults to once each. Up to {num(PER_USER_LIMIT_MAX)}. Fixed after creation.
              </span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-700">
                Starts <span className="font-normal text-ink-400">(optional)</span>
              </span>
              <input
                type="date"
                value={draft.validFrom}
                onChange={(e) => set({ validFrom: e.target.value })}
                onBlur={() => setTouched(true)}
                disabled={saving}
                className={field}
              />
              <span className="mt-1 block text-xs text-ink-400">
                Empty means it works immediately.
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-700">
                Ends <span className="font-normal text-ink-400">(optional)</span>
              </span>
              <input
                type="date"
                value={draft.validTo}
                onChange={(e) => set({ validTo: e.target.value })}
                onBlur={() => setTouched(true)}
                disabled={saving}
                className={field}
              />
              <span className="mt-1 block text-xs text-ink-400">
                Empty means no end date. One set here can be moved later but not removed.
              </span>
            </label>
          </div>

          {touched && problem !== null && <InlineError message={problem} />}

          <InlineNotice message="A coupon can be turned off at any time, and turned back on. Nothing here deletes it, and the discount only ever comes off the order total." />
        </form>

        <div className="flex items-center justify-end gap-2 border-t border-ink-100 px-5 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="new-coupon"
            disabled={saving || shopId.length === 0 || (touched && problem !== null)}
          >
            <Plus className="h-4 w-4" /> {saving ? "Creating…" : "Create coupon"}
          </Button>
        </div>
      </motion.div>
    </>
  );
}











