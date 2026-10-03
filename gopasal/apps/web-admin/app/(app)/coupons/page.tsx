"use client";

import * as React from "react";
import { Plus, Ticket, ToggleLeft, ToggleRight } from "lucide-react";
import { PermissionGate } from "@/components/PermissionGate";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/primitives";
import { adminApi, type PlatformCoupon } from "@/lib/api/admin";
import { fullDate, rs } from "@/lib/format";

export default function CouponsPage() { return <PermissionGate perm="coupons.manage"><Coupons /></PermissionGate>; }

function Coupons() {
  const [rows, setRows] = React.useState<PlatformCoupon[]>([]);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState({ code: "", type: "FLAT" as "FLAT" | "PERCENT", value: "100", minOrder: "500", maxDiscount: "", usageLimit: "", perUserLimit: "1", validTo: "" });
  const load = React.useCallback(async () => setRows(await adminApi.platformCoupons()), []);
  React.useEffect(() => { void load().catch((cause: unknown) => setError(readError(cause))); }, [load]);
  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null);
    try { await adminApi.createPlatformCoupon({ code: draft.code.trim().toUpperCase(), type: draft.type, value: Number(draft.value), minOrder: Number(draft.minOrder || 0), maxDiscount: draft.maxDiscount ? Number(draft.maxDiscount) : undefined, usageLimit: draft.usageLimit ? Number(draft.usageLimit) : undefined, perUserLimit: Number(draft.perUserLimit || 1), validTo: draft.validTo ? new Date(draft.validTo).toISOString() : undefined }); setOpen(false); setDraft({ ...draft, code: "" }); await load(); }
    catch (cause) { setError(readError(cause)); }
    finally { setBusy(false); }
  };
  const toggle = async (row: PlatformCoupon) => { setBusy(true); setError(null); try { await adminApi.updatePlatformCoupon(row.id, { isActive: !row.isActive }); await load(); } catch (cause) { setError(readError(cause)); } finally { setBusy(false); } };
  return <>
    <PageHeader icon={<Ticket className="h-5 w-5" />} title="Platform coupons" subtitle="Platform-funded offers shown beside eligible shop offers at checkout" actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New coupon</Button>} />
    {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {open && <Card className="mb-6 p-5"><form onSubmit={create}><div className="grid gap-4 md:grid-cols-4"><Field label="Code"><input required pattern="[A-Za-z0-9_-]+" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} className={input} /></Field><Field label="Discount type"><select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as "FLAT" | "PERCENT" })} className={input}><option value="FLAT">Fixed amount</option><option value="PERCENT">Percentage</option></select></Field><Field label={draft.type === "FLAT" ? "Amount (Rs.)" : "Percentage"}><input required min="1" type="number" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} className={input} /></Field><Field label="Minimum order"><input min="0" type="number" value={draft.minOrder} onChange={(e) => setDraft({ ...draft, minOrder: e.target.value })} className={input} /></Field><Field label="Maximum discount"><input min="1" type="number" value={draft.maxDiscount} onChange={(e) => setDraft({ ...draft, maxDiscount: e.target.value })} disabled={draft.type === "FLAT"} className={input} /></Field><Field label="Total uses"><input min="1" type="number" value={draft.usageLimit} onChange={(e) => setDraft({ ...draft, usageLimit: e.target.value })} className={input} /></Field><Field label="Uses per customer"><input required min="1" type="number" value={draft.perUserLimit} onChange={(e) => setDraft({ ...draft, perUserLimit: e.target.value })} className={input} /></Field><Field label="Valid until"><input type="datetime-local" value={draft.validTo} onChange={(e) => setDraft({ ...draft, validTo: e.target.value })} className={input} /></Field></div><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={busy || !draft.code.trim()}>Create offer</Button></div></form></Card>}
    {rows.length === 0 ? <EmptyState icon={<Ticket />} title="No platform coupons" description="Create a limited, auditable offer customers can discover at checkout." /> : <div className="grid gap-4 lg:grid-cols-2">{rows.map((row) => <Card key={row.id} className="p-5"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><strong className="font-mono text-lg text-ink-900">{row.code}</strong><Badge tone={row.isActive ? "green" : "ink"}>{row.isActive ? "Active" : "Paused"}</Badge></div><p className="mt-2 text-sm font-semibold text-crimson-700">{row.type === "FLAT" ? `${rs(row.value)} off` : `${row.value}% off${row.maxDiscount ? ` up to ${rs(row.maxDiscount)}` : ""}`}</p><p className="mt-1 text-xs text-ink-500">Minimum {rs(row.minOrder)} · {row.usedCount}/{row.usageLimit ?? "∞"} used · {row.perUserLimit} per customer</p><p className="mt-1 text-xs text-ink-400">From {fullDate(row.validFrom)}{row.validTo ? ` to ${fullDate(row.validTo)}` : " · no end date"}</p></div><button disabled={busy} onClick={() => void toggle(row)} aria-label={row.isActive ? `Pause ${row.code}` : `Activate ${row.code}`} className="rounded-xl p-2 text-crimson-600 hover:bg-crimson-50">{row.isActive ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}</button></div></Card>)}</div>}
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="text-sm font-semibold text-ink-700">{label}{children}</label>; }
const input = "mt-1 h-11 w-full rounded-xl border border-ink-200 bg-white px-3 font-normal outline-none focus:border-crimson-400 disabled:bg-ink-50";
const readError = (cause: unknown) => cause instanceof Error ? cause.message : "Could not complete the coupon action.";
