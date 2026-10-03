"use client";

import * as React from "react";
import { Flag, History, Save, Settings } from "lucide-react";
import { PermissionGate } from "@/components/PermissionGate";
import { useAuth } from "@/components/auth-provider";
import { useCan } from "@/components/providers";
import { Badge, Button, Card, PageHeader, SectionTitle } from "@/components/primitives";
import { adminApi, type ConfigEnvironment, type FeatureFlagVersion, type PlatformConfigVersion } from "@/lib/api/admin";

const input = "w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-crimson-400 focus:ring-2 focus:ring-crimson-100 disabled:bg-ink-50 disabled:text-ink-500";
const defaults = { commissionRateBps: 1000, baseDeliveryFee: 50, perKmDeliveryFee: 15, codLimit: 10_000, refundWindowHours: 72 };

export default function SettingsPage() {
  return <PermissionGate perm="settings.platform.view"><PlatformSettings /></PermissionGate>;
}

function PlatformSettings() {
  const can = useCan();
  const { superAdmin } = useAuth();
  const [environment, setEnvironment] = React.useState<ConfigEnvironment>("DEVELOPMENT");
  const [current, setCurrent] = React.useState<PlatformConfigVersion | null>(null);
  const [history, setHistory] = React.useState<PlatformConfigVersion[]>([]);
  const [flags, setFlags] = React.useState<FeatureFlagVersion[]>([]);
  const [flagHistory, setFlagHistory] = React.useState<FeatureFlagVersion[]>([]);
  const [shopId, setShopId] = React.useState("");
  const [activeTarget, setActiveTarget] = React.useState("");
  const [form, setForm] = React.useState({ ...defaults, changeNote: "" });
  const [flag, setFlag] = React.useState({ key: "", description: "", enabled: false, changeNote: "" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const mayWrite = can("settings.platform.manage") && (environment !== "PRODUCTION" || superAdmin);

  const load = React.useCallback(async (env: ConfigEnvironment, target = activeTarget) => {
    const [configResult, flagResult] = await Promise.all([adminApi.platformConfig(env), adminApi.featureFlags(env, target || undefined)]);
    setCurrent(configResult.current); setHistory(configResult.history); setFlags(flagResult.current); setFlagHistory(flagResult.history);
    const value = configResult.current ?? defaults;
    setForm({ commissionRateBps: value.commissionRateBps, baseDeliveryFee: value.baseDeliveryFee, perKmDeliveryFee: value.perKmDeliveryFee, codLimit: value.codLimit, refundWindowHours: value.refundWindowHours, changeNote: "" });
  }, [activeTarget]);

  React.useEffect(() => { void load(environment).catch((cause: unknown) => setError(readError(cause))); }, [environment, load]);

  const saveConfiguration = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null); setNotice(null);
    try { const saved = await adminApi.createPlatformConfig({ environment, ...form }); await load(environment); setNotice(`Configuration version ${saved.version} saved for ${environment.toLowerCase()}.`); }
    catch (cause) { setError(readError(cause)); } finally { setBusy(false); }
  };

  const switchTarget = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null);
    try { const target = shopId.trim(); setActiveTarget(target); const result = await adminApi.featureFlags(environment, target || undefined); setFlags(result.current); setFlagHistory(result.history); }
    catch (cause) { setError(readError(cause)); } finally { setBusy(false); }
  };

  const saveFlag = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null); setNotice(null);
    try {
      await adminApi.setFeatureFlag({ key: flag.key.trim(), environment, ...(activeTarget ? { shopId: activeTarget } : {}), enabled: flag.enabled, description: flag.description.trim() || undefined, changeNote: flag.changeNote.trim() });
      const result = await adminApi.featureFlags(environment, activeTarget || undefined);
      setFlags(result.current); setFlagHistory(result.history); setFlag({ key: "", description: "", enabled: false, changeNote: "" }); setNotice("Feature-flag version recorded.");
    } catch (cause) { setError(readError(cause)); } finally { setBusy(false); }
  };

  const editFlag = (row: FeatureFlagVersion) => setFlag({ key: row.key, description: row.description ?? "", enabled: row.enabled, changeNote: "" });

  return <>
    <PageHeader icon={<Settings className="h-5 w-5" />} title="Platform settings" subtitle="Versioned operational rules and controlled feature rollout" actions={<select aria-label="Configuration environment" className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-semibold" value={environment} onChange={(event) => { setEnvironment(event.target.value as ConfigEnvironment); setActiveTarget(""); setShopId(""); }}><option value="DEVELOPMENT">Development</option><option value="STAGING">Staging</option><option value="PRODUCTION">Production</option></select>} />
    {error && <p role="alert" className="mb-5 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {notice && <p className="mb-5 rounded-xl border border-green-100 bg-green-50 p-4 text-sm text-green-800">{notice}</p>}
    {environment === "PRODUCTION" && !superAdmin && <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Production is read-only for your role. The API permits production changes only from a privileged Super Admin.</p>}

    <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <Card className="p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-ink-900">Commerce rules</h2><p className="mt-1 text-sm text-ink-500">{current ? `Active version ${current.version}, saved ${formatDate(current.createdAt)}` : "No saved version. The form shows reviewable starting values."}</p></div>{current && <Badge tone="green">v{current.version}</Badge>}</div>
        <form onSubmit={saveConfiguration} className="mt-5 grid gap-4 sm:grid-cols-2">
          <NumberField label="Platform commission" hint={`${(form.commissionRateBps / 100).toFixed(2)}%`} value={form.commissionRateBps} max={10000} disabled={!mayWrite} onChange={(value) => setForm({ ...form, commissionRateBps: value })} />
          <NumberField label="Base delivery fee (NPR)" value={form.baseDeliveryFee} max={1_000_000} disabled={!mayWrite} onChange={(value) => setForm({ ...form, baseDeliveryFee: value })} />
          <NumberField label="Per-km fee (NPR)" value={form.perKmDeliveryFee} max={1_000_000} disabled={!mayWrite} onChange={(value) => setForm({ ...form, perKmDeliveryFee: value })} />
          <NumberField label="COD order limit (NPR)" value={form.codLimit} max={10_000_000} disabled={!mayWrite} onChange={(value) => setForm({ ...form, codLimit: value })} />
          <NumberField label="Refund window (hours)" value={form.refundWindowHours} min={1} max={2160} disabled={!mayWrite} onChange={(value) => setForm({ ...form, refundWindowHours: value })} />
          <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-semibold text-ink-700">Change reason</span><textarea required minLength={3} maxLength={300} rows={3} disabled={!mayWrite} className={input} value={form.changeNote} onChange={(event) => setForm({ ...form, changeNote: event.target.value })} placeholder="Why is this version needed?" /></label>
          {mayWrite && <div className="sm:col-span-2"><Button disabled={busy || form.changeNote.trim().length < 3}><Save className="h-4 w-4" /> Save new version</Button></div>}
        </form>
      </Card>
      <Card><SectionTitle title="Configuration history" hint="Newest first" /><div className="max-h-[34rem] divide-y divide-ink-100 overflow-y-auto">{history.length ? history.map((row) => <button key={row.id} className="block w-full p-4 text-left hover:bg-ink-50" onClick={() => setForm({ commissionRateBps: row.commissionRateBps, baseDeliveryFee: row.baseDeliveryFee, perKmDeliveryFee: row.perKmDeliveryFee, codLimit: row.codLimit, refundWindowHours: row.refundWindowHours, changeNote: "" })}><div className="flex justify-between"><strong className="text-sm text-ink-900">Version {row.version}</strong><span className="text-xs text-ink-400">{formatDate(row.createdAt)}</span></div><p className="mt-1 text-sm text-ink-600">{row.changeNote}</p><p className="mt-1 text-xs text-ink-400">{row.changedBy.name ?? row.changedBy.phone} · {(row.commissionRateBps / 100).toFixed(2)}% commission</p></button>) : <p className="p-6 text-sm text-ink-500">No saved versions for this environment.</p>}</div></Card>
    </div>

    <div className="mt-6 grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <Card className="p-5"><div className="flex items-center gap-2"><Flag className="h-5 w-5 text-crimson-600" /><h2 className="text-lg font-bold text-ink-900">Feature flag version</h2></div><p className="mt-1 text-sm text-ink-500">Target: {activeTarget ? `shop ${activeTarget}` : "all shops (global)"}</p>
        <form onSubmit={switchTarget} className="mt-4 flex gap-2"><input className={input} value={shopId} onChange={(event) => setShopId(event.target.value)} placeholder="Shop ID, or blank for global" /><Button type="submit" variant="outline" disabled={busy}>Load</Button></form>
        <form onSubmit={saveFlag} className="mt-5 space-y-4"><TextField label="Flag key" value={flag.key} disabled={!mayWrite} placeholder="checkout.new_flow" onChange={(value) => setFlag({ ...flag, key: value.toLowerCase().replace(/[^a-z0-9_.-]/g, "") })} /><TextField label="Description" value={flag.description} disabled={!mayWrite} onChange={(value) => setFlag({ ...flag, description: value })} /><label className="flex items-center gap-2 text-sm font-semibold text-ink-700"><input type="checkbox" checked={flag.enabled} disabled={!mayWrite} onChange={(event) => setFlag({ ...flag, enabled: event.target.checked })} /> Enabled for this target</label><label><span className="mb-1.5 block text-sm font-semibold text-ink-700">Change reason</span><textarea required minLength={3} maxLength={300} rows={3} disabled={!mayWrite} className={input} value={flag.changeNote} onChange={(event) => setFlag({ ...flag, changeNote: event.target.value })} /></label>{mayWrite && <Button disabled={busy || flag.key.length < 2 || flag.changeNote.trim().length < 3}><Save className="h-4 w-4" /> Record flag version</Button>}</form>
      </Card>
      <Card><SectionTitle title="Current flags" hint={`${flags.length} resolved for this exact target`} /><div className="divide-y divide-ink-100">{flags.length ? flags.map((row) => <button key={row.id} onClick={() => editFlag(row)} className="flex w-full items-start justify-between gap-4 p-4 text-left hover:bg-ink-50"><div><div className="flex items-center gap-2"><strong className="font-mono text-sm text-ink-900">{row.key}</strong><Badge tone={row.enabled ? "green" : "ink"}>{row.enabled ? "Enabled" : "Disabled"}</Badge></div><p className="mt-1 text-sm text-ink-500">{row.description || "No description"}</p><p className="mt-1 text-xs text-ink-400">v{row.version} · {row.changeNote} · {formatDate(row.createdAt)}</p></div><History className="h-4 w-4 shrink-0 text-ink-300" /></button>) : <p className="p-6 text-sm text-ink-500">No flags exist for this target. Flags default to disabled when unresolved.</p>}</div>{flagHistory.length > flags.length && <p className="border-t border-ink-100 p-4 text-xs text-ink-500">{flagHistory.length - flags.length} older immutable flag version(s) retained in the API history.</p>}</Card>
    </div>
  </>;
}

function NumberField({ label, hint, value, onChange, min = 0, max, disabled }: { label: string; hint?: string; value: number; onChange: (value: number) => void; min?: number; max: number; disabled: boolean }) {
  return <label><span className="mb-1.5 flex justify-between text-sm font-semibold text-ink-700"><span>{label}</span>{hint && <span className="font-normal text-ink-400">{hint}</span>}</span><input required type="number" step={1} min={min} max={max} disabled={disabled} className={input} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}
function TextField({ label, value, onChange, disabled, placeholder }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; placeholder?: string }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-semibold text-ink-700">{label}</span><input required={label === "Flag key"} maxLength={label === "Flag key" ? 80 : 300} disabled={disabled} className={input} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}
function formatDate(value: string) { return new Intl.DateTimeFormat("en-NP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function readError(cause: unknown) { return cause instanceof Error ? cause.message : "Could not load or save platform settings"; }
