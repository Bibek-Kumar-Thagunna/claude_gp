"use client";

import * as React from "react";
import { Copy, KeyRound, Loader2, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { ApiError } from "@gopasal/api-client";
import { PermissionGate } from "@/components/PermissionGate";
import { Badge, Button, Card, PageHeader } from "@/components/primitives";
import { ErrorPanel, InlineError, LoadingPanel } from "@/components/states";
import { adminApi, type PermissionGroup, type PlatformRole } from "@/lib/api/admin";

export default function PlatformRolesPage() {
  return <PermissionGate perm="rbac.platform.manage"><RolesWorkspace /></PermissionGate>;
}

function RolesWorkspace() {
  const [roles, setRoles] = React.useState<PlatformRole[]>([]);
  const [catalog, setCatalog] = React.useState<PermissionGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<PlatformRole | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [keys, setKeys] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [roleRows, groups] = await Promise.all([adminApi.platformRoles(), adminApi.platformPermissionCatalog()]);
      setRoles(roleRows); setCatalog(groups);
    } catch (err) { setError(err instanceof ApiError ? err.message : "Platform roles could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const reset = () => { setEditing(null); setName(""); setDescription(""); setKeys(new Set()); setError(null); };
  const edit = (role: PlatformRole) => {
    setEditing(role); setName(role.name); setDescription(role.description ?? "");
    setKeys(new Set(role.permissions.map((p) => p.permissionKey))); setError(null);
  };
  const save = async () => {
    if (name.trim().length < 2 || keys.size === 0) return;
    setSaving(true); setError(null);
    try {
      if (editing) await adminApi.updatePlatformRole(editing.id, { name: name.trim(), description: description.trim(), permissions: [...keys] });
      else await adminApi.createPlatformRole({ name: name.trim(), description: description.trim() || undefined, permissions: [...keys] });
      reset(); await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "The role could not be saved."); }
    finally { setSaving(false); }
  };
  const clone = async (role: PlatformRole) => {
    setSaving(true); setError(null);
    try { const created = await adminApi.clonePlatformRole(role.id, `${role.name} copy`); await load(); edit(created); }
    catch (err) { setError(err instanceof ApiError ? err.message : "The role could not be cloned."); }
    finally { setSaving(false); }
  };
  const remove = async (role: PlatformRole) => {
    if (!window.confirm(`Delete ${role.name}? This only works when no staff member uses it.`)) return;
    setSaving(true); setError(null);
    try { await adminApi.deletePlatformRole(role.id); if (editing?.id === role.id) reset(); await load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "The role could not be deleted."); }
    finally { setSaving(false); }
  };

  return <div>
    <PageHeader title="Platform roles" subtitle="Create least-privilege roles for GoPasal staff. Super Admin remains protected and cannot be delegated here." icon={<KeyRound className="h-5 w-5" />} actions={<Button onClick={reset}><Plus className="h-4 w-4" /> New role</Button>} />
    {error && <InlineError className="mb-5" message={error} />}
    {loading && roles.length === 0 ? <LoadingPanel label="Loading roles and permissions…" /> : catalog.length === 0 ? <ErrorPanel message="The platform permission catalogue is unavailable." onRetry={() => void load()} /> :
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
      <div className="space-y-3">
        {roles.map((role) => <Card key={role.id} className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-ink-900">{role.name}</h2>{role.isPrivileged ? <Badge tone="crimson">Privileged</Badge> : role.isSystem ? <Badge tone="blue">System template</Badge> : <Badge tone="green">Custom</Badge>}</div><p className="mt-1 text-sm text-ink-500">{role.description || "No description"}</p><p className="mt-3 text-xs text-ink-400">{role.isPrivileged ? "All platform permissions" : `${role.permissions.length} permissions`} · {role._count?.platformMemberships ?? 0} staff</p></div>
            <div className="flex gap-2">{!role.isPrivileged && <Button size="sm" variant="outline" onClick={() => void clone(role)} disabled={saving}><Copy className="h-4 w-4" /> Clone</Button>}{!role.isSystem && !role.isPrivileged && <><Button size="sm" variant="outline" onClick={() => edit(role)}>Edit</Button><Button size="sm" variant="danger" onClick={() => void remove(role)} disabled={saving}><Trash2 className="h-4 w-4" /></Button></>}</div>
          </div>
        </Card>)}
      </div>
      <Card className="h-fit p-5 xl:sticky xl:top-24">
        <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-crimson-600" /><h2 className="text-lg font-bold text-ink-900">{editing ? `Edit ${editing.name}` : "Create a role"}</h2></div>
        <label className="mt-5 block text-sm font-medium text-ink-700">Role name<input className="mt-1.5 h-11 w-full rounded-xl border border-ink-200 px-3 outline-none focus:border-crimson-400" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="mt-4 block text-sm font-medium text-ink-700">Description<textarea className="mt-1.5 min-h-20 w-full rounded-xl border border-ink-200 p-3 outline-none focus:border-crimson-400" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <div className="mt-5 space-y-5">{catalog.map((group) => <fieldset key={group.group}><legend className="mb-2 text-sm font-bold text-ink-900">{group.group}</legend><div className="space-y-2">{group.permissions.map((permission) => <label key={permission.key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink-100 p-3 hover:bg-ink-50"><input type="checkbox" className="mt-1 accent-crimson-600" checked={keys.has(permission.key)} onChange={(e) => setKeys((current) => { const next = new Set(current); if (e.target.checked) next.add(permission.key); else next.delete(permission.key); return next; })} /><span><span className="block text-sm font-medium text-ink-800">{permission.label}</span><span className="block text-xs text-ink-400">{permission.description ?? permission.key}</span></span></label>)}</div></fieldset>)}</div>
        <div className="mt-6 flex gap-2"><Button className="flex-1" disabled={saving || name.trim().length < 2 || keys.size === 0} onClick={() => void save()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {editing ? "Save changes" : "Create role"}</Button>{editing && <Button variant="outline" onClick={reset}>Cancel</Button>}</div>
      </Card>
    </div>}
  </div>;
}
