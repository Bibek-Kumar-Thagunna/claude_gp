"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  Users as UsersIcon,
  Search,
  Ban,
  RotateCcw,
  Crown,
  ShoppingBag,
  Wallet,
  Store,
  ShieldAlert,
} from "lucide-react";
import {
  PageHeader,
  TableWrap,
  Th,
  Td,
  FilterPills,
  SearchInput,
  Badge,
  Button,
  Avatar,
  EmptyState,
  KeyValue,
} from "@/components/primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { PermissionGate, Can } from "@/components/PermissionGate";
import { Drawer, ConfirmDialog } from "@/components/Drawer";
import { Reveal } from "@/components/Reveal";
import { useAdmin, useLang } from "@/components/providers";
import { NOW, type UserKind } from "@/lib/data";
import { rs, num, ago, fullDate, phone as fmtPhone } from "@/lib/format";

type Filter = "ALL" | UserKind | "SUSPENDED" | "GOLD";

export default function UsersPage() {
  return (
    <PermissionGate perm="users.view">
      <React.Suspense fallback={null}>
        <UsersInner />
      </React.Suspense>
    </PermissionGate>
  );
}

function UsersInner() {
  const { lang } = useLang();
  const search = useSearchParams();
  const { users, shops, fraud, setUserStatus } = useAdmin();

  const [filter, setFilter] = React.useState<Filter>("ALL");
  const [q, setQ] = React.useState(search.get("q") ?? "");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<{ id: string; to: "SUSPENDED" | "ACTIVE" } | null>(
    null,
  );

  const counts = React.useMemo(
    () => ({
      ALL: users.length,
      CUSTOMER: users.filter((u) => u.kind === "CUSTOMER").length,
      SHOP_STAFF: users.filter((u) => u.kind === "SHOP_STAFF").length,
      PLATFORM_STAFF: users.filter((u) => u.kind === "PLATFORM_STAFF").length,
      SUSPENDED: users.filter((u) => u.status === "SUSPENDED").length,
      GOLD: users.filter((u) => u.gold).length,
    }),
    [users],
  );

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users
      .filter((u) => {
        if (filter === "SUSPENDED") return u.status === "SUSPENDED";
        if (filter === "GOLD") return Boolean(u.gold);
        if (filter !== "ALL" && u.kind !== filter) return false;
        return true;
      })
      .filter((u) => {
        if (!needle) return true;
        return (
          u.name.toLowerCase().includes(needle) ||
          u.phone.includes(needle) ||
          u.city.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
  }, [users, filter, q]);

  const open = users.find((u) => u.id === openId) ?? null;
  const openFlags = open ? fraud.filter((f) => f.subjectId === open.id) : [];
  const ownedShops = open ? shops.filter((s) => s.ownerPhone === open.phone) : [];

  const KIND_LABEL: Record<UserKind, string> = {
    CUSTOMER: "Customer",
    SHOP_STAFF: "Shop staff",
    PLATFORM_STAFF: "Platform staff",
  };

  return (
    <>
      <PageHeader
        icon={<UsersIcon className="h-5 w-5" />}
        title={lang === "np" ? "प्रयोगकर्ताहरू" : "Users"}
        subtitle={
          lang === "np"
            ? "ग्राहक, पसलका कर्मचारी र प्लेटफर्म स्टाफका खाताहरू"
            : "Customer, shop-staff and platform accounts — with suspension controls"
        }
        actions={
          counts.SUSPENDED > 0 ? (
            <Badge tone="red" dot>
              {counts.SUSPENDED} suspended
            </Badge>
          ) : null
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterPills<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "ALL", label: "All", count: counts.ALL },
            { value: "CUSTOMER", label: "Customers", count: counts.CUSTOMER },
            { value: "SHOP_STAFF", label: "Shop staff", count: counts.SHOP_STAFF },
            { value: "PLATFORM_STAFF", label: "Platform", count: counts.PLATFORM_STAFF },
            { value: "GOLD", label: "Gold", count: counts.GOLD },
            { value: "SUSPENDED", label: "Suspended", count: counts.SUSPENDED },
          ]}
        />
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Name, phone or city"
          icon={<Search className="h-4 w-4" />}
          className="w-full sm:w-72"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="h-6 w-6" />}
          title="No accounts match this view"
          description="Try a different filter, or search by the full 10-digit phone number."
        />
      ) : (
        <Reveal>
          <TableWrap>
            <thead>
              <tr>
                <Th>Account</Th>
                <Th>Type</Th>
                <Th>City</Th>
                <Th className="text-right">Orders</Th>
                <Th className="text-right">Spend</Th>
                <Th>Last seen</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="transition hover:bg-ink-50">
                  <Td>
                    <button
                      type="button"
                      onClick={() => setOpenId(u.id)}
                      className="flex items-center gap-3 text-left"
                    >
                      <Avatar name={u.name} tone={u.status === "SUSPENDED" ? "red" : "crimson"} size={36} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-semibold text-ink-900">{u.name}</span>
                          {u.gold && (
                            <Crown
                              className="h-3.5 w-3.5 shrink-0 text-[#F6A609]"
                              aria-label="Gold subscriber"
                            />
                          )}
                        </span>
                        <span className="block text-xs text-ink-500">{fmtPhone(u.phone)}</span>
                      </span>
                    </button>
                  </Td>
                  <Td>
                    <Badge tone={u.kind === "PLATFORM_STAFF" ? "blue" : "ink"} dot={false}>
                      {KIND_LABEL[u.kind]}
                    </Badge>
                  </Td>
                  <Td>{u.city}</Td>
                  <Td className="text-right">{num(u.orders)}</Td>
                  <Td className="text-right font-semibold text-ink-900">{rs(u.spend)}</Td>
                  <Td>{ago(u.lastSeenAt, NOW)}</Td>
                  <Td>
                    <StatusBadge value={u.status} />
                  </Td>
                  <Td className="text-right">
                    <button
                      type="button"
                      onClick={() => setOpenId(u.id)}
                      className="text-sm font-semibold text-crimson-700 hover:underline"
                    >
                      Details
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Reveal>
      )}

      <Drawer
        open={open !== null}
        onClose={() => setOpenId(null)}
        title={open?.name ?? ""}
        subtitle={open ? `${KIND_LABEL[open.kind]} · ${fmtPhone(open.phone)}` : undefined}
        footer={
          open && (
            <Can perm="users.suspend">
              {open.status === "SUSPENDED" ? (
                <Button size="sm" onClick={() => setPending({ id: open.id, to: "ACTIVE" })}>
                  <RotateCcw className="h-4 w-4" /> Reactivate account
                </Button>
              ) : (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setPending({ id: open.id, to: "SUSPENDED" })}
                >
                  <Ban className="h-4 w-4" /> Suspend account
                </Button>
              )}
            </Can>
          )
        }
      >
        {open && (
          <>
            <div className="flex items-center gap-3">
              <Avatar name={open.name} tone={open.status === "SUSPENDED" ? "red" : "crimson"} size={52} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge value={open.status} />
                  {open.gold && (
                    <Badge tone="marigold" dot={false}>
                      <Crown className="h-3.5 w-3.5" /> Gold
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  Joined {fullDate(open.createdAt)} · last seen {ago(open.lastSeenAt, NOW)}
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-ink-50 px-3 py-3 text-center">
                <ShoppingBag className="mx-auto h-4 w-4 text-ink-400" />
                <p className="mt-1 text-base font-bold text-ink-900">{num(open.orders)}</p>
                <p className="text-xs text-ink-500">orders</p>
              </div>
              <div className="rounded-xl bg-ink-50 px-3 py-3 text-center">
                <Wallet className="mx-auto h-4 w-4 text-ink-400" />
                <p className="mt-1 text-base font-bold text-ink-900">{rs(open.spend)}</p>
                <p className="text-xs text-ink-500">lifetime spend</p>
              </div>
              <div className="rounded-xl bg-ink-50 px-3 py-3 text-center">
                <Store className="mx-auto h-4 w-4 text-ink-400" />
                <p className="mt-1 text-base font-bold text-ink-900">{num(open.ownedShops)}</p>
                <p className="text-xs text-ink-500">shops owned</p>
              </div>
            </div>

            {open.note && (
              <div className="mt-5 rounded-xl border border-red-100 bg-red-50/70 px-3.5 py-3 text-sm text-[#8f1c2a]">
                <span className="font-semibold">Note on file:</span> {open.note}
              </div>
            )}

            <div className="mt-5 divide-y divide-ink-100">
              <KeyValue label="Account ID">
                <span className="font-mono text-xs">{open.id}</span>
              </KeyValue>
              <KeyValue label="City">{open.city}</KeyValue>
              <KeyValue label="Account type">{KIND_LABEL[open.kind]}</KeyValue>
            </div>

            {ownedShops.length > 0 && (
              <>
                <p className="mt-6 text-sm font-bold text-ink-900">Shops</p>
                <ul className="mt-2 space-y-2">
                  {ownedShops.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 px-3.5 py-2.5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink-900">
                          {s.name}
                        </span>
                        <span className="block text-xs text-ink-500">
                          {s.area}, {s.city}
                        </span>
                      </span>
                      <StatusBadge value={s.status} />
                    </li>
                  ))}
                </ul>
              </>
            )}

            {openFlags.length > 0 && (
              <>
                <p className="mt-6 flex items-center gap-2 text-sm font-bold text-ink-900">
                  <ShieldAlert className="h-4 w-4 text-crimson-600" /> Fraud signals
                </p>
                <ul className="mt-2 space-y-2">
                  {openFlags.map((f) => (
                    <li key={f.id} className="rounded-xl border border-ink-100 px-3.5 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-semibold text-ink-900">{f.reason}</span>
                        <StatusBadge value={f.status} />
                      </div>
                      <p className="mt-1 text-xs text-ink-500">{f.detail}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </Drawer>

      <ConfirmDialog
        open={pending !== null}
        onCancel={() => setPending(null)}
        onConfirm={(reason) => {
          if (pending) setUserStatus(pending.id, pending.to, reason);
          setPending(null);
        }}
        title={pending?.to === "SUSPENDED" ? "Suspend this account?" : "Reactivate this account?"}
        description={
          pending?.to === "SUSPENDED"
            ? "The person can no longer sign in or place orders. Orders already out for delivery are unaffected."
            : "The person can sign in and order again. The note on file is kept for history."
        }
        confirmLabel={pending?.to === "SUSPENDED" ? "Suspend account" : "Reactivate"}
        destructive={pending?.to === "SUSPENDED"}
        reasonLabel={pending?.to === "SUSPENDED" ? "Reason (kept on the account)" : undefined}
        reasonRequired={pending?.to === "SUSPENDED"}
      />

    </>
  );

}

