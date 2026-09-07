"use client";

import * as React from "react";
import {
  TicketPercent,
  Search,
  Plus,
  Pencil,
  Play,
  Pause,
  Wallet,
  Users,
  MapPin,
  CalendarDays,
  Percent,
  BadgeIndianRupee,
  Truck,
  Info,
  CircleSlash,
} from "lucide-react";
import {
  PageHeader,
  Card,
  SectionTitle,
  Badge,
  Button,
  FilterPills,
  SearchInput,
  EmptyState,
  Field,
  inputCls,
} from "@/components/primitives";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { PermissionGate } from "@/components/PermissionGate";
import { Drawer, ConfirmDialog } from "@/components/Drawer";
import { Reveal } from "@/components/Reveal";
import { useAdmin, useLang } from "@/components/providers";
import { NOW, CITY_MIX, type PlatformCoupon, type CouponStatus } from "@/lib/data";
import { rs, rsCompact, num, ago, fullDate } from "@/lib/format";

type Filter = "ALL" | CouponStatus;

const KIND = {
  percent: { label: "Percent off", icon: Percent, tone: "crimson" as const },
  flat: { label: "Flat amount off", icon: BadgeIndianRupee, tone: "blue" as const },
  "free-delivery": { label: "Delivery fee waived", icon: Truck, tone: "marigold" as const },
};

/** The editor keeps everything as strings so a half-typed number never breaks state. */
type Draft = {
  id: string;
  code: string;
  description: string;
  kind: PlatformCoupon["kind"];
  value: string;
  capAmount: string;
  minOrder: string;
  budget: string;
  maxRedemptions: string;
  perUserLimit: string;
  startsAt: string;
  endsAt: string;
  status: CouponStatus;
  cities: string[];
};

const day = (iso: string) => iso.slice(0, 10);
const toIso = (d: string) => (d ? new Date(`${d}T00:00:00+05:45`).toISOString() : "");
const int = (s: string) => {
  const n = Number.parseInt(s.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
};

function blankDraft(): Draft {
  const start = day(NOW.toISOString());
  const end = day(new Date(NOW.getTime() + 14 * 86400000).toISOString());
  return {
    id: "",
    code: "",
    description: "",
    kind: "percent",
    value: "10",
    capAmount: "200",
    minOrder: "500",
    budget: "100000",
    maxRedemptions: "",
    perUserLimit: "1",
    startsAt: start,
    endsAt: end,
    status: "SCHEDULED",
    cities: [],
  };
}

function toDraft(c: PlatformCoupon): Draft {
  return {
    id: c.id,
    code: c.code,
    description: c.description,
    kind: c.kind,
    value: String(c.value),
    capAmount: c.capAmount ? String(c.capAmount) : "",
    minOrder: String(c.minOrder),
    budget: String(c.budget),
    maxRedemptions: c.maxRedemptions ? String(c.maxRedemptions) : "",
    perUserLimit: String(c.perUserLimit),
    startsAt: day(c.startsAt),
    endsAt: day(c.endsAt),
    status: c.status,
    cities: [...c.cities],
  };
}

export default function CouponsPage() {
  return (
    <PermissionGate
      perm="coupons.manage"
      title="You can’t manage platform coupons"
      description="Creating or editing a platform-funded coupon needs the “Manage coupons” permission."
    >
      <CouponsInner />
    </PermissionGate>
  );
}

function CouponsInner() {
  const { lang } = useLang();
  const { coupons, saveCoupon } = useAdmin();
  const [filter, setFilter] = React.useState<Filter>("ALL");
  const [q, setQ] = React.useState("");
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [pending, setPending] = React.useState<{ coupon: PlatformCoupon; to: CouponStatus } | null>(
    null,
  );

  const counts = React.useMemo(
    () => ({
      ALL: coupons.length,
      ACTIVE: coupons.filter((c) => c.status === "ACTIVE").length,
      SCHEDULED: coupons.filter((c) => c.status === "SCHEDULED").length,
      PAUSED: coupons.filter((c) => c.status === "PAUSED").length,
      EXPIRED: coupons.filter((c) => c.status === "EXPIRED").length,
    }),
    [coupons],
  );

  /* Money committed against money actually given away. */
  const totals = React.useMemo(() => {
    const live = coupons.filter((c) => c.status === "ACTIVE");
    return {
      liveBudget: live.reduce((s, c) => s + c.budget, 0),
      spent: coupons.reduce((s, c) => s + c.spent, 0),
      redemptions: coupons.reduce((s, c) => s + c.redemptions, 0),
      live: live.length,
    };
  }, [coupons]);

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rank: Record<CouponStatus, number> = { ACTIVE: 0, SCHEDULED: 1, PAUSED: 2, EXPIRED: 3 };
    return coupons
      .filter((c) => (filter === "ALL" ? true : c.status === filter))
      .filter((c) =>
        needle
          ? c.code.toLowerCase().includes(needle) || c.description.toLowerCase().includes(needle)
          : true,
      )
      .sort(
        (a, b) =>
          rank[a.status] - rank[b.status] ||
          new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
      );
  }, [coupons, filter, q]);

  const cities = React.useMemo(() => CITY_MIX.map((c) => c.city), []);

  const commit = () => {
    if (!draft) return;
    const code = draft.code.trim().toUpperCase().replace(/\s+/g, "");
    if (code.length < 3 || draft.description.trim().length < 4) return;
    const next: PlatformCoupon = {
      id: draft.id || `c-${Date.now()}`,
      code,
      description: draft.description.trim(),
      kind: draft.kind,
      value: draft.kind === "free-delivery" ? 0 : int(draft.value),
      minOrder: int(draft.minOrder),
      budget: int(draft.budget),
      spent: coupons.find((c) => c.id === draft.id)?.spent ?? 0,
      redemptions: coupons.find((c) => c.id === draft.id)?.redemptions ?? 0,
      perUserLimit: Math.max(1, int(draft.perUserLimit)),
      startsAt: toIso(draft.startsAt),
      endsAt: toIso(draft.endsAt),
      status: draft.status,
      cities: draft.cities,
      createdBy: coupons.find((c) => c.id === draft.id)?.createdBy ?? "Bibek Kumar Thagunna",
    };
    if (draft.kind === "percent" && int(draft.capAmount) > 0) next.capAmount = int(draft.capAmount);
    if (int(draft.maxRedemptions) > 0) next.maxRedemptions = int(draft.maxRedemptions);
    saveCoupon(next);
    setDraft(null);
  };

  return (
    <>
      <PageHeader
        icon={<TicketPercent className="h-5 w-5" />}
        title={lang === "np" ? "कुपन र छुट" : "Coupons"}
        subtitle={
          lang === "np"
            ? "प्लेटफर्मले बेहोर्ने छुट — बजेट, सीमा र शहर तोकेर"
            : "Discounts GoPasal funds itself. A shop is never charged for a platform coupon."
        }
        actions={
          <>
            <Badge tone={totals.live > 0 ? "green" : "ink"} dot>
              {num(totals.live)} live
            </Badge>
            <Button size="sm" onClick={() => setDraft(blankDraft())}>
              <Plus className="h-4 w-4" /> New coupon
            </Button>
          </>
        }
      />

      <Reveal className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Budget committed"
          value={rsCompact(totals.liveBudget)}
          icon={Wallet}
          tone="crimson"
          hint="Across live coupons only"
        />
        <StatCard
          label="Given away so far"
          value={rsCompact(totals.spent)}
          icon={TicketPercent}
          tone="marigold"
          hint="Platform cost, all coupons"
        />
        <StatCard
          label="Redemptions"
          value={num(totals.redemptions)}
          icon={Users}
          tone="blue"
          hint="Times a code was accepted"
        />
        <StatCard
          label="Waiting to start"
          value={num(counts.SCHEDULED)}
          icon={CalendarDays}
          tone="ink"
          hint={`${num(counts.PAUSED)} paused · ${num(counts.EXPIRED)} finished`}
        />
      </Reveal>

      <div className="mb-4 mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterPills<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "ALL", label: "All", count: counts.ALL },
            { value: "ACTIVE", label: "Live", count: counts.ACTIVE },
            { value: "SCHEDULED", label: "Scheduled", count: counts.SCHEDULED },
            { value: "PAUSED", label: "Paused", count: counts.PAUSED },
            { value: "EXPIRED", label: "Finished", count: counts.EXPIRED },
          ]}
        />
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Code or description"
          icon={<Search className="h-4 w-4" />}
          className="w-full sm:w-72"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<TicketPercent className="h-6 w-6" />}
          title="No coupon in this view"
          description="Try another status, or create a coupon with a clear budget and end date."
          action={
            <Button size="sm" onClick={() => setDraft(blankDraft())}>
              <Plus className="h-4 w-4" /> New coupon
            </Button>
          }
        />
      ) : (
        <Reveal className="grid gap-4 lg:grid-cols-2">
          {rows.map((c) => {
            const k = KIND[c.kind];
            const KIcon = k.icon;
            const budgetPct = c.budget ? Math.min(100, Math.round((c.spent / c.budget) * 100)) : 0;
            const capReached = c.maxRedemptions ? c.redemptions >= c.maxRedemptions : false;
            const nearBudget = budgetPct >= 90;
            return (
              <Card key={c.id} className="pb-5">
                <SectionTitle
                  title={
                    <span className="flex items-center gap-2">
                      <span className="rounded-lg bg-ink-900 px-2.5 py-1 font-mono text-xs font-bold tracking-wide text-white">
                        {c.code}
                      </span>
                      <StatusBadge value={c.status} />
                    </span>
                  }
                  hint={c.description}
                  action={
                    <Badge tone={k.tone} dot={false}>
                      <KIcon className="h-3.5 w-3.5" /> {k.label}
                    </Badge>
                  }
                />

                <div className="px-5 pt-5">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-ink-50 px-3.5 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                        Discount
                      </p>
                      <p className="mt-1 text-base font-bold text-ink-900">
                        {c.kind === "percent"
                          ? `${c.value}%`
                          : c.kind === "flat"
                            ? rs(c.value)
                            : "Delivery free"}
                      </p>
                      <p className="text-xs text-ink-500">
                        {c.capAmount ? `capped at ${rs(c.capAmount)}` : `min order ${rs(c.minOrder)}`}
                      </p>
                    </div>
                    <div className="rounded-xl bg-ink-50 px-3.5 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                        Redeemed
                      </p>
                      <p className="mt-1 text-base font-bold text-ink-900">{num(c.redemptions)}</p>
                      <p className="text-xs text-ink-500">
                        {c.maxRedemptions ? `of ${num(c.maxRedemptions)} allowed` : "no hard cap"} ·{" "}
                        {num(c.perUserLimit)}/person
                      </p>
                    </div>
                    <div className="rounded-xl bg-ink-50 px-3.5 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                        Window
                      </p>
                      <p className="mt-1 text-sm font-bold text-ink-900">{fullDate(c.startsAt)}</p>
                      <p className="text-xs text-ink-500">
                        ends {fullDate(c.endsAt)} · {ago(c.endsAt, NOW)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-ink-600">
                        {rs(c.spent)} of {rs(c.budget)} spent
                      </span>
                      <span
                        className={
                          nearBudget ? "font-bold text-[#c02636]" : "font-semibold text-ink-500"
                        }
                      >
                        {budgetPct}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className={
                          nearBudget
                            ? "h-full rounded-full bg-[#c02636]"
                            : "h-full rounded-full bg-crimson-500"
                        }
                        style={{ width: `${Math.max(2, budgetPct)}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-ink-400" />
                    {c.cities.length === 0 ? (
                      <span className="text-xs text-ink-500">Every city GoPasal serves</span>
                    ) : (
                      c.cities.map((city) => (
                        <span
                          key={city}
                          className="rounded-full bg-crimson-50 px-2 py-0.5 text-xs font-semibold text-crimson-700"
                        >
                          {city}
                        </span>
                      ))
                    )}
                  </div>

                  {(capReached || nearBudget) && c.status === "ACTIVE" && (
                    <p className="mt-4 flex items-start gap-2 rounded-xl bg-[#FFF3DF] px-3.5 py-2.5 text-xs text-[#8a5a00]">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {capReached
                        ? "The redemption cap is reached — the code will stop working even though it still looks live."
                        : "Almost all of the budget is gone. Raise it or pause the coupon before it runs out mid-order."}
                    </p>
                  )}

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-4">
                    <span className="text-xs text-ink-400">Created by {c.createdBy}</span>
                    <span className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => setDraft(toDraft(c))}>
                        <Pencil className="h-4 w-4" /> Edit
                      </Button>
                      {c.status === "ACTIVE" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPending({ coupon: c, to: "PAUSED" })}
                        >
                          <Pause className="h-4 w-4" /> Pause
                        </Button>
                      )}
                      {(c.status === "PAUSED" || c.status === "SCHEDULED") && (
                        <Button size="sm" onClick={() => setPending({ coupon: c, to: "ACTIVE" })}>
                          <Play className="h-4 w-4" /> Make live
                        </Button>
                      )}
                      {c.status !== "EXPIRED" && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setPending({ coupon: c, to: "EXPIRED" })}
                        >
                          <CircleSlash className="h-4 w-4" /> End now
                        </Button>
                      )}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </Reveal>
      )}

      <Drawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? `Edit ${draft.code}` : "New platform coupon"}
        subtitle="GoPasal pays for this discount. Give it a budget and an end date so it cannot run away."
        width={620}
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-ink-500">
              {draft?.id ? "Spend and redemptions are kept as they are." : "Starts paused unless you set it live."}
            </span>
            <span className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={commit}>
                {draft?.id ? "Save coupon" : "Create coupon"}
              </Button>
            </span>
          </div>
        }
      >
        {draft && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Code" hint="Shown to shoppers exactly like this" required>
                <input
                  className={`${inputCls} font-mono uppercase`}
                  value={draft.code}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                  placeholder="DASHAIN20"
                  maxLength={20}
                />
              </Field>
              <Field label="Status">
                <select
                  className={inputCls}
                  value={draft.status}
                  onChange={(e) =>
                    setDraft({ ...draft, status: e.target.value as CouponStatus })
                  }
                >
                  <option value="SCHEDULED">Scheduled — starts on its date</option>
                  <option value="ACTIVE">Live now</option>
                  <option value="PAUSED">Paused</option>
                  <option value="EXPIRED">Finished</option>
                </select>
              </Field>
            </div>

            <Field
              label="What shoppers are told"
              hint="One plain sentence. This is the line that appears in the app."
              required
            >
              <input
                className={inputCls}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="Dashain festival — 20% off, capped at रु 300"
                maxLength={90}
              />
            </Field>

            <Field label="Kind of discount">
              <div className="grid gap-2 sm:grid-cols-3">
                {(Object.keys(KIND) as PlatformCoupon["kind"][]).map((k) => {
                  const KIcon = KIND[k].icon;
                  const on = draft.kind === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDraft({ ...draft, kind: k })}
                      className={
                        on
                          ? "flex items-center gap-2 rounded-xl border border-crimson-300 bg-crimson-50 px-3 py-2.5 text-sm font-bold text-crimson-800"
                          : "flex items-center gap-2 rounded-xl border border-ink-200 px-3 py-2.5 text-sm font-semibold text-ink-600 transition hover:border-ink-300"
                      }
                    >
                      <KIcon className="h-4 w-4 shrink-0" /> {KIND[k].label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              {draft.kind !== "free-delivery" && (
                <Field label={draft.kind === "percent" ? "Percent off" : "Amount off (रु)"} required>
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    value={draft.value}
                    onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                  />
                </Field>
              )}
              {draft.kind === "percent" && (
                <Field label="Cap (रु)" hint="Blank means no cap">
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    value={draft.capAmount}
                    onChange={(e) => setDraft({ ...draft, capAmount: e.target.value })}
                  />
                </Field>
              )}
              <Field label="Minimum order (रु)">
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={draft.minOrder}
                  onChange={(e) => setDraft({ ...draft, minOrder: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Budget (रु)" hint="Hard stop for platform spend" required>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={draft.budget}
                  onChange={(e) => setDraft({ ...draft, budget: e.target.value })}
                />
              </Field>
              <Field label="Total redemptions" hint="Blank means unlimited">
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={draft.maxRedemptions}
                  onChange={(e) => setDraft({ ...draft, maxRedemptions: e.target.value })}
                />
              </Field>
              <Field label="Per person">
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={draft.perUserLimit}
                  onChange={(e) => setDraft({ ...draft, perUserLimit: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Starts">
                <input
                  type="date"
                  className={inputCls}
                  value={draft.startsAt}
                  onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })}
                />
              </Field>
              <Field label="Ends">
                <input
                  type="date"
                  className={inputCls}
                  value={draft.endsAt}
                  onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Cities" hint="Pick none to offer it everywhere GoPasal serves">
              <div className="flex flex-wrap gap-2">
                {cities.map((city) => {
                  const on = draft.cities.includes(city);
                  return (
                    <button
                      key={city}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          cities: on
                            ? draft.cities.filter((x) => x !== city)
                            : [...draft.cities, city],
                        })
                      }
                      className={
                        on
                          ? "rounded-full bg-crimson-500 px-3 py-1.5 text-xs font-bold text-white"
                          : "rounded-full border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600 transition hover:border-ink-300"
                      }
                    >
                      {city}
                    </button>
                  );
                })}
              </div>
            </Field>

            <p className="flex items-start gap-2 rounded-xl bg-crimson-50/70 px-3.5 py-3 text-xs text-crimson-800">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              A coupon never reduces what the shop is paid. The discount is deducted from GoPasal’s
              commission and reported on the finance page.
            </p>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={pending !== null}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) saveCoupon({ ...pending.coupon, status: pending.to });
          setPending(null);
        }}
        title={
          pending?.to === "ACTIVE"
            ? `Make ${pending?.coupon.code} live?`
            : pending?.to === "PAUSED"
              ? `Pause ${pending?.coupon.code}?`
              : `End ${pending?.coupon.code} now?`
        }
        description={
          pending?.to === "ACTIVE"
            ? "Shoppers can use the code immediately, within its budget and city list."
            : pending?.to === "PAUSED"
              ? "The code stops working straight away. Orders already placed with it are unaffected, and you can make it live again at any time."
              : "The code is closed for good. Anyone who already used it keeps their discount, and the unspent budget is released."
        }
        confirmLabel={
          pending?.to === "ACTIVE" ? "Make live" : pending?.to === "PAUSED" ? "Pause" : "End coupon"
        }
        destructive={pending?.to === "EXPIRED"}
        reasonLabel="Why this change (kept in the audit log)"
      />


      <p className="mt-6 text-xs text-ink-400">
        Platform coupons are funded by GoPasal, so a shop is paid in full and the discount is
        settled centrally. A shop’s own offers live in the seller console.
      </p>
    </>
  );
}


