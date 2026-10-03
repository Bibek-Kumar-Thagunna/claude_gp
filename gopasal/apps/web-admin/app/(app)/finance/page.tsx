"use client";

import * as React from "react";
import { ArrowDownToLine, ArrowUpFromLine, Landmark, RefreshCw, RotateCcw, Scale, ShieldCheck, Wallet } from "lucide-react";
import { Can, PermissionGate } from "@/components/PermissionGate";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/primitives";
import { adminApi, type FinanceJournal, type FinanceOverview, type FinanceRefund, type FinanceSettlement } from "@/lib/api/admin";
import { fullDate, rs } from "@/lib/format";

const EMPTY: FinanceOverview = { escrow: { held: 0, orders: 0, releasedSellerPayable: 0, releasedOrders: 0 }, cod: { commissionDue: 0, orders: 0 }, refunds: { amount: 0, count: 0 }, settlements: {}, ledger: {}, generatedAt: "" };

export default function FinancePage() {
  return <PermissionGate perm="finance.platform.view"><Finance /></PermissionGate>;
}

function Finance() {
  const [overview, setOverview] = React.useState(EMPTY);
  const [settlements, setSettlements] = React.useState<FinanceSettlement[]>([]);
  const [journals, setJournals] = React.useState<FinanceJournal[]>([]);
  const [refunds, setRefunds] = React.useState<FinanceRefund[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const [nextOverview, nextSettlements, nextJournals, nextRefunds] = await Promise.all([adminApi.financeOverview(), adminApi.settlements(), adminApi.financeLedger(), adminApi.financeRefunds()]);
    setOverview(nextOverview); setSettlements(nextSettlements); setJournals(nextJournals); setRefunds(nextRefunds);
  }, []);
  React.useEffect(() => { void load().catch((cause: unknown) => setError(readError(cause))); }, [load]);

  const reconcile = async () => {
    setBusy(true); setError(null);
    try { await adminApi.reconcileFinance(); await load(); }
    catch (cause) { setError(readError(cause)); }
    finally { setBusy(false); }
  };
  const complete = async (row: FinanceSettlement) => {
    const reference = window.prompt("Bank/wallet transaction reference");
    if (!reference?.trim()) return;
    setBusy(true); setError(null);
    try { await adminApi.completeSettlement(row.id, { outcome: "success", providerReference: reference.trim() }); await load(); }
    catch (cause) { setError(readError(cause)); }
    finally { setBusy(false); }
  };
  const completeRefund = async (row: FinanceRefund) => {
    const reference = window.prompt(
      row.method === "ORIGINAL_SOURCE"
        ? "Gateway refund reference"
        : "Bank/wallet transfer reference",
    );
    if (!reference?.trim()) return;
    setBusy(true); setError(null);
    try { await adminApi.completeRefund(row.id, { outcome: "success", providerReference: reference.trim() }); await load(); }
    catch (cause) { setError(readError(cause)); }
    finally { setBusy(false); }
  };
  const processRefund = async (row: FinanceRefund) => {
    if (!window.confirm(`Send ${rs(row.amount)} back through Khalti now?`)) return;
    setBusy(true); setError(null);
    try { await adminApi.processRefund(row.id); await load(); }
    catch (cause) { setError(readError(cause)); }
    finally { setBusy(false); }
  };
  const failRefund = async (row: FinanceRefund) => {
    const reason = window.prompt("Why did this refund attempt fail?");
    if (!reason?.trim()) return;
    setBusy(true); setError(null);
    try { await adminApi.completeRefund(row.id, { outcome: "failure", failureReason: reason.trim() }); await load(); }
    catch (cause) { setError(readError(cause)); }
    finally { setBusy(false); }
  };

  return <>
    <PageHeader icon={<Landmark className="h-5 w-5" />} title="Finance & settlements" subtitle="Escrow release, COD commission collection, refunds and an immutable balanced ledger" actions={<Can perm="finance.manage"><Button disabled={busy} onClick={() => void reconcile()}><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Reconcile now</Button></Can>} />
    {error && <p role="alert" className="mb-5 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<ShieldCheck />} label="Held in escrow" value={rs(overview.escrow.held)} hint={`${overview.escrow.orders} paid orders in protection window`} />
      <Metric icon={<ArrowDownToLine />} label="Seller payable" value={rs(overview.escrow.releasedSellerPayable)} hint={`${overview.escrow.releasedOrders} released orders`} />
      <Metric icon={<ArrowUpFromLine />} label="COD commission due" value={rs(overview.cod.commissionDue)} hint={`${overview.cod.orders} cash orders`} />
      <Metric icon={<Scale />} label="Refunds issued" value={rs(overview.refunds.amount)} hint={`${overview.refunds.count} refunds`} />
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
      <Card className="overflow-hidden"><div className="border-b border-ink-100 p-5"><h2 className="font-bold text-ink-900">Settlement batches</h2><p className="mt-1 text-xs text-ink-500">Online payouts and COD commission collections stay separate and auditable.</p></div>
        {settlements.length === 0 ? <EmptyState icon={<Wallet />} title="No settlement batches" description="Run reconciliation after an eligible delivered order." /> : <div className="divide-y divide-ink-100">{settlements.map((row) => <article key={row.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><strong>{row.code}</strong><Badge tone={row.status === "PAID" ? "green" : row.status === "FAILED" ? "red" : "marigold"}>{row.status}</Badge></div><p className="mt-1 text-sm text-ink-600">{row.shop.name} · {row.lines.length} orders</p><p className="mt-1 text-xs text-ink-500">{row.direction === "PAYOUT_TO_SELLER" ? "Pay seller" : "Collect from seller"} · {fullDate(row.createdAt)}</p></div><div className="text-right"><p className="text-lg font-bold text-ink-900">{rs(Math.abs(row.netAmount))}</p>{row.status === "OPEN" && <Can perm="finance.manage"><Button size="sm" className="mt-2" disabled={busy} onClick={() => void complete(row)}>Record transfer</Button></Can>}</div></div>{row.providerReference && <p className="mt-3 rounded-lg bg-ink-50 p-2 text-xs text-ink-600">Reference: {row.providerReference}</p>}</article>)}</div>}
      </Card>
      <Card className="overflow-hidden"><div className="border-b border-ink-100 p-5"><h2 className="font-bold text-ink-900">Ledger health</h2><p className="mt-1 text-xs text-ink-500">Every journal balances debit = credit. Account balances show their Dr/Cr side.</p></div><div className="space-y-3 p-5">{Object.entries(overview.ledger).map(([account, amount]) => <div key={account} className="flex justify-between gap-3 text-sm"><span className="text-ink-600">{account.replaceAll("_", " ").toLowerCase()}</span><strong>{amount === 0 ? rs(0) : `${amount > 0 ? "Dr" : "Cr"} ${rs(Math.abs(amount))}`}</strong></div>)}{Object.keys(overview.ledger).length === 0 && <p className="text-sm text-ink-500">No entries yet.</p>}</div></Card>
    </div>

    <Card className="mt-6 overflow-hidden">
      <div className="border-b border-ink-100 p-5">
        <h2 className="flex items-center gap-2 font-bold text-ink-900"><RotateCcw className="h-4 w-4 text-crimson-600" /> Refund operations</h2>
        <p className="mt-1 text-xs text-ink-500">Paid cancellations are reserved automatically. Record only a real gateway, bank or wallet result.</p>
      </div>
      {refunds.length === 0 ? <EmptyState icon={<RotateCcw />} title="No refunds" description="Cancellation and dispute refunds will appear here." /> : <div className="divide-y divide-ink-100">{refunds.map((row) => <article key={row.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><strong>{row.code}</strong><Badge tone={row.status === "COMPLETED" ? "green" : row.status === "FAILED" ? "red" : "marigold"}>{row.status}</Badge></div><p className="mt-1 text-sm text-ink-700">Order {row.order.code} · {row.order.shop.name}</p><p className="mt-1 text-xs text-ink-500">{row.order.customer.name ?? row.order.customer.phone} · {row.method === "ORIGINAL_SOURCE" ? `Return to ${row.order.paymentMethod}` : "Manual transfer"}</p><p className="mt-2 max-w-2xl text-sm text-ink-600">{row.reason}</p>{row.failureReason && <p className="mt-2 text-xs font-semibold text-red-700">Last failure: {row.failureReason}</p>}{row.providerRef && <p className="mt-2 font-mono text-xs text-ink-500">Reference: {row.providerRef}</p>}</div><div className="text-right"><strong className="text-lg text-ink-900">{rs(row.amount)}</strong>{(row.status === "PENDING" || row.status === "PROCESSING") && <Can perm="finance.manage"><div className="mt-3 flex flex-wrap justify-end gap-2">{row.order.paymentMethod === "KHALTI" && row.method === "ORIGINAL_SOURCE" && row.amount === row.order.total && <Button size="sm" disabled={busy || row.status === "PROCESSING"} onClick={() => void processRefund(row)}>Refund through Khalti</Button>}<Button size="sm" variant="outline" disabled={busy} onClick={() => void completeRefund(row)}>Record external refund</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void failRefund(row)}>Record failure</Button></div></Can>}</div></div></article>)}</div>}
    </Card>

    <Card className="mt-6 overflow-hidden"><div className="border-b border-ink-100 p-5"><h2 className="font-bold text-ink-900">Recent immutable journals</h2></div>{journals.length === 0 ? <p className="p-8 text-center text-sm text-ink-500">Money events will appear here.</p> : <div className="divide-y divide-ink-100">{journals.slice(0, 30).map((journal) => { const debit = journal.entries.reduce((sum, entry) => sum + entry.debit, 0); const credit = journal.entries.reduce((sum, entry) => sum + entry.credit, 0); return <div key={journal.id} className="grid gap-2 p-4 text-sm md:grid-cols-[1fr_auto_auto]"><div><strong>{journal.description}</strong><p className="text-xs text-ink-500">{journal.order?.code ?? journal.shop?.name ?? "Platform"} · {fullDate(journal.createdAt)}</p></div><span className="text-ink-600">Dr {rs(debit)} / Cr {rs(credit)}</span><Badge tone={debit === credit ? "green" : "red"}>{debit === credit ? "Balanced" : "Mismatch"}</Badge></div>; })}</div>}</Card>
  </>;
}

function Metric({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return <Card className="p-5"><span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-crimson-50 text-crimson-600">{icon}</span><p className="mt-4 text-2xl font-bold text-ink-900">{value}</p><p className="text-sm font-semibold text-ink-700">{label}</p><p className="mt-1 text-xs text-ink-500">{hint}</p></Card>;
}

const readError = (cause: unknown) => cause instanceof Error ? cause.message : "Could not load finance data.";
