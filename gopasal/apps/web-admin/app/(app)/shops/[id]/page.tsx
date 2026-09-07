"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Store,
  ShieldCheck,
  Ban,
  ClipboardCheck,
  FileCheck2,
  FileX2,
  Phone,
  MapPin,
  Star,
  Package,
  ShoppingBag,
  Wallet,
  History,
  RotateCcw,
} from "lucide-react";
import {
  PageHeader,
  Card,
  SectionTitle,
  Badge,
  Button,
  KeyValue,
  EmptyState,
  Avatar,
} from "@/components/primitives";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { PermissionGate, Can } from "@/components/PermissionGate";
import { ConfirmDialog } from "@/components/Drawer";
import { CoverageMap } from "@/components/CoverageMap";
import { Reveal } from "@/components/Reveal";
import { useAdmin } from "@/components/providers";
import { NOW } from "@/lib/data";
import { rs, rsCompact, num, ago, fullDate, phone as fmtPhone } from "@/lib/format";

/**
 * A shop record already exists, so the only decisions here are suspend and
 * reactivate. Approval and rejection belong to the *application* that precedes
 * the shop — they are real API calls on `/admin/onboarding/applications` and they
 * live on the review queue. A `PENDING` shop therefore links there instead of
 * offering a second, fictional approve button.
 */
type Pending = { kind: "suspend" | "reactivate" } | null;

export default function ShopDetailPage() {
  return (
    <PermissionGate perm="shops.view">
      <ShopDetailInner />
    </PermissionGate>
  );
}

function ShopDetailInner() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { shops, users, audit, setShopStatus } = useAdmin();
  const [pending, setPending] = React.useState<Pending>(null);

  const shop = shops.find((s) => s.id === id);

  if (!shop) {
    return (
      <EmptyState
        icon={<Store className="h-6 w-6" />}
        title="Shop not found"
        description="It may have been removed, or the link is out of date."
        action={
          <Button href="/shops" variant="outline" size="sm">
            Back to shops
          </Button>
        }
      />
    );
  }

  const owner = users.find((u) => u.phone === shop.ownerPhone);
  const trail = audit.filter((a) => a.entityType === "shop" && a.entityId === shop.id);
  const docsVerified = shop.docs.filter((d) => d.verified).length;

  const confirm = (reason?: string) => {
    if (!pending) return;
    if (pending.kind === "reactivate") setShopStatus(shop.id, "ACTIVE");
    if (pending.kind === "suspend") setShopStatus(shop.id, "SUSPENDED", reason);
    setPending(null);
  };

  const dialogCopy = {
    reactivate: {
      title: `Reactivate ${shop.name}?`,
      description: "Listings become visible again and the shop can accept orders.",
      confirmLabel: "Reactivate",
      destructive: false,
      reasonLabel: undefined as string | undefined,
    },
    suspend: {
      title: `Suspend ${shop.name}?`,
      description:
        "Listings are hidden immediately and no new orders can be placed. Orders already out for delivery are not cancelled.",
      confirmLabel: "Suspend shop",
      destructive: true,
      reasonLabel: "Reason for suspension",
    },
  }[pending?.kind ?? "suspend"];

  return (
    <>
      <Link
        href="/shops"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 transition hover:text-crimson-700"
      >
        <ArrowLeft className="h-4 w-4" /> All shops
      </Link>

      <PageHeader
        icon={<Store className="h-5 w-5" />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {shop.name}
            <StatusBadge value={shop.status} />
            {shop.verified && (
              <Badge tone="green" dot={false}>
                <ShieldCheck className="h-3.5 w-3.5" /> Verified
              </Badge>
            )}
          </span>
        }
        subtitle={`${shop.category} · ${shop.area}, ${shop.city} · applied ${fullDate(shop.createdAt)}`}
        actions={
          <>
            {shop.status === "PENDING" && (
              <Can perm="shops.view">
                <Button href="/approvals" variant="outline" size="sm">
                  <ClipboardCheck className="h-4 w-4" /> Review the application
                </Button>
              </Can>
            )}
            {shop.status === "ACTIVE" && (
              <Can perm="shops.suspend">
                <Button variant="danger" size="sm" onClick={() => setPending({ kind: "suspend" })}>
                  <Ban className="h-4 w-4" /> Suspend
                </Button>
              </Can>
            )}
            {(shop.status === "SUSPENDED" || shop.status === "REJECTED") && (
              <Can perm="shops.approve">
                <Button size="sm" onClick={() => setPending({ kind: "reactivate" })}>
                  <RotateCcw className="h-4 w-4" /> Reactivate
                </Button>
              </Can>
            )}
          </>
        }
      />

      {shop.note && (
        <div className="mb-4 rounded-2xl border border-red-100 bg-red-50/70 px-4 py-3 text-sm text-[#8f1c2a]">
          <span className="font-semibold">Operator note:</span> {shop.note}
        </div>
      )}

      <Reveal className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Products listed" value={num(shop.products)} icon={Package} tone="blue" />
        <StatCard label="Orders delivered" value={num(shop.orders)} icon={ShoppingBag} tone="green" />
        <StatCard label="Lifetime GMV" value={rsCompact(shop.gmv)} icon={Wallet} tone="crimson" />
        <StatCard
          label="Customer rating"
          value={shop.ratingCount === 0 ? "—" : shop.ratingAvg.toFixed(1)}
          icon={Star}
          tone="marigold"
          hint={shop.ratingCount === 0 ? "No ratings yet" : `${num(shop.ratingCount)} ratings`}
        />
      </Reveal>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Reveal delay={0.06} className="lg:col-span-2">
          <Card className="h-full pb-5">
            <SectionTitle
              title="Delivery coverage"
              hint="The shop delivers with its own riders inside this radius (SRS Model 4A)"
            />
            <div className="px-5 pt-5">
              <CoverageMap
                lat={shop.lat}
                lng={shop.lng}
                radiusKm={shop.radiusKm}
                label={`${shop.area}, ${shop.city}`}
                height={300}
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-ink-50 px-3.5 py-3">
                  <p className="text-xs text-ink-500">Radius</p>
                  <p className="text-sm font-bold text-ink-900">{shop.radiusKm} km</p>
                </div>
                <div className="rounded-xl bg-ink-50 px-3.5 py-3">
                  <p className="text-xs text-ink-500">Coordinates</p>
                  <p className="font-mono text-sm font-semibold text-ink-900">
                    {shop.lat.toFixed(4)}, {shop.lng.toFixed(4)}
                  </p>
                </div>
                <div className="rounded-xl bg-ink-50 px-3.5 py-3">
                  <p className="text-xs text-ink-500">Slug</p>
                  <p className="truncate font-mono text-sm font-semibold text-ink-900">{shop.slug}</p>
                </div>
              </div>
            </div>
          </Card>
        </Reveal>

        <Reveal delay={0.1}>
          <Card className="h-full pb-5">
            <SectionTitle
              title="Registration papers"
              hint={`${docsVerified} of ${shop.docs.length} verified`}
            />
            <ul className="mt-3 divide-y divide-ink-100">
              {shop.docs.map((d) => (
                <li key={d.label} className="flex items-center gap-3 px-5 py-3">
                  <span
                    className={
                      d.verified
                        ? "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EAF7EF] text-[#0B7E58]"
                        : "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FFF3DF] text-[#8a5a00]"
                    }
                  >
                    {d.verified ? (
                      <FileCheck2 className="h-4 w-4" />
                    ) : (
                      <FileX2 className="h-4 w-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-900">
                      {d.label}
                    </span>
                    <span className="block text-xs text-ink-500">
                      {d.verified ? "Checked by compliance" : "Not verified yet"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {docsVerified < shop.docs.length && (
              <p className="mt-3 px-5 text-xs text-[#8a5a00]">
                Approve only once every paper is verified — the decision is attributed to you.
              </p>
            )}
          </Card>
        </Reveal>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Reveal delay={0.06}>
          <Card className="h-full pb-5">
            <SectionTitle title="Owner" hint="The account that applied for this shop" />
            <div className="flex items-center gap-3 px-5 pt-5">
              <Avatar name={shop.ownerName} tone="crimson" size={44} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink-900">{shop.ownerName}</p>
                <p className="flex items-center gap-1.5 text-xs text-ink-500">
                  <Phone className="h-3.5 w-3.5" /> {fmtPhone(shop.ownerPhone)}
                </p>
              </div>
            </div>
            <div className="mt-2 divide-y divide-ink-100 px-5">
              <KeyValue label="Account">
                {owner ? <StatusBadge value={owner.status} /> : "Not linked"}
              </KeyValue>
              <KeyValue label="Shops owned">{owner ? num(owner.ownedShops) : "—"}</KeyValue>
              <KeyValue label="Last seen">
                {owner ? ago(owner.lastSeenAt, NOW) : "—"}
              </KeyValue>
            </div>
            {owner && (
              <div className="px-5 pt-4">
                <Can perm="users.view">
                  <Button href={`/users?q=${owner.phone}`} variant="outline" size="sm">
                    Open account
                  </Button>
                </Can>
              </div>
            )}
          </Card>
        </Reveal>

        <Reveal delay={0.1}>
          <Card className="h-full pb-5">
            <SectionTitle title="Shop record" hint="Straight from the platform database" />
            <div className="divide-y divide-ink-100 px-5 pt-2">
              <KeyValue label="Status">
                <StatusBadge value={shop.status} />
              </KeyValue>
              <KeyValue label="Applied">{fullDate(shop.createdAt)}</KeyValue>
              <KeyValue label="Approved">
                {shop.approvedAt ? fullDate(shop.approvedAt) : "—"}
              </KeyValue>
              <KeyValue label="Category">{shop.category}</KeyValue>
              <KeyValue label="Area">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-ink-400" />
                  {shop.area}, {shop.city}
                </span>
              </KeyValue>
              <KeyValue label="Average order">
                {shop.orders ? rs(Math.round(shop.gmv / shop.orders)) : "—"}
              </KeyValue>
            </div>
          </Card>
        </Reveal>

        <Can perm="audit.view">
          <Reveal delay={0.14}>
            <Card className="h-full pb-5">
              <SectionTitle title="Decision history" hint="Who changed this shop, and when" />
              <ul className="mt-3 divide-y divide-ink-100">
                {trail.length === 0 && (
                  <li className="px-5 py-8 text-center text-sm text-ink-500">
                    No recorded decisions on this shop yet.
                  </li>
                )}
                {trail.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-600">
                      <History className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink-800">
                        <span className="font-mono text-xs text-crimson-700">{a.action}</span>{" "}
                        <span className="font-semibold">{a.actor}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {a.before ? `${a.before} → ` : ""}
                        {a.after ?? ""} · {ago(a.createdAt, NOW)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </Reveal>
        </Can>
      </div>

      <ConfirmDialog
        open={pending !== null}
        onCancel={() => setPending(null)}
        onConfirm={confirm}
        title={dialogCopy.title}
        description={dialogCopy.description}
        confirmLabel={dialogCopy.confirmLabel}
        destructive={dialogCopy.destructive}
        reasonLabel={dialogCopy.reasonLabel}
        reasonRequired={Boolean(dialogCopy.reasonLabel)}
      />


    </>
  );

}

