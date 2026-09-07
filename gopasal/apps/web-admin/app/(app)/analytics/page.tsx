"use client";

import * as React from "react";
import {
  BarChart3,
  Wallet,
  ShoppingBag,
  Store,
  Users,
  Bike,
  TrendingUp,
  MapPin,
  CreditCard,
  Scale,
  PackageSearch,
} from "lucide-react";
import { PageHeader, Card, SectionTitle, Badge, Button } from "@/components/primitives";
import { StatCard } from "@/components/StatCard";
import { PermissionGate, Can } from "@/components/PermissionGate";
import { Reveal } from "@/components/Reveal";
import { TrendChart } from "@/components/charts/TrendChart";
import { DonutChart, type DonutSlice } from "@/components/charts/DonutChart";
import { BarList, type BarRow } from "@/components/charts/BarList";
import { statusLabel, statusTone } from "@/components/StatusBadge";
import { useAdmin, useLang } from "@/components/providers";
import {
  OVERVIEW,
  ORDERS_TREND_30,
  CATEGORY_MIX,
  CITY_MIX,
  PAYMENT_MIX,
  type TrendPoint,
} from "@/lib/data";
import { rs, rsCompact, num, pct } from "@/lib/format";

type Range = 7 | 14 | 30;
type Metric = "gmv" | "orders";

export default function AnalyticsPage() {
  return (
    <PermissionGate
      perm="analytics.platform.view"
      title="You can’t see platform analytics"
      description="Trade figures across every shop need the “View platform analytics” permission."
    >
      <AnalyticsInner />
    </PermissionGate>
  );
}

function AnalyticsInner() {
  const { lang } = useLang();
  const { shops, disputes, moderation } = useAdmin();
  const [range, setRange] = React.useState<Range>(30);
  const [metric, setMetric] = React.useState<Metric>("gmv");

  const series: TrendPoint[] = React.useMemo(
    () => ORDERS_TREND_30.slice(-range),
    [range],
  );

  /* Totals for the chosen window, and the same-length window before it. */
  const stats = React.useMemo(() => {
    const prev = ORDERS_TREND_30.slice(-range * 2, -range);
    const sum = (rows: TrendPoint[], k: Metric) => rows.reduce((s, p) => s + p[k], 0);
    const delta = (k: Metric) => {
      const a = sum(prev, k);
      if (!a) return 0;
      return Math.round(((sum(series, k) - a) / a) * 1000) / 10;
    };
    const orders = sum(series, "orders");
    const gmv = sum(series, "gmv");
    return {
      orders,
      gmv,
      aov: orders ? Math.round(gmv / orders) : 0,
      commission: Math.round(gmv * 0.081),
      dOrders: delta("orders"),
      dGmv: delta("gmv"),
      comparable: prev.length === range,
    };
  }, [series, range]);

  // Seeded with null rather than series[0] so an empty range is a real "no data"
  // answer instead of an assumed first point.
  const best = React.useMemo(
    () => series.reduce<TrendPoint | null>((a, p) => (a === null || p.gmv > a.gmv ? p : a), null),
    [series],
  );

  const statusSlices: DonutSlice[] = Object.entries(OVERVIEW.orders.byStatus)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({
      label: statusLabel(k, lang),
      value: v,
      tone: statusTone(k),
      display: num(v),
    }));

  const paymentSlices: DonutSlice[] = PAYMENT_MIX.map((p) => ({
    label: p.label,
    value: p.amount,
    tone: p.tone as DonutSlice["tone"],
    display: rsCompact(p.amount),
  }));

  const categoryRows: BarRow[] = CATEGORY_MIX.map((c) => ({
    label: lang === "np" ? c.labelNp : c.label,
    value: c.gmv,
    display: rsCompact(c.gmv),
    hint: `${num(c.orders)} orders · ${rs(Math.round(c.gmv / c.orders))} average`,
    tone: c.tone as BarRow["tone"],
  }));

  const cityRows: BarRow[] = CITY_MIX.map((c) => ({
    label: c.city,
    value: c.gmv,
    display: rsCompact(c.gmv),
    hint: `${num(c.shops)} shops · ${num(c.orders)} orders`,
    tone: "crimson",
  }));

  /* Shop leaderboard straight from live provider state, so suspensions show up. */
  const topShops = React.useMemo(
    () =>
      [...shops]
        .filter((s) => s.status === "ACTIVE")
        .sort((a, b) => b.gmv - a.gmv)
        .slice(0, 6),
    [shops],
  );

  const shopRows: BarRow[] = topShops.map((s) => ({
    label: s.name,
    value: s.gmv,
    display: rsCompact(s.gmv),
    hint: `${s.city} · ${num(s.orders)} orders · ${s.ratingCount ? `${s.ratingAvg.toFixed(1)}★` : "no ratings"}`,
    tone: s.accent as BarRow["tone"],
  }));

  const openDisputes = disputes.filter(
    (d) => d.status === "OPEN" || d.status === "UNDER_REVIEW",
  ).length;
  const disputeRate = OVERVIEW.orders.total
    ? Math.round((disputes.length / OVERVIEW.orders.total) * 10000) / 100
    : 0;

  return (
    <>
      <PageHeader
        icon={<BarChart3 className="h-5 w-5" />}
        title={lang === "np" ? "प्लेटफर्म विश्लेषण" : "Platform analytics"}
        subtitle={
          lang === "np"
            ? "सबै पसलको कारोबार एकै ठाउँमा — शहर, वर्ग र भुक्तानी अनुसार"
            : "Trade across every shop, broken down by city, category and how people paid"
        }
        actions={
          <>
            <div className="flex items-center gap-1 rounded-xl bg-ink-100 p-1">
              {([7, 14, 30] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  aria-pressed={range === r}
                  className={
                    range === r
                      ? "rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-ink-900 shadow-sm"
                      : "rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-500 hover:text-ink-800"
                  }
                >
                  {r}d
                </button>
              ))}
            </div>
            <Can perm="finance.view">
              <Button href="/finance" variant="outline" size="sm">
                <Wallet className="h-4 w-4" /> Finance
              </Button>
            </Can>
          </>
        }
      />

      <Reveal className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`GMV · last ${range} days`}
          value={rsCompact(stats.gmv)}
          icon={Wallet}
          tone="crimson"
          delta={stats.comparable ? stats.dGmv : undefined}
          hint={`Commission ${rsCompact(stats.commission)} at 8.1%`}
        />
        <StatCard
          label={`Orders · last ${range} days`}
          value={num(stats.orders)}
          icon={ShoppingBag}
          tone="blue"
          delta={stats.comparable ? stats.dOrders : undefined}
          hint={`${num(OVERVIEW.orders.total)} all time`}
        />
        <StatCard
          label="Average order value"
          value={rs(stats.aov)}
          icon={TrendingUp}
          tone="green"
          hint={`${pct(OVERVIEW.codShare)} paid cash on delivery`}
        />
        <StatCard
          label="Best day in window"
          value={rsCompact(best?.gmv ?? 0)}
          icon={BarChart3}
          tone="marigold"
          hint={best ? `${num(best.orders)} orders on ${best.day}` : "No data"}
        />
      </Reveal>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Reveal delay={0.06} className="lg:col-span-2">
          <Card className="h-full pb-5">
            <SectionTitle
              title={metric === "gmv" ? "Gross merchandise value" : "Orders placed"}
              hint={`Last ${range} days · hover for a single day`}
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
              <TrendChart data={series} metric={metric} height={280} />
            </div>
          </Card>
        </Reveal>

        <Reveal delay={0.1}>
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
            <SectionTitle
              title="Category mix"
              hint="Share of GMV over 30 days"
              action={
                <Badge tone="ink" dot={false}>
                  <PackageSearch className="h-3.5 w-3.5" /> {num(CATEGORY_MIX.length)} categories
                </Badge>
              }
            />
            <div className="px-5 pt-5">
              <BarList rows={categoryRows} />
            </div>
          </Card>
        </Reveal>
        <Reveal delay={0.1}>
          <Card className="h-full pb-5">
            <SectionTitle
              title="Cities"
              hint="Where the platform is trading"
              action={
                <Badge tone="crimson" dot={false}>
                  <MapPin className="h-3.5 w-3.5" /> {num(CITY_MIX.length)} cities
                </Badge>
              }
            />
            <div className="px-5 pt-5">
              <BarList rows={cityRows} />
            </div>
          </Card>
        </Reveal>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Reveal delay={0.06} className="lg:col-span-2">
          <Card className="h-full pb-5">
            <SectionTitle
              title="Busiest shops"
              hint="Active shops only, ranked by GMV"
              action={
                <Button href="/shops" variant="ghost" size="sm">
                  <Store className="h-4 w-4" /> All shops
                </Button>
              }
            />
            <div className="px-5 pt-5">
              <BarList rows={shopRows} />
            </div>
          </Card>
        </Reveal>
        <Reveal delay={0.1}>
          <Card className="h-full pb-5">
            <SectionTitle title="How people paid" hint="Share of collected value" />
            <div className="px-5 pt-5">
              <DonutChart
                slices={paymentSlices}
                centerValue={pct(OVERVIEW.codShare)}
                centerLabel="cash on delivery"
                size={168}
              />
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-ink-50 px-3.5 py-3 text-xs text-ink-600">
                <CreditCard className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
                Cash still dominates. Every COD rupee sits with the shop until it is remitted, which
                is why the finance page tracks the float separately.
              </p>
            </div>
          </Card>
        </Reveal>
      </div>

      <Reveal delay={0.06} className="mt-4">
        <Card className="pb-5">
          <SectionTitle
            title="Marketplace health"
            hint="The numbers that say whether people are being served well"
          />
          <div className="grid gap-3 px-5 pt-5 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl bg-ink-50 px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
                <Store className="h-3.5 w-3.5" /> Shops trading
              </p>
              <p className="mt-1 text-lg font-bold text-ink-900">{num(OVERVIEW.shops.active)}</p>
              <p className="text-xs text-ink-500">
                {num(OVERVIEW.shops.pending)} waiting · {num(OVERVIEW.shops.suspended)} suspended
              </p>
            </div>
            <div className="rounded-xl bg-ink-50 px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
                <Users className="h-3.5 w-3.5" /> Accounts
              </p>
              <p className="mt-1 text-lg font-bold text-ink-900">{num(OVERVIEW.users.active)}</p>
              <p className="text-xs text-ink-500">
                {num(OVERVIEW.users.newLast7Days)} joined this week
              </p>
            </div>
            <div className="rounded-xl bg-ink-50 px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
                <Scale className="h-3.5 w-3.5" /> Dispute rate
              </p>
              <p className="mt-1 text-lg font-bold text-ink-900">{disputeRate}%</p>
              <p className="text-xs text-ink-500">
                {num(openDisputes)} open · {num(moderation.filter((m) => m.isActive).length)} listings
                reported
              </p>
            </div>
            <div className="rounded-xl bg-ink-50 px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
                <Bike className="h-3.5 w-3.5" /> Shop riders
              </p>
              <p className="mt-1 text-lg font-bold text-ink-900">{num(OVERVIEW.riders)}</p>
              <p className="text-xs text-ink-500">Employed by shops, not by GoPasal</p>
            </div>
          </div>
        </Card>
      </Reveal>

      <p className="mt-6 text-xs text-ink-400">
        Every figure here is read-only. Numbers are computed from completed orders and never include
        an estimate of delivery time.
      </p>


    </>
  );
}

