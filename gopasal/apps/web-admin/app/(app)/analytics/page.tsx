"use client";

import * as React from "react";
import { BarChart3, Download, ShoppingBag, Store, Users, Wallet } from "lucide-react";
import { PermissionGate } from "@/components/PermissionGate";
import { PageHeader, Button, Card, SectionTitle } from "@/components/primitives";
import { StatCard } from "@/components/StatCard";
import { TrendChart } from "@/components/charts/TrendChart";
import { adminApi, type AdminOverview, type TrendPoint } from "@/lib/api/admin";
import { num, pct, rsCompact } from "@/lib/format";

export default function AnalyticsPage() {
  return <PermissionGate perm="analytics.platform.view"><Analytics /></PermissionGate>;
}

function Analytics() {
  const [overview, setOverview] = React.useState<AdminOverview | null>(null);
  const [trend, setTrend] = React.useState<TrendPoint[]>([]);
  const [days, setDays] = React.useState(30);
  const [metric, setMetric] = React.useState<"gmv" | "orders">("gmv");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void Promise.all([adminApi.overview(), adminApi.trend(days)])
      .then(([summary, rows]) => { setOverview(summary); setTrend(rows); setError(null); })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load analytics"));
  }, [days]);

  const total = overview?.orders.total ?? 0;
  const delivered = overview?.orders.byStatus.DELIVERED ?? 0;
  const cancelled = (overview?.orders.byStatus.CANCELLED ?? 0) + (overview?.orders.byStatus.REJECTED ?? 0);
  const exportCsv = () => {
    const rows = ["date,orders,delivered_gmv", ...trend.map((row) => `${row.day},${row.orders},${row.gmv}`)];
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `gopasal-platform-${days}-days.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <>
    <PageHeader icon={<BarChart3 className="h-5 w-5" />} title="Platform analytics" subtitle="Live order, GMV, shop and customer aggregates from PostgreSQL" actions={<div className="flex gap-2"><select value={days} onChange={(event) => setDays(Number(event.target.value))} className="rounded-xl border border-ink-200 bg-white px-3 text-sm"><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select><Button variant="outline" size="sm" onClick={exportCsv} disabled={trend.length === 0}><Download className="h-4 w-4" /> Export CSV</Button></div>} />
    {error && <p className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {!overview ? <p className="text-sm text-ink-500">Loading platform analytics…</p> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Delivered GMV" value={rsCompact(overview.gmv)} icon={Wallet} tone="crimson" /><StatCard label="All orders" value={num(total)} icon={ShoppingBag} tone="blue" /><StatCard label="Active shops" value={num(overview.shops.active)} icon={Store} tone="green" /><StatCard label="Active users" value={num(overview.users.active)} icon={Users} tone="marigold" /></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]"><Card className="pb-5"><SectionTitle title={metric === "gmv" ? "Delivered GMV" : "Orders placed"} hint={`Last ${days} days`} action={<div className="flex gap-1">{(["gmv", "orders"] as const).map((value) => <button key={value} onClick={() => setMetric(value)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${metric === value ? "bg-ink-900 text-white" : "bg-ink-100"}`}>{value.toUpperCase()}</button>)}</div>} /><div className="px-5 pt-5"><TrendChart data={trend} metric={metric} height={280} /></div></Card><Card className="p-5"><h2 className="font-bold text-ink-900">Reliability indicators</h2><dl className="mt-4 space-y-4"><Metric label="Delivery success" value={pct(total ? delivered / total * 100 : 0)} /><Metric label="Cancellation rate" value={pct(total ? cancelled / total * 100 : 0)} /><Metric label="Pending shops" value={num(overview.shops.pending)} /><Metric label="Registered riders" value={num(overview.riders)} /></dl><p className="mt-5 text-xs leading-5 text-ink-500">Calculated from persisted orders. CSV uses exact daily values, not browser fixtures.</p></Card></div>
    </>}
  </>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between border-b border-ink-100 pb-3 text-sm"><dt className="text-ink-500">{label}</dt><dd className="font-bold text-ink-900">{value}</dd></div>;
}
