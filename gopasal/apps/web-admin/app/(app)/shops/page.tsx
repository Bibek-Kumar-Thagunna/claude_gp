"use client";

import * as React from "react";
import Link from "next/link";
import { Store, Search, MapPin, Star, ArrowRight, ShieldCheck } from "lucide-react";
import {
  PageHeader,
  TableWrap,
  Th,
  Td,
  FilterPills,
  SearchInput,
  Button,
  Avatar,
  EmptyState,
} from "@/components/primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { PermissionGate } from "@/components/PermissionGate";
import { Reveal } from "@/components/Reveal";
import { useAdmin, useLang } from "@/components/providers";
import { NOW, type ShopStatus } from "@/lib/data";
import { rsCompact, num, ago, phone as fmtPhone } from "@/lib/format";

type Filter = "ALL" | ShopStatus;
type Sort = "gmv" | "orders" | "newest" | "name";

export default function ShopsPage() {
  return (
    <PermissionGate perm="shops.view">
      <ShopsInner />
    </PermissionGate>
  );
}

function ShopsInner() {
  const { lang } = useLang();
  const { shops } = useAdmin();
  const [filter, setFilter] = React.useState<Filter>("ALL");
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState<Sort>("gmv");

  const counts = React.useMemo(() => {
    const c: Record<Filter, number> = {
      ALL: shops.length,
      PENDING: 0,
      ACTIVE: 0,
      SUSPENDED: 0,
      REJECTED: 0,
    };
    shops.forEach((s) => {
      c[s.status] += 1;
    });
    return c;
  }, [shops]);

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = shops.filter((s) => {
      if (filter !== "ALL" && s.status !== filter) return false;
      if (!needle) return true;
      return (
        s.name.toLowerCase().includes(needle) ||
        s.ownerName.toLowerCase().includes(needle) ||
        s.ownerPhone.includes(needle) ||
        s.area.toLowerCase().includes(needle) ||
        s.city.toLowerCase().includes(needle) ||
        s.category.toLowerCase().includes(needle)
      );
    });
    const sorted = [...list];
    if (sort === "gmv") sorted.sort((a, b) => b.gmv - a.gmv);
    if (sort === "orders") sorted.sort((a, b) => b.orders - a.orders);
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "newest")
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return sorted;
  }, [shops, filter, q, sort]);

  return (
    <>
      <PageHeader
        icon={<Store className="h-5 w-5" />}
        title={lang === "np" ? "पसलहरू" : "Shops"}
        subtitle={
          lang === "np"
            ? "हरेक पसल, तिनको डेलिभरी क्षेत्र र कारोबार"
            : "Every shop on the platform, its self-delivery coverage and its trade"
        }
        actions={
          counts.PENDING > 0 ? (
            <Button href="/approvals" variant="subtle" size="sm">
              {counts.PENDING} awaiting approval <ArrowRight className="h-4 w-4" />
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterPills<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "ALL", label: "All", count: counts.ALL },
            { value: "ACTIVE", label: "Active", count: counts.ACTIVE },
            { value: "PENDING", label: "Pending", count: counts.PENDING },
            { value: "SUSPENDED", label: "Suspended", count: counts.SUSPENDED },
            { value: "REJECTED", label: "Rejected", count: counts.REJECTED },
          ]}
        />
        <div className="flex items-center gap-2">
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Shop, owner, phone or area"
            icon={<Search className="h-4 w-4" />}
            className="w-full sm:w-72"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="Sort shops"
            className="shrink-0 rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm font-semibold text-ink-700 outline-none transition focus:border-crimson-400 focus:ring-2 focus:ring-crimson-100"
          >
            <option value="gmv">Top GMV</option>
            <option value="orders">Most orders</option>
            <option value="newest">Newest</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Store className="h-6 w-6" />}
          title="No shops match this view"
          description="Clear the search or pick another status filter."
        />
      ) : (
        <Reveal>
          <TableWrap>
            <thead>
              <tr>
                <Th>Shop</Th>
                <Th>Owner</Th>
                <Th>Coverage</Th>
                <Th className="text-right">Products</Th>
                <Th className="text-right">Orders</Th>
                <Th className="text-right">GMV</Th>
                <Th>Rating</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="transition hover:bg-ink-50">
                  <Td>
                    <Link href={`/shops/${s.id}`} className="flex items-center gap-3">
                      <Avatar
                        name={s.name}
                        tone={s.status === "ACTIVE" ? "crimson" : "ink"}
                        size={36}
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-semibold text-ink-900">{s.name}</span>
                          {s.verified && (
                            <ShieldCheck
                              className="h-3.5 w-3.5 shrink-0 text-[#0B7E58]"
                              aria-label="Verified"
                            />
                          )}
                        </span>
                        <span className="block truncate text-xs text-ink-500">
                          {s.category} · joined {ago(s.createdAt, NOW)}
                        </span>
                      </span>
                    </Link>
                  </Td>
                  <Td>
                    <span className="block text-sm text-ink-800">{s.ownerName}</span>
                    <span className="block text-xs text-ink-500">{fmtPhone(s.ownerPhone)}</span>
                  </Td>
                  <Td>
                    <span className="flex items-center gap-1.5 text-sm text-ink-700">
                      <MapPin className="h-3.5 w-3.5 text-ink-400" />
                      {s.area}, {s.city}
                    </span>
                    <span className="block text-xs text-ink-500">{s.radiusKm} km radius</span>
                  </Td>
                  <Td className="text-right">{num(s.products)}</Td>
                  <Td className="text-right">{num(s.orders)}</Td>
                  <Td className="text-right font-semibold text-ink-900">{rsCompact(s.gmv)}</Td>
                  <Td>
                    {s.ratingCount === 0 ? (
                      <span className="text-xs text-ink-400">No ratings</span>
                    ) : (
                      <span className="flex items-center gap-1 text-sm text-ink-800">
                        <Star className="h-3.5 w-3.5 fill-[#F6A609] text-[#F6A609]" />
                        {s.ratingAvg.toFixed(1)}
                        <span className="text-xs text-ink-400">({num(s.ratingCount)})</span>
                      </span>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge value={s.status} />
                  </Td>
                  <Td className="text-right">
                    <Link
                      href={`/shops/${s.id}`}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-crimson-700 hover:underline"
                    >
                      Open <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Reveal>
      )}

      <p className="mt-4 text-xs text-ink-400">
        Showing {num(rows.length)} of {num(shops.length)} shops. Coverage radius is set by each shop —
        GoPasal never promises a delivery time.
      </p>

    </>
  );

}

