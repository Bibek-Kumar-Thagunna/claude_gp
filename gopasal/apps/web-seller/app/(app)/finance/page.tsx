"use client";

import * as React from "react";
import { ArrowDownToLine, ArrowUpFromLine, Banknote, Clock3, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { PermissionGate } from "@/components/PermissionGate";
import { useAuth } from "@/components/auth-provider";
import { useShops } from "@/components/shop-provider";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/primitives";
import { StatCard } from "@/components/StatCard";
import { ErrorPanel, SkeletonRows } from "@/components/states";
import { fetchShopFinance, type SellerFinanceWire, type SettlementWire } from "@/lib/api/finance";
import { dayMonth, rs } from "@/lib/format";

type Row = { shopName: string; data: SellerFinanceWire };

export default function FinancePage() {
  return <PermissionGate perm="finance.view"><Finance /></PermissionGate>;
}

function Finance() {
  const { shops, activeShop, activeShopId } = useShops();
  const { canInShop } = useAuth();
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const ids = shops.filter((shop) => (!activeShopId || shop.id === activeShopId) && canInShop(shop.id, "finance.view"));
  const key = ids.map((shop) => shop.id).join(",");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const requested = key ? key.split(",") : [];
      const result = await Promise.all(requested.map(async (id) => ({ shopName: shops.find((shop) => shop.id === id)?.name ?? id, data: await fetchShopFinance(id) })));
      setRows(result);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load finance");
    } finally {
      setLoading(false);
    }
  }, [key, shops]);

  React.useEffect(() => { void load(); }, [load]);
  const total = (pick: (row: SellerFinanceWire["summary"]) => number) => rows.reduce((sum, row) => sum + pick(row.data.summary), 0);
  const settlements = rows.flatMap((row) => row.data.settlements.map((settlement) => ({ ...settlement, shopName: row.shopName })));
  const refunds = rows.flatMap((row) => row.data.refunds.map((refund) => ({ ...refund, shopName: row.shopName })));

  return <div>
    <PageHeader icon={<Wallet className="h-5 w-5" />} title="Finance & settlements" subtitle={activeShop ? `${activeShop.name} · auditable money movement` : "All shops · auditable money movement"} actions={<Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4" /> Refresh</Button>} />
    {error && <ErrorPanel title="Couldn’t load finance" message={error} onRetry={load} />}
    {loading && rows.length === 0 ? <SkeletonRows rows={3} /> : <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Held in escrow" value={rs(total((s) => s.escrowHeld))} icon={ShieldCheck} tone="blue" hint="Online payments waiting for delivery/dispute window" />
        <StatCard label="Ready for payout" value={rs(total((s) => s.onlineReady))} icon={ArrowDownToLine} tone="green" hint="Released online proceeds before COD offset" />
        <StatCard label="COD commission due" value={rs(total((s) => s.codCommissionDue))} icon={ArrowUpFromLine} tone="marigold" hint="What the shop owes GoPasal after collecting cash" />
        <StatCard label="Open net settlement" value={rs(Math.abs(total((s) => s.openSettlementAmount)))} icon={Banknote} tone="crimson" hint={total((s) => s.openSettlementAmount) < 0 ? "Collection due to GoPasal" : "Payout due to your shop"} />
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="border-b border-ink-100 p-5"><h2 className="font-bold text-ink-900">Settlement history</h2><p className="mt-1 text-sm text-ink-500">Online proceeds are offset against commission on cash your team collected.</p></div>
        {settlements.length === 0 ? <EmptyState icon={<Clock3 />} title="No settlement batch yet" description="GoPasal Finance creates a batch after eligible escrow is released or COD commission becomes due." /> : <div className="divide-y divide-ink-100">{settlements.map((row) => <SettlementRow key={row.id} row={row} shopName={row.shopName} />)}</div>}
      </Card>

      <Card className="mt-4 p-5"><h2 className="font-bold text-ink-900">Refund adjustments</h2>{refunds.length === 0 ? <p className="mt-3 text-sm text-ink-500">No refunds have affected these shops.</p> : <div className="mt-3 divide-y divide-ink-100">{refunds.map((refund) => <div key={refund.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span><strong>{refund.code}</strong><span className="ml-2 text-ink-500">Order {refund.order.code} · {refund.shopName}</span><span className="block text-xs text-ink-400">{refund.reason} · {dayMonth(refund.createdAt)}</span></span><strong className="text-crimson-600">−{rs(refund.amount)}</strong></div>)}</div>}</Card>
    </>}
  </div>;
}

function SettlementRow({ row, shopName }: { row: SettlementWire; shopName: string }) {
  const payout = row.direction === "PAYOUT_TO_SELLER";
  const tone = row.status === "PAID" ? "green" : row.status === "FAILED" ? "red" : "marigold";
  return <div className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><strong className="font-mono text-sm">{row.code}</strong><Badge tone={tone}>{row.status}</Badge></div><p className="mt-1 text-sm text-ink-500">{shopName} · {row.lines.length} order{row.lines.length === 1 ? "" : "s"} · created {dayMonth(row.createdAt)}</p></div><div className="text-right"><strong className={payout ? "text-[#0B7E58]" : "text-crimson-600"}>{payout ? "+" : "−"}{rs(Math.abs(row.netAmount))}</strong><p className="text-xs text-ink-500">{payout ? "GoPasal pays your shop" : "Your shop pays GoPasal"}</p></div></div><div className="mt-4 grid gap-2 rounded-xl bg-ink-50 p-3 text-sm sm:grid-cols-3"><span>Online payable <strong className="block">{rs(row.onlineSellerPayable)}</strong></span><span>COD commission <strong className="block">{rs(row.codCommissionReceivable)}</strong></span><span>Refunds in batch <strong className="block">{rs(row.refundAdjustments)}</strong></span></div>{row.providerReference && <p className="mt-3 text-xs text-ink-500">Transfer reference: <span className="font-mono text-ink-700">{row.providerReference}</span></p>}</div>;
}
