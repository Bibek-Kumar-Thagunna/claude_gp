"use client";

import * as React from "react";
import Link from "next/link";
import { PackageSearch, Search } from "lucide-react";
import { PermissionGate } from "@/components/PermissionGate";
import { PageHeader, EmptyState, Button, FilterPills, SearchInput, TableWrap, Th, Td } from "@/components/primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { adminApi, type AdminProduct } from "@/lib/api/admin";
import { rs } from "@/lib/format";

type Filter = "ALL" | "ACTIVE" | "HIDDEN";
export default function CatalogPage() { return <PermissionGate perm="catalog.moderate"><Catalog /></PermissionGate>; }
function Catalog() {
  const [rows, setRows] = React.useState<AdminProduct[]>([]);
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("ALL");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(() => adminApi.products(undefined, filter === "ALL" ? undefined : filter === "ACTIVE").then(setRows), [filter]);
  React.useEffect(() => { void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load catalog")); }, [load]);
  const moderate = async (product: AdminProduct) => {
    const next = !product.isActive;
    if (!window.confirm(`${next ? "Restore" : "Hide"} ${product.name}? This platform moderation action is audit logged.`)) return;
    setBusy(product.id); setError(null);
    try { await adminApi.moderateProduct(product.id, next); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not moderate product"); }
    finally { setBusy(null); }
  };
  const visible = rows.filter((row) => `${row.name} ${row.nameNp ?? ""} ${row.shop.name} ${row.category?.en ?? ""} ${row.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  return <>
    <PageHeader icon={<PackageSearch className="h-5 w-5" />} title="Catalog moderation" subtitle="Platform-wide persisted product queue with audited hide and restore actions" />
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><FilterPills value={filter} onChange={setFilter} options={[{ value: "ALL", label: "All" }, { value: "ACTIVE", label: "Visible" }, { value: "HIDDEN", label: "Hidden" }]} /><SearchInput value={q} onChange={setQ} placeholder="Product, shop, category or tag" icon={<Search className="h-4 w-4" />} className="w-full sm:w-80" /></div>
    {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {visible.length === 0 ? <EmptyState icon={<PackageSearch />} title="No matching products" description="The moderation queue reads directly from seller catalog records." /> : <TableWrap><thead><tr><Th>Product</Th><Th>Shop</Th><Th>Category</Th><Th>Price / stock</Th><Th>Usage</Th><Th>Status</Th><Th>Moderation</Th></tr></thead><tbody>{visible.map((product) => <tr key={product.id}><Td><strong>{product.name}</strong>{product.nameNp && <span className="block text-xs text-ink-500">{product.nameNp}</span>}<span className="block text-xs text-ink-400">{product.unit} · {product._count.variants} variants</span></Td><Td><Link className="font-semibold text-crimson-700" href={`/shops/${product.shop.id}`}>{product.shop.name}</Link><span className="block"><StatusBadge value={product.shop.status} /></span></Td><Td>{product.category?.en ?? "Uncategorized"}</Td><Td>{rs(product.price)}<span className="block text-xs text-ink-500">{product.trackStock ? `${product.stock} in stock` : "Unlimited"}</span></Td><Td><span className="text-xs text-ink-600">{product._count.orderItems} orders<br />{product._count.reviews} reviews</span></Td><Td><span className={`text-sm font-bold ${product.isActive ? "text-green-700" : "text-red-700"}`}>{product.isActive ? "Visible" : "Hidden"}</span></Td><Td><Button size="sm" variant={product.isActive ? "danger" : "outline"} disabled={busy === product.id} onClick={() => void moderate(product)}>{product.isActive ? "Hide" : "Restore"}</Button></Td></tr>)}</tbody></TableWrap>}
  </>;
}
