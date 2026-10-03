"use client";

import * as React from "react";
import { LayoutDashboard, ShoppingBag, Store, Users, Wallet } from "lucide-react";
import { PermissionGate } from "@/components/PermissionGate";
import { PageHeader, Card, SectionTitle, Button } from "@/components/primitives";
import { StatCard } from "@/components/StatCard";
import { TrendChart } from "@/components/charts/TrendChart";
import { adminApi, type AdminOverview, type TrendPoint } from "@/lib/api/admin";
import { num, rsCompact } from "@/lib/format";

export default function DashboardPage() {
  return <PermissionGate perm="admin.dashboard.view"><Dashboard /></PermissionGate>;
}

function Dashboard() {
  const [overview, setOverview] = React.useState<AdminOverview | null>(null);
  const [trend, setTrend] = React.useState<TrendPoint[]>([]);
  const [metric, setMetric] = React.useState<"gmv" | "orders">("gmv");
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    void Promise.all([adminApi.overview(), adminApi.trend(30)])
      .then(([summary, series]) => { setOverview(summary); setTrend(series); setError(null); })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load platform metrics"));
  }, []);
  return <>
    <PageHeader icon={<LayoutDashboard className="h-5 w-5" />} title="Platform overview" subtitle="Persisted platform metrics and operational queues" actions={<Button href="/approvals" variant="outline" size="sm">Review onboarding</Button>} />
    {error && <p className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {!overview ? <p className="text-sm text-ink-500">Loading live metrics…</p> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Delivered GMV" value={rsCompact(overview.gmv)} icon={Wallet} tone="crimson" hint="All-time delivered orders" />
        <StatCard label="Orders · last 7 days" value={num(overview.orders.last7Days)} icon={ShoppingBag} tone="blue" hint={`${num(overview.orders.total)} all time`} />
        <StatCard label="Active shops" value={num(overview.shops.active)} icon={Store} tone="green" hint={`${overview.shops.pending} pending · ${overview.shops.suspended} suspended`} href="/shops" />
        <StatCard label="Active users" value={num(overview.users.active)} icon={Users} tone="marigold" hint={`${overview.users.newLast7Days} new this week`} href="/users" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="pb-5"><SectionTitle title={metric === "gmv" ? "Gross merchandise value" : "Orders placed"} hint="Last 30 days · database aggregate" action={<div className="flex gap-1">{(["gmv", "orders"] as const).map((value) => <button key={value} onClick={() => setMetric(value)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${metric === value ? "bg-ink-900 text-white" : "bg-ink-100"}`}>{value.toUpperCase()}</button>)}</div>} /><div className="px-5 pt-5"><TrendChart data={trend} metric={metric} height={260} /></div></Card>
        <Card className="p-5"><h2 className="font-bold text-ink-900">Operations snapshot</h2><dl className="mt-5 space-y-4 text-sm"><Row label="Pending shops" value={overview.shops.pending} /><Row label="Riders" value={overview.riders} /><Row label="Placed orders" value={overview.orders.byStatus.PLACED ?? 0} /><Row label="Out for delivery" value={overview.orders.byStatus.OUT_FOR_DELIVERY ?? 0} /></dl><Button href="/shops" className="mt-6 w-full">Manage shops</Button></Card>
      </div>
    </>}
  </>;
}

function Row({ label, value }: { label: string; value: number }) { return <div className="flex justify-between border-b border-ink-100 pb-3"><dt className="text-ink-500">{label}</dt><dd className="font-bold text-ink-900">{num(value)}</dd></div>; }
