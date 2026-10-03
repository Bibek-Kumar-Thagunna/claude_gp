"use client";

import * as React from "react";
import { Copy, Loader2, RefreshCw, Send, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { ApiError, isValidNepalMobile, normalisePhone } from "@gopasal/api-client";
import { PermissionGate } from "@/components/PermissionGate";
import { Badge, Button, Card, PageHeader } from "@/components/primitives";
import { InlineError, InlineNotice, LoadingPanel } from "@/components/states";
import { adminApi, type PlatformInvite, type PlatformInviteIssued, type PlatformRole, type PlatformStaff } from "@/lib/api/admin";

export default function PlatformStaffPage() {
  return <PermissionGate perm="rbac.platform.manage"><StaffWorkspace /></PermissionGate>;
}

function StaffWorkspace() {
  const [staff, setStaff] = React.useState<PlatformStaff[]>([]);
  const [invites, setInvites] = React.useState<PlatformInvite[]>([]);
  const [roles, setRoles] = React.useState<PlatformRole[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [issued, setIssued] = React.useState<PlatformInviteIssued | null>(null);
  const [phone, setPhone] = React.useState("");
  const [name, setName] = React.useState("");
  const [note, setNote] = React.useState("");
  const [roleId, setRoleId] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [people, pending, roleRows] = await Promise.all([adminApi.platformStaff(), adminApi.platformInvites(), adminApi.platformRoles()]);
      setStaff(people); setInvites(pending); setRoles(roleRows);
      const assignable = roleRows.find((role) => !role.isPrivileged);
      setRoleId((current) => current || assignable?.id || "");
    } catch (err) { setError(err instanceof ApiError ? err.message : "Platform team data could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key); setError(null);
    try { await action(); await load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "The staff change could not be completed."); }
    finally { setBusy(null); }
  };
  const invite = async () => {
    if (!isValidNepalMobile(phone) || !roleId) return;
    setBusy("invite"); setError(null); setIssued(null);
    try {
      const result = await adminApi.createPlatformInvite({ phone: normalisePhone(phone), roleId, name: name.trim() || undefined, note: note.trim() || undefined });
      setIssued(result); setPhone(""); setName(""); setNote(""); await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "The invitation could not be created."); }
    finally { setBusy(null); }
  };
  const resend = async (inviteRow: PlatformInvite) => {
    setBusy(inviteRow.id); setError(null);
    try { setIssued(await adminApi.resendPlatformInvite(inviteRow.id)); await load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "The invitation could not be resent."); }
    finally { setBusy(null); }
  };
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); } catch { setError("Copy was blocked by the browser. Select the text manually."); } };
  const assignable = roles.filter((role) => !role.isPrivileged);

  return <div>
    <PageHeader title="Platform staff" subtitle="Invite colleagues to their own phone-verified account, then manage their least-privilege role. Every mutation is audited." icon={<Users className="h-5 w-5" />} />
    {error && <InlineError className="mb-5" message={error} />}
    {issued && <Card className="mb-6 border border-[#B9E3CC] bg-[#F3FBF6] p-5">
      <div className="flex items-start justify-between gap-4"><div><h2 className="font-bold text-ink-900">Invitation ready for {issued.invite.name ?? issued.invite.phone}</h2><p className="mt-1 text-sm text-ink-500">Share these once. The recipient still must sign in with the invited phone number.</p></div><button aria-label="Close invitation details" className="text-ink-400" onClick={() => setIssued(null)}>×</button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[140px_1fr]"><div className="rounded-xl bg-white p-3"><p className="text-xs text-ink-400">Invitation code</p><p className="mt-1 font-mono text-xl font-bold tracking-[0.2em] text-ink-900">{issued.shareOnce.code}</p></div><div className="min-w-0 rounded-xl bg-white p-3"><p className="text-xs text-ink-400">Secure join link</p><p className="mt-1 truncate text-sm text-ink-700">{issued.shareOnce.link}</p></div></div>
      <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void copy(issued.shareOnce.code)}><Copy className="h-4 w-4" /> Copy code</Button><Button size="sm" variant="outline" onClick={() => void copy(issued.shareOnce.link)}><Copy className="h-4 w-4" /> Copy link</Button></div>
    </Card>}
    {loading && staff.length === 0 ? <LoadingPanel label="Loading platform staff…" /> : <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)]">
      <div className="space-y-6">
        <Card className="overflow-hidden"><div className="border-b border-ink-100 px-5 py-4"><h2 className="font-bold text-ink-900">Active staff</h2><p className="mt-1 text-xs text-ink-500">Super Admin accounts are visible but protected from browser-side role changes and removal.</p></div><div className="divide-y divide-ink-100">{staff.map((member) => <div key={member.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><p className="font-semibold text-ink-900">{member.user.name || `+977 ${member.user.phone}`}</p>{member.role.isPrivileged && <Badge tone="crimson">Protected</Badge>}</div><p className="mt-1 text-xs text-ink-500">+977 {member.user.phone} · {member.user.status}</p></div><div className="flex items-center gap-2"><select aria-label={`Role for ${member.user.name ?? member.user.phone}`} className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm" value={member.roleId} disabled={member.role.isPrivileged || busy === member.id} onChange={(e) => void run(member.id, () => adminApi.changePlatformStaffRole(member.user.phone, e.target.value))}>{member.role.isPrivileged && <option value={member.roleId}>{member.role.name}</option>}{assignable.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select>{!member.role.isPrivileged && <Button size="sm" variant="danger" disabled={busy === member.id} onClick={() => { if (window.confirm(`Remove ${member.user.name ?? member.user.phone} from platform staff?`)) void run(member.id, () => adminApi.removePlatformStaff(member.userId)); }}><Trash2 className="h-4 w-4" /></Button>}</div></div>)}{staff.length === 0 && <p className="p-8 text-center text-sm text-ink-500">No platform staff memberships exist.</p>}</div></Card>
        <Card className="overflow-hidden"><div className="border-b border-ink-100 px-5 py-4"><h2 className="font-bold text-ink-900">Pending invitations</h2></div><div className="divide-y divide-ink-100">{invites.map((inviteRow) => <div key={inviteRow.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><p className="font-semibold text-ink-900">{inviteRow.name || `+977 ${inviteRow.phone}`}</p><Badge tone={inviteRow.delivery === "sent" ? "green" : "marigold"}>{inviteRow.delivery === "sent" ? "Delivered" : "Local / manual share"}</Badge></div><p className="mt-1 text-xs text-ink-500">{inviteRow.role.name} · expires {new Date(inviteRow.expiresAt).toLocaleString()}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy === inviteRow.id} onClick={() => void resend(inviteRow)}><RefreshCw className="h-4 w-4" /> Resend</Button><Button size="sm" variant="danger" disabled={busy === inviteRow.id} onClick={() => { if (window.confirm("Revoke this invitation?")) void run(inviteRow.id, () => adminApi.revokePlatformInvite(inviteRow.id)); }}><Trash2 className="h-4 w-4" /></Button></div></div>)}{invites.length === 0 && <p className="p-8 text-center text-sm text-ink-500">No invitation is waiting for acceptance.</p>}</div></Card>
      </div>
      <Card className="h-fit p-5 xl:sticky xl:top-24"><div className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-crimson-600" /><h2 className="text-lg font-bold text-ink-900">Invite a colleague</h2></div><InlineNotice className="mt-4" message="Access is not created immediately. The colleague must control the invited phone, sign in with OTP, and accept the link." />
        <label className="mt-5 block text-sm font-medium text-ink-700">Mobile number<input className="mt-1.5 h-11 w-full rounded-xl border border-ink-200 px-3 outline-none focus:border-crimson-400" inputMode="numeric" placeholder="98XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <label className="mt-4 block text-sm font-medium text-ink-700">Name <span className="font-normal text-ink-400">(optional)</span><input className="mt-1.5 h-11 w-full rounded-xl border border-ink-200 px-3 outline-none focus:border-crimson-400" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="mt-4 block text-sm font-medium text-ink-700">Platform role<select className="mt-1.5 h-11 w-full rounded-xl border border-ink-200 bg-white px-3" value={roleId} onChange={(e) => setRoleId(e.target.value)}>{assignable.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
        <label className="mt-4 block text-sm font-medium text-ink-700">Message <span className="font-normal text-ink-400">(optional)</span><textarea className="mt-1.5 min-h-20 w-full rounded-xl border border-ink-200 p-3 outline-none focus:border-crimson-400" maxLength={200} placeholder="What they will be responsible for" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <Button className="mt-5 w-full" size="lg" disabled={!isValidNepalMobile(phone) || !roleId || busy === "invite"} onClick={() => void invite()}>{busy === "invite" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send invitation</Button>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-400"><ShieldCheck className="h-3.5 w-3.5" /> Super Admin cannot be invited or granted here.</p>
      </Card>
    </div>}
  </div>;
}
