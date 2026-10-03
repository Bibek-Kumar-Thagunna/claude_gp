"use client";

import * as React from "react";
import Link from "next/link";
import { Search, Store } from "lucide-react";
import { PermissionGate, Can } from "@/components/PermissionGate";
import { PageHeader, TableWrap, Th, Td, SearchInput, Button } from "@/components/primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { adminApi, type AdminShop } from "@/lib/api/admin";

export default function ShopsPage() { return <PermissionGate perm="shops.view"><Shops /></PermissionGate>; }

function Shops() {
  const [rows, setRows] = React.useState<AdminShop[]>([]);
  const [q, setQ] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const load = React.useCallback(() => adminApi.shops().then(setRows).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load shops")), []);
  React.useEffect(() => { void load(); }, [load]);
  async function act(shop: AdminShop, action: "approve" | "reject" | "suspend" | "reactivate") {
    const reason = action === "reject" || action === "suspend"
      ? window.prompt(`Why should ${shop.name} be ${action === "reject" ? "rejected" : "suspended"}? This reason will be visible to the seller.`)?.trim()
      : undefined;
    if ((action === "reject" || action === "suspend") && (!reason || reason.length < 3)) return;
    if ((action === "approve" || action === "reactivate") && !window.confirm(`${action[0]!.toUpperCase()}${action.slice(1)} ${shop.name}? This writes an audit entry.`)) return;
    setBusy(shop.id); setError(null);
    try { await adminApi.shopAction(shop.id, action, reason); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Action failed"); } finally { setBusy(null); }
  }
  const visible = rows.filter((row) => `${row.name} ${row.owner.name ?? ""} ${row.owner.phone} ${row.area ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return <><PageHeader icon={<Store className="h-5 w-5" />} title="Shops" subtitle="Real shop records with audited lifecycle controls" />
    <SearchInput value={q} onChange={setQ} placeholder="Shop, owner, phone or area" icon={<Search className="h-4 w-4" />} className="mb-4 w-full sm:w-80" />
    {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <TableWrap><thead><tr><Th>Shop</Th><Th>Owner</Th><Th>Area</Th><Th>Products</Th><Th>Orders</Th><Th>Status</Th><Th>Action</Th></tr></thead><tbody>{visible.map((shop) => <tr key={shop.id}><Td><Link href={`/shops/${shop.id}`} className="font-bold text-ink-900 hover:text-crimson-700">{shop.name}</Link><span className="block text-xs text-ink-500">{shop.slug}</span></Td><Td>{shop.owner.name ?? "Unnamed"}<span className="block text-xs text-ink-500">{shop.owner.phone}</span></Td><Td>{shop.area ?? "—"}<span className="block text-xs text-ink-500">{shop.deliveryRadiusKm} km radius</span></Td><Td>{shop._count.products}</Td><Td>{shop._count.orders}</Td><Td><StatusBadge value={shop.status} /></Td><Td><Can perm={shop.status === "PENDING" ? "shops.approve" : "shops.suspend"}>{shop.status === "PENDING" ? <div className="flex gap-2"><Button disabled={busy === shop.id} size="sm" onClick={() => void act(shop, "approve")}>Approve</Button><Button disabled={busy === shop.id} variant="danger" size="sm" onClick={() => void act(shop, "reject")}>Reject</Button></div> : shop.status === "SUSPENDED" ? <Button disabled={busy === shop.id} size="sm" onClick={() => void act(shop, "reactivate")}>Reactivate</Button> : shop.status === "ACTIVE" ? <Button disabled={busy === shop.id} variant="danger" size="sm" onClick={() => void act(shop, "suspend")}>Suspend</Button> : <span className="text-xs text-ink-400">No action</span>}</Can></Td></tr>)}</tbody></TableWrap>
    <p className="mt-4 text-xs text-ink-400">{visible.length} of {rows.length} persisted shops</p></>;
}
