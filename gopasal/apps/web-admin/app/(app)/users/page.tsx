"use client";

import * as React from "react";
import { Search, Users as UsersIcon } from "lucide-react";
import { PermissionGate, Can } from "@/components/PermissionGate";
import { PageHeader, TableWrap, Th, Td, SearchInput, Button, Badge } from "@/components/primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { adminApi, type AdminUser } from "@/lib/api/admin";

export default function UsersPage() { return <PermissionGate perm="users.view"><Users /></PermissionGate>; }

function Users() {
  const [rows, setRows] = React.useState<AdminUser[]>([]);
  const [q, setQ] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const load = React.useCallback(() => adminApi.users().then(setRows).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load users")), []);
  React.useEffect(() => { void load(); }, [load]);
  async function act(user: AdminUser, action: "suspend" | "reactivate") {
    if (!window.confirm(`${action === "suspend" ? "Suspend" : "Reactivate"} ${user.name ?? user.phone}? This action is audited.`)) return;
    setBusy(user.id); setError(null);
    try { await adminApi.userAction(user.id, action); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Action failed"); } finally { setBusy(null); }
  }
  const visible = rows.filter((row) => `${row.name ?? ""} ${row.phone}`.toLowerCase().includes(q.toLowerCase()));
  return <><PageHeader icon={<UsersIcon className="h-5 w-5" />} title="Users" subtitle="Persisted customer, seller, rider, and platform accounts" />
    <SearchInput value={q} onChange={setQ} placeholder="Name or phone" icon={<Search className="h-4 w-4" />} className="mb-4 w-full sm:w-80" />
    {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <TableWrap><thead><tr><Th>Account</Th><Th>Type</Th><Th>Orders</Th><Th>Owned shops</Th><Th>Joined</Th><Th>Status</Th><Th>Action</Th></tr></thead><tbody>{visible.map((user) => <tr key={user.id}><Td><strong>{user.name ?? "Unnamed account"}</strong><span className="block text-xs text-ink-500">{user.phone}</span></Td><Td><Badge tone={user.isPlatformStaff ? "blue" : "ink"}>{user.isPlatformStaff ? "Platform staff" : "Marketplace user"}</Badge></Td><Td>{user._count.orders}</Td><Td>{user._count.ownedShops}</Td><Td>{new Date(user.createdAt).toLocaleDateString("en-NP")}</Td><Td><StatusBadge value={user.status} /></Td><Td>{user.isPlatformStaff ? <span className="text-xs text-ink-400">Protected staff account</span> : <Can perm="users.suspend">{user.status === "SUSPENDED" ? <Button disabled={busy === user.id} size="sm" onClick={() => void act(user, "reactivate")}>Reactivate</Button> : <Button disabled={busy === user.id} variant="danger" size="sm" onClick={() => void act(user, "suspend")}>Suspend</Button>}</Can>}</Td></tr>)}</tbody></TableWrap>
    <p className="mt-4 text-xs text-ink-400">{visible.length} of {rows.length} persisted accounts</p></>;
}
