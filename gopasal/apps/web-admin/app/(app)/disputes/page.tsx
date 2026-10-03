"use client";

/* eslint-disable @next/next/no-img-element -- authenticated evidence blobs cannot use the Next image optimizer */

import * as React from "react";
import { Camera, Loader2, Scale, ShieldCheck } from "lucide-react";
import { PermissionGate, Can } from "@/components/PermissionGate";
import { PageHeader, EmptyState, Button, Card, FilterPills } from "@/components/primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { adminApi, type AdminDispute } from "@/lib/api/admin";
import { fullDate, rs } from "@/lib/format";

type Filter = "ALL" | AdminDispute["status"];

export default function DisputesPage() {
  return <PermissionGate perm="disputes.view"><Disputes /></PermissionGate>;
}

function Disputes() {
  const [rows, setRows] = React.useState<AdminDispute[]>([]);
  const [selected, setSelected] = React.useState<AdminDispute | null>(null);
  const [filter, setFilter] = React.useState<Filter>("ALL");
  const [resolution, setResolution] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadRows = React.useCallback(async () => {
    const data = await adminApi.disputes(filter === "ALL" ? undefined : filter);
    setRows(data);
    return data;
  }, [filter]);
  React.useEffect(() => { void loadRows().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load disputes")); }, [loadRows]);
  const open = async (id: string) => { try { setSelected(await adminApi.dispute(id)); setResolution(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open dispute"); } };
  const refresh = async (id: string) => { await loadRows(); setSelected(await adminApi.dispute(id)); };
  const review = async () => { if (!selected) return; setBusy(true); try { await adminApi.reviewDispute(selected.id); await refresh(selected.id); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not begin review"); } finally { setBusy(false); } };
  const resolve = async (status: "RESOLVED_CUSTOMER" | "RESOLVED_SHOP" | "REJECTED") => {
    if (!selected || resolution.trim().length < 3 || !window.confirm("Record this final dispute decision? The action is audit logged.")) return;
    setBusy(true);
    try { await adminApi.resolveDispute(selected.id, { status, resolution: resolution.trim() }); await refresh(selected.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not resolve dispute"); }
    finally { setBusy(false); }
  };
  const refundAndResolve = async () => {
    if (!selected || resolution.trim().length < 3) return;
    const typed = window.prompt(`Refund amount for ${selected.order.code} (maximum ${rs(selected.order.total)})`, String(selected.order.total));
    if (typed == null) return;
    const amount = Number(typed);
    if (!Number.isInteger(amount) || amount <= 0 || amount > selected.order.total) { setError("Enter a whole-rupee refund up to the order total."); return; }
    if (!window.confirm(`Issue ${rs(amount)} and resolve this dispute for the customer? Both actions are audit logged.`)) return;
    setBusy(true); setError(null);
    try {
      await adminApi.issueRefund(selected.orderId, { amount, reason: resolution.trim(), method: selected.order.paymentMethod === "COD" ? "MANUAL_TRANSFER" : "ORIGINAL_SOURCE" });
      await adminApi.resolveDispute(selected.id, { status: "RESOLVED_CUSTOMER", resolution: `${resolution.trim()} Refund issued: ${rs(amount)}.` });
      await refresh(selected.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not issue the refund"); }
    finally { setBusy(false); }
  };
  const closed = selected && ["RESOLVED_CUSTOMER", "RESOLVED_SHOP", "REJECTED"].includes(selected.status);

  return <>
    <PageHeader icon={<Scale className="h-5 w-5" />} title="Disputes" subtitle="Evidence-led, audit-logged order dispute review" />
    <FilterPills value={filter} onChange={setFilter} className="mb-4" options={[{ value: "ALL", label: "All" }, { value: "OPEN", label: "Open" }, { value: "UNDER_REVIEW", label: "Under review" }, { value: "RESOLVED_CUSTOMER", label: "Customer" }, { value: "RESOLVED_SHOP", label: "Shop" }, { value: "REJECTED", label: "Rejected" }]} />
    {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {rows.length === 0 ? <EmptyState icon={<Scale />} title="No disputes in this queue" description="Customer disputes will appear here with their order evidence." /> : <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
      <div className="space-y-2">{rows.map((row) => <button key={row.id} onClick={() => void open(row.id)} className={`w-full rounded-xl border bg-white p-4 text-left ${selected?.id === row.id ? "border-crimson-400" : "border-ink-200"}`}><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-ink-900">{row.order.code}</strong><p className="mt-1 text-sm text-ink-600">{row.reason}</p></div><StatusBadge value={row.status} /></div><p className="mt-2 text-xs text-ink-500">{rs(row.order.total)} · {fullDate(row.createdAt)}</p></button>)}</div>
      <Card className="p-5">{selected ? <><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-bold text-ink-900">{selected.order.code}</h2><p className="text-sm text-ink-500">{selected.order.shop?.name ?? "Shop"} · {rs(selected.order.total)}</p></div><StatusBadge value={selected.status} /></div><div className="mt-5 rounded-xl bg-ink-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-ink-500">Customer statement</p><p className="mt-2 font-semibold text-ink-900">{selected.reason}</p>{selected.detail && <p className="mt-2 whitespace-pre-wrap text-sm text-ink-600">{selected.detail}</p>}</div>{selected.order.items && <div className="mt-5"><h3 className="text-sm font-bold text-ink-800">Order evidence</h3><div className="mt-2 divide-y divide-ink-100 rounded-xl border border-ink-100">{selected.order.items.map((item) => <div key={item.id} className="flex justify-between p-3 text-sm"><span>{item.qty}× {item.nameSnapshot}</span><strong>{rs(item.price * item.qty)}</strong></div>)}</div></div>}<DeliveryEvidence orderId={selected.orderId} delivery={selected.order.delivery} />{closed ? <div className="mt-5 rounded-xl bg-green-50 p-4 text-sm text-green-800"><strong>Final resolution</strong><p className="mt-1">{selected.resolution ?? "Decision recorded."}</p></div> : <Can perm="disputes.resolve"><div className="mt-5"><textarea rows={4} maxLength={2000} value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="Record evidence reviewed, reasoning, and the customer/shop outcome…" className="w-full rounded-xl border border-ink-200 p-3 text-sm outline-none focus:border-crimson-400" />{selected.status === "OPEN" && <Button className="mt-3" variant="outline" disabled={busy} onClick={() => void review()}><ShieldCheck className="h-4 w-4" /> Begin review</Button>}<div className="mt-3 flex flex-wrap gap-2"><Button disabled={busy || resolution.trim().length < 3 || !["PAID", "PARTIALLY_REFUNDED"].includes(selected.order.paymentStatus ?? "")} onClick={() => void refundAndResolve()}>Refund &amp; resolve for customer</Button><Button variant="outline" disabled={busy || resolution.trim().length < 3} onClick={() => void resolve("RESOLVED_SHOP")}>Resolve for shop</Button><Button variant="danger" disabled={busy || resolution.trim().length < 3} onClick={() => void resolve("REJECTED")}>Reject claim</Button></div><p className="mt-3 text-xs text-ink-500">Customer outcomes return online funds to the original source, or record a manual transfer for COD. Every refund and decision is separately audit logged.</p></div></Can>}</> : <p className="py-16 text-center text-sm text-ink-500">Select a dispute to inspect its evidence.</p>}</Card>
    </div>}
  </>;
}

function DeliveryEvidence({ orderId, delivery }: { orderId: string; delivery: AdminDispute["order"]["delivery"] }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  if (!delivery?.hasProofPhoto && !delivery?.podNote) return null;
  const open = async () => {
    setBusy(true); setError(null);
    try {
      const blob = await adminApi.deliveryProof(orderId);
      setUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return URL.createObjectURL(blob); });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open delivery proof"); }
    finally { setBusy(false); }
  };
  return <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-700" /><h3 className="text-sm font-bold text-ink-800">Delivery handover evidence</h3></div>{delivery.podNote && <p className="mt-2 text-sm text-ink-600">{delivery.podNote}</p>}{delivery.hasProofPhoto && (url ? <img src={url} alt="Private delivery handover evidence" className="mt-3 max-h-96 w-full rounded-xl border border-ink-100 bg-white object-contain" /> : <Button className="mt-3" variant="outline" disabled={busy} onClick={() => void open()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} {busy ? "Opening securely…" : "Review proof photo"}</Button>)}{error && <p className="mt-2 text-xs text-red-700">{error}</p>}<p className="mt-2 text-xs text-ink-500">Opening this private evidence is recorded in the audit log.</p></div>;
}
