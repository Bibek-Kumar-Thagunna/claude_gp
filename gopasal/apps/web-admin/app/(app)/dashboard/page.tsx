"use client";

import * as React from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  ShoppingBag,
  Store,
  Users,
  ShieldAlert,
  Scale,
  PackageSearch,
  ClipboardCheck,
  ArrowRight,
  History,
  LifeBuoy,
  Wallet,
  Bike,
} from "lucide-react";
import { PageHeader, Card, SectionTitle, Badge, Button, Avatar } from "@/components/primitives";
import { StatCard } from "@/components/StatCard";
import { Reveal } from "@/components/Reveal";
import { PermissionGate, Can } from "@/components/PermissionGate";
import { StatusBadge, statusLabel, statusTone } from "@/components/StatusBadge";
import { TrendChart } from "@/components/charts/TrendChart";
import { DonutChart, type DonutSlice } from "@/components/charts/DonutChart";
import { BarList, type BarRow } from "@/components/charts/BarList";
import { useAdmin, useLang } from "@/components/providers";
import { useAuth } from "@/components/auth-provider";
import { fetchQueue } from "@/lib/api/onboarding-review";
import { ApiError } from "@gopasal/api-client";
import type { QueueRow } from "@/lib/api/types";
import { SkeletonRows, InlineError } from "@/components/states";
import {
  NOW,
  OVERVIEW,
  ORDERS_TREND_30,
  CATEGORY_MIX,
  CITY_MIX,
} from "@/lib/data";
import { rs, rsCompact, num, pct, ago } from "@/lib/format";

export default function DashboardPage() {
  return (
    <PermissionGate perm="admin.dashboard.view">
      <DashboardInner />
    </PermissionGate>
  );
}

function DashboardInner() {
  const { lang } = useLang();
  const { moderation, disputes, fraud, tickets, audit } = useAdmin();
  const { roleName, superAdmin, hasPermission } = useAuth();
  const [metric, setMetric] = React.useState<"gmv" | "orders">("gmv");

  /**
   * The onboarding queue is real. Everything else on this page is still fixtures,
   * so the two are read differently and it is worth being explicit about which is
   * which: `queue`/`waiting` come from `GET /admin/onboarding/applications`.
   */
  const [queue, setQueue] = React.useState<QueueRow[] | null>(null);
  const [waiting, setWaiting] = React.useState<number | null>(null);
  const [queueState, setQueueState] = React.useState<"loading" | "ready" | "error">("loading");
  const [queueError, setQueueError] = React.useState<string | null>(null);
  const canSeeQueue = hasPermission("shops.view");

  React.useEffect(() => {
    if (!canSeeQueue) return;
    const controller = new AbortController();
    setQueueState("loading");
    fetchQueue({ limit: 4, status: "OPEN" }, controller.signal)
      .then((page) => {
        setQueue(page.data);
        setWaiting(page.meta.total);
        setQueueState("ready");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setQueue(null);
        setWaiting(null);
        setQueueState("error");
        setQueueError(err instanceof ApiError ? err.message : "Could not load the review queue.");
      });
    return () => controller.abort();
  }, [canSeeQueue]);

  /* Week-over-week movement, derived from the same series the chart draws. */
  const wow = React.useMemo(() => {
    const last7 = ORDERS_TREND_30.slice(-7);
    const prev7 = ORDERS_TREND_30.slice(-14, -7);
    const sum = (rows: typeof last7, k: "orders" | "gmv") =>
      rows.reduce((s, p) => s + p[k], 0);
    const d = (k: "orders" | "gmv") => {
      const a = sum(prev7, k);
      if (!a) return 0;
      return Math.round(((sum(last7, k) - a) / a) * 1000) / 10;
    };
    return { orders: d("orders"), gmv: d("gmv") };
  }, []);

  const flaggedProducts = moderation.filter((p) => p.isActive);
  const openDisputes = disputes.filter(
    (d) => d.status === "OPEN" || d.status === "UNDER_REVIEW",
  );
  const openFraud = fraud.filter((f) => f.status === "OPEN" || f.status === "REVIEWING");
  const openTickets = tickets.filter((t) => t.status === "OPEN" || t.status === "PENDING");

  const statusSlices: DonutSlice[] = Object.entries(OVERVIEW.orders.byStatus)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({
      label: statusLabel(k, lang),
      value: v,
      tone: statusTone(k),
      display: num(v),
    }));

  const categoryRows: BarRow[] = CATEGORY_MIX.map((c) => ({
    label: lang === "np" ? c.labelNp : c.label,
    value: c.gmv,
    display: rsCompact(c.gmv),
    hint: `${num(c.orders)} orders`,
    tone: c.tone,
  }));

  const cityRows: BarRow[] = CITY_MIX.map((c) => ({
    label: c.city,
    value: c.gmv,
    display: rsCompact(c.gmv),
    hint: `${c.shops} shops · ${num(c.orders)} orders`,
    tone: "crimson",
  }));

  return (
    <>
      <PageHeader
        icon={<LayoutDashboard className="h-5 w-5" />}
        title={lang === "np" ? "प्लेटफर्म अवलोकन" : "Platform overview"}
        subtitle={
          lang === "np"
            ? "पछिल्ला ३० दिनको कारोबार, पर्खिरहेका कामको सूची र भरपर्दो कारबाही"
            : "Last 30 days of trade, the queues waiting on you, and every action taken"
        }
        actions={
          <>
            {roleName && (
              <Badge tone={superAdmin ? "crimson" : "ink"} dot>
                {roleName}
              </Badge>
            )}
            <Can perm="analytics.platform.view">
              <Button href="/analytics" variant="outline" size="sm">
                Full analytics <ArrowRight className="h-4 w-4" />
              </Button>
            </Can>
          </>
        }
      />

      <Reveal className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="GMV · last 30 days"
          value={rsCompact(OVERVIEW.gmv)}
          icon={Wallet}
          tone="crimson"
          delta={wow.gmv}
          hint={`Commission ${rsCompact(OVERVIEW.commission)}`}
        />
        <StatCard
          label="Orders · last 7 days"
          value={num(OVERVIEW.orders.last7Days)}
          icon={ShoppingBag}
          tone="blue"
          delta={wow.orders}
          hint={`${num(OVERVIEW.orders.total)} all time`}
        />
        <StatCard
          label="Active shops"
          value={num(OVERVIEW.shops.active)}
          icon={Store}
          tone="green"
          hint={`${OVERVIEW.shops.suspended} suspended`}
          href="/shops"
        />
        <StatCard
          label="Average order value"
          value={rs(OVERVIEW.aov)}
          icon={Bike}
          tone="marigold"
          hint={`${pct(OVERVIEW.codShare)} paid cash on delivery`}
        />
      </Reveal>

      <Reveal delay={0.06} className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Shops awaiting approval"
          value={waiting === null ? "—" : num(waiting)}
          icon={ClipboardCheck}
          tone={waiting ? "marigold" : "ink"}
          hint={
            canSeeQueue
              ? waiting === null
                ? "Queue unavailable right now"
                : "Papers + coverage to verify"
              : "You do not review applications"
          }
          href={canSeeQueue ? "/approvals" : undefined}
        />
        <StatCard
          label="Products reported"
          value={num(flaggedProducts.length)}
          icon={PackageSearch}
          tone={flaggedProducts.length ? "crimson" : "ink"}
          hint="Live listings with open reports"
          href="/catalog"
        />
        <StatCard
          label="Open disputes"
          value={num(openDisputes.length)}
          icon={Scale}
          tone={openDisputes.length ? "red" : "ink"}
          hint="Customer vs shop, awaiting a decision"
          href="/disputes"
        />
        <StatCard
          label="Fraud signals"
          value={num(openFraud.length)}
          icon={ShieldAlert}
          tone={openFraud.length ? "red" : "ink"}
          hint="Flagged accounts, shops and orders"
          href="/fraud"
        />
      </Reveal>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Reveal delay={0.1} className="lg:col-span-2">
          <Card className="h-full pb-5">
            <SectionTitle
              title={metric === "gmv" ? "Gross merchandise value" : "Orders placed"}
              hint="Last 30 days · hover for a single day"
              action={
                <div className="flex items-center gap-1 rounded-xl bg-ink-100 p-1">
                  {(["gmv", "orders"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMetric(m)}
                      aria-pressed={metric === m}
                      className={
                        metric === m
                          ? "rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-ink-900 shadow-sm"
                          : "rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-500 hover:text-ink-800"
                      }
                    >
                      {m === "gmv" ? "GMV" : "Orders"}
                    </button>
                  ))}
                </div>
              }
            />
            <div className="px-5 pt-5">
              <TrendChart data={ORDERS_TREND_30} metric={metric} height={260} />
            </div>
          </Card>
        </Reveal>

        <Reveal delay={0.14}>
          <Card className="h-full pb-5">
            <SectionTitle title="Orders by status" hint="Live snapshot across every shop" />
            <div className="px-5 pt-5">
              <DonutChart
                slices={statusSlices}
                centerValue={num(OVERVIEW.orders.last7Days)}
                centerLabel="orders this week"
                size={168}
              />
            </div>
          </Card>
        </Reveal>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Reveal delay={0.06}>
          <Card className="h-full pb-5">
            <SectionTitle title="Category mix" hint="Share of GMV over 30 days" />
            <div className="px-5 pt-5">
              <BarList rows={categoryRows} />
            </div>
          </Card>
        </Reveal>
        <Reveal delay={0.1}>
          <Card className="h-full pb-5">
            <SectionTitle title="Cities" hint="Where the platform is trading" />
            <div className="px-5 pt-5">
              <BarList rows={cityRows} />
            </div>
          </Card>
        </Reveal>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Can perm="shops.view">
          <Reveal delay={0.06}>
            <Card className="flex h-full flex-col pb-4">
              <SectionTitle
                title="Waiting for approval"
                hint="Longest waiting first"
                action={
                  <Button href="/approvals" variant="ghost" size="sm">
                    Review <ArrowRight className="h-4 w-4" />
                  </Button>
                }
              />
              {queueState === "loading" && <SkeletonRows rows={3} className="mt-4 px-5" />}
              {queueState === "error" && (
                <div className="mt-4 px-5">
                  <InlineError message={queueError ?? "Could not load the review queue."} />
                </div>
              )}
              {queueState === "ready" && (
                <ul className="mt-3 divide-y divide-ink-100">
                  {(queue ?? []).length === 0 && (
                    <li className="px-5 py-8 text-center text-sm text-ink-500">
                      Nothing pending — every application has been decided.
                    </li>
                  )}
                  {(queue ?? []).map((row) => (
                    <li key={row.id}>
                      <Link
                        href={`/approvals?id=${encodeURIComponent(row.id)}`}
                        className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-ink-50"
                      >
                        <Avatar
                          name={row.shopName ?? row.reference}
                          tone="marigold"
                          size={38}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink-900">
                            {row.shopName ?? `Unnamed · ${row.reference}`}
                          </span>
                          <span className="block truncate text-xs text-ink-500">
                            {[
                              row.category?.en,
                              row.area,
                              `${row.documentCount} ${row.documentCount === 1 ? "document" : "documents"}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-ink-400">
                          {ago(row.submittedAt ?? row.createdAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </Reveal>
        </Can>

        <Reveal delay={0.1}>
          <Card className="flex h-full flex-col pb-4">
            <SectionTitle title="Trust and safety" hint="Queues that block customers or shops" />
            <ul className="mt-3 divide-y divide-ink-100">
              {openDisputes.slice(0, 2).map((d) => (
                <li key={d.id} className="flex items-start gap-3 px-5 py-3.5">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#c02636]">
                    <Scale className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <Link
                      href="/disputes"
                      className="block truncate text-sm font-semibold text-ink-900 hover:text-crimson-700"
                    >
                      {d.reason}
                    </Link>
                    <span className="block truncate text-xs text-ink-500">
                      {d.orderCode} · {d.shopName} · {ago(d.createdAt, NOW)}
                    </span>
                  </span>
                  <StatusBadge value={d.status} />
                </li>
              ))}
              {openFraud.slice(0, 2).map((f) => (
                <li key={f.id} className="flex items-start gap-3 px-5 py-3.5">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-crimson-50 text-crimson-600">
                    <ShieldAlert className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <Link
                      href="/fraud"
                      className="block truncate text-sm font-semibold text-ink-900 hover:text-crimson-700"
                    >
                      {f.reason}
                    </Link>
                    <span className="block truncate text-xs text-ink-500">
                      {f.subjectLabel} · {ago(f.createdAt, NOW)}
                    </span>
                  </span>
                  <StatusBadge value={f.status} />
                </li>
              ))}
              {openTickets.slice(0, 2).map((t) => (
                <li key={t.id} className="flex items-start gap-3 px-5 py-3.5">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EAF1FE] text-[#1D4ED8]">
                    <LifeBuoy className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <Link
                      href="/support"
                      className="block truncate text-sm font-semibold text-ink-900 hover:text-crimson-700"
                    >
                      {t.subject}
                    </Link>
                    <span className="block truncate text-xs text-ink-500">
                      {t.code} · {t.requesterName} · {ago(t.updatedAt, NOW)}
                    </span>
                  </span>
                  <StatusBadge value={t.priority} />
                </li>
              ))}
              {openDisputes.length + openFraud.length + openTickets.length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-ink-500">
                  All clear — no disputes, fraud signals or open tickets.
                </li>
              )}
            </ul>
          </Card>
        </Reveal>
      </div>

      <Can perm="audit.view">
        <Reveal delay={0.06} className="mt-4">
          <Card className="pb-4">
            <SectionTitle
              title="Recent platform actions"
              hint="Every console action is written here, with the operator and role"
              action={
                <Button href="/audit" variant="ghost" size="sm">
                  Full log <ArrowRight className="h-4 w-4" />
                </Button>
              }
            />
            <ul className="mt-3 divide-y divide-ink-100">
              {audit.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-5 py-3.5">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-600">
                    <History className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink-800">
                      <span className="font-semibold text-ink-900">{a.actor}</span>{" "}
                      <span className="font-mono text-xs text-crimson-700">{a.action}</span>{" "}
                      <span className="text-ink-600">{a.entityLabel}</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink-500">
                      {a.actorRole} · {a.ip} · {ago(a.createdAt, NOW)}
                      {a.after ? ` · ${a.after}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </Reveal>
      </Can>

      <p className="mt-6 flex items-center gap-2 text-xs text-ink-400">
        <Users className="h-3.5 w-3.5" />
        {num(OVERVIEW.users.active)} active accounts · {num(OVERVIEW.users.newLast7Days)} joined this
        week · {OVERVIEW.riders} shop riders delivering
      </p>




    </>
  );

}

