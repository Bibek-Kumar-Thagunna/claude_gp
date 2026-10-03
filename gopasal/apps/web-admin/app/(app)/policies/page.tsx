"use client";

import * as React from "react";
import { FileText, Plus, Send } from "lucide-react";
import { PermissionGate, Can } from "@/components/PermissionGate";
import { PageHeader, EmptyState, Button, Card, Field, inputCls, Badge } from "@/components/primitives";
import { adminApi, type PolicyDocument } from "@/lib/api/admin";
import { fullDate } from "@/lib/format";

const KEYS: PolicyDocument["key"][] = ["terms", "privacy", "refund", "delivery", "cookies"];
const EMPTY = { key: "terms" as PolicyDocument["key"], version: "", title: "", content: "" };

export default function PoliciesPage() {
  return <PermissionGate perm="policy.view"><Policies /></PermissionGate>;
}

function Policies() {
  const [rows, setRows] = React.useState<PolicyDocument[]>([]);
  const [selected, setSelected] = React.useState<PolicyDocument | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async () => { const result = await adminApi.policies(); setRows(result); return result; }, []);
  React.useEffect(() => { void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load policies")); }, [load]);
  const edit = (row: PolicyDocument) => { setSelected(row); setCreating(false); setForm({ key: row.key, version: row.version, title: row.title, content: row.content }); setError(null); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null);
    try { const saved = creating ? await adminApi.createPolicy(form) : await adminApi.updatePolicy(selected!.id, { version: form.version, title: form.title, content: form.content }); setSelected(saved); setCreating(false); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save policy"); }
    finally { setBusy(false); }
  };
  const publish = async () => {
    if (!selected || !window.confirm(`Publish ${selected.title} v${selected.version}? Published versions are immutable.`)) return;
    setBusy(true);
    try { const saved = await adminApi.publishPolicy(selected.id); setSelected(saved); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not publish policy"); }
    finally { setBusy(false); }
  };

  return <>
    <PageHeader icon={<FileText className="h-5 w-5" />} title="Policy publishing" subtitle="Versioned drafts, immutable published documents, and effective dates" actions={<Can perm="policy.publish"><Button size="sm" onClick={() => { setCreating(true); setSelected(null); setForm(EMPTY); }}><Plus className="h-4 w-4" /> New version</Button></Can>} />
    {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="grid gap-5 lg:grid-cols-[.78fr_1.22fr]"><div className="space-y-2">{rows.length === 0 ? <EmptyState icon={<FileText />} title="No policy versions" /> : rows.map((row) => <button key={row.id} onClick={() => edit(row)} className={`w-full rounded-xl border bg-white p-4 text-left ${selected?.id === row.id ? "border-crimson-400" : "border-ink-200"}`}><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-ink-900">{row.title}</strong><p className="mt-1 text-xs uppercase text-ink-500">{row.key} · v{row.version}</p></div><Badge tone={row.isPublished ? "green" : "marigold"}>{row.isPublished ? "Published" : "Draft"}</Badge></div><p className="mt-2 text-xs text-ink-500">{row.effectiveAt ? `Effective ${fullDate(row.effectiveAt)}` : `Created ${fullDate(row.createdAt)}`}</p></button>)}</div>
      <Card className="p-5">{creating || selected ? <form onSubmit={save}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold text-ink-900">{creating ? "Create policy version" : selected?.title}</h2>{selected?.isPublished && <Badge tone="green">Immutable published version</Badge>}</div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Category" required><select disabled={!creating || selected?.isPublished} className={inputCls} value={form.key} onChange={(event) => setForm({ ...form, key: event.target.value as PolicyDocument["key"] })}>{KEYS.map((key) => <option key={key} value={key}>{key}</option>)}</select></Field><Field label="Version" required><input disabled={selected?.isPublished} maxLength={20} className={inputCls} value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} placeholder="2.0" /></Field><Field label="Title" required className="sm:col-span-2"><input disabled={selected?.isPublished} maxLength={200} className={inputCls} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field><Field label="Policy content" required className="sm:col-span-2"><textarea disabled={selected?.isPublished} rows={16} className={`${inputCls} font-mono leading-6`} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} /></Field></div>{!selected?.isPublished && <Can perm="policy.publish"><div className="mt-4 flex flex-wrap gap-2"><Button disabled={busy || !form.version.trim() || !form.title.trim() || !form.content.trim()}>{busy ? "Saving…" : "Save draft"}</Button>{selected && <Button type="button" variant="outline" disabled={busy} onClick={() => void publish()}><Send className="h-4 w-4" /> Publish now</Button>}</div></Can>}</form> : <p className="py-16 text-center text-sm text-ink-500">Select a version to inspect it, or create a new draft.</p>}</Card>
    </div>
  </>;
}
