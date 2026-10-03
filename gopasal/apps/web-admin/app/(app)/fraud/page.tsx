"use client";

import * as React from "react";
import { ShieldAlert } from "lucide-react";
import { PermissionGate, Can } from "@/components/PermissionGate";
import { PageHeader, EmptyState, Button, Card, Field, inputCls, FilterPills } from "@/components/primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { adminApi, type FraudFlag } from "@/lib/api/admin";
import { fullDate } from "@/lib/format";

type Filter = "ALL" | FraudFlag["status"];

export default function FraudPage() {
  return <PermissionGate perm="fraud.view"><Fraud /></PermissionGate>;
}

function Fraud() {
  const [rows, setRows] = React.useState<FraudFlag[]>([]);
  const [filter, setFilter] = React.useState<Filter>("ALL");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ subjectType: "order" as FraudFlag["subjectType"], subjectId: "", reason: "", severity: "medium" as FraudFlag["severity"] });
  const load = React.useCallback(() => adminApi.fraudFlags(filter === "ALL" ? undefined : filter).then(setRows), [filter]);
  React.useEffect(() => { void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load fraud flags")); }, [load]);
  const create = async (event: React.FormEvent) => { event.preventDefault(); setBusy("new"); setError(null); try { await adminApi.raiseFraudFlag({ ...form, reason: form.reason.trim(), subjectId: form.subjectId.trim() }); setForm({ ...form, subjectId: "", reason: "" }); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create fraud flag"); } finally { setBusy(null); } };
  const setStatus = async (row: FraudFlag, status: FraudFlag["status"]) => { if (!window.confirm(`Move this flag to ${status.toLowerCase()}? This is audit logged.`)) return; setBusy(row.id); try { await adminApi.setFraudStatus(row.id, status); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update flag"); } finally { setBusy(null); } };

  return <>
    <PageHeader icon={<ShieldAlert className="h-5 w-5" />} title="Fraud operations" subtitle="Manual risk flags with persisted status and audit history" />
    {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <Can perm="fraud.manage"><Card className="mb-5 p-5"><h2 className="font-bold text-ink-900">Raise a flag</h2><form onSubmit={create} className="mt-4 grid gap-3 md:grid-cols-[150px_1fr_150px_auto]"><Field label="Entity"><select className={inputCls} value={form.subjectType} onChange={(event) => setForm({ ...form, subjectType: event.target.value as FraudFlag["subjectType"] })}><option value="order">Order</option><option value="shop">Shop</option><option value="user">User</option></select></Field><Field label="Persisted entity ID"><input required className={inputCls} value={form.subjectId} onChange={(event) => setForm({ ...form, subjectId: event.target.value })} /></Field><Field label="Severity"><select className={inputCls} value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value as FraudFlag["severity"] })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field><Button className="self-end" disabled={busy === "new" || form.reason.trim().length < 3}>Create flag</Button><Field label="Reason" className="md:col-span-4"><textarea required minLength={3} maxLength={300} rows={2} className={inputCls} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></Field></form></Card></Can>
    <FilterPills value={filter} onChange={setFilter} className="mb-4" options={[{ value: "ALL", label: "All" }, { value: "OPEN", label: "Open" }, { value: "REVIEWING", label: "Reviewing" }, { value: "CONFIRMED", label: "Confirmed" }, { value: "DISMISSED", label: "Dismissed" }]} />
    {rows.length === 0 ? <EmptyState icon={<ShieldAlert />} title="No fraud flags" description="Risk indicators raised by staff or future automated rules appear here." /> : <div className="grid gap-3">{rows.map((row) => <Card key={row.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><StatusBadge value={row.severity} /><StatusBadge value={row.status} /><span className="text-xs font-bold uppercase text-ink-400">{row.subjectType}</span></div><p className="mt-3 font-semibold text-ink-900">{row.reason}</p><p className="mt-1 break-all text-xs text-ink-500">{row.subjectId} · {fullDate(row.createdAt)} · {row.reporter?.name ?? "System"}</p></div><Can perm="fraud.manage"><select aria-label={`Status for ${row.id}`} disabled={busy === row.id} value={row.status} onChange={(event) => void setStatus(row, event.target.value as FraudFlag["status"])} className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm"><option value="OPEN">Open</option><option value="REVIEWING">Reviewing</option><option value="CONFIRMED">Confirmed</option><option value="DISMISSED">Dismissed</option></select></Can></div></Card>)}</div>}
  </>;
}
