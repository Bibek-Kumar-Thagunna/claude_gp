"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, MapPin, Store } from "lucide-react";
import { PermissionGate } from "@/components/PermissionGate";
import { PageHeader, Card, Button, KeyValue } from "@/components/primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { adminApi, type AdminShopDetail } from "@/lib/api/admin";
import { fullDate, num, phone, rs } from "@/lib/format";

export default function ShopDetailPage() {
  return <PermissionGate perm="shops.view"><ShopDetail /></PermissionGate>;
}

function ShopDetail() {
  const { id } = useParams<{ id: string }>();
  const [shop, setShop] = React.useState<AdminShopDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { void adminApi.shop(id).then(setShop).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load shop")); }, [id]);
  return <>
    <PageHeader icon={<Store className="h-5 w-5" />} title={shop?.name ?? "Shop detail"} subtitle="Persisted profile, lifecycle, owner, and operational configuration" actions={<Button href="/shops" variant="outline" size="sm"><ArrowLeft className="h-4 w-4" /> All shops</Button>} />
    {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!shop ? <p className="text-sm text-ink-500">Loading shop…</p> : <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-ink-900">Lifecycle</h2><p className="mt-1 text-sm text-ink-500">Created {fullDate(shop.createdAt)}</p></div><StatusBadge value={shop.status} /></div>{shop.statusReason && <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700"><strong>Seller-visible reason</strong><p className="mt-1">{shop.statusReason}</p></div>}<div className="mt-4 divide-y divide-ink-100"><KeyValue label="Verified">{shop.verified ? "Yes" : "No"}</KeyValue><KeyValue label="Approved">{shop.approvedAt ? fullDate(shop.approvedAt) : "Not yet"}</KeyValue><KeyValue label="Products">{num(shop._count.products)}</KeyValue><KeyValue label="Orders">{num(shop._count.orders)}</KeyValue><KeyValue label="Staff memberships">{num(shop._count.memberships)}</KeyValue></div></Card>
      <Card className="p-5"><h2 className="text-lg font-bold text-ink-900">Owner and identity</h2><div className="mt-4 divide-y divide-ink-100"><KeyValue label="Owner">{shop.owner.name ?? "Unnamed owner"}</KeyValue><KeyValue label="Verified phone">{phone(shop.owner.phone)}</KeyValue><KeyValue label="Public slug">{shop.slug}</KeyValue><KeyValue label="Shop phone">{shop.phone ? phone(shop.phone) : "Not set"}</KeyValue></div></Card>
      <Card className="p-5"><h2 className="text-lg font-bold text-ink-900">Location and delivery</h2><div className="mt-4 divide-y divide-ink-100"><KeyValue label="Area">{shop.area ?? "Not set"}</KeyValue><KeyValue label="Address">{shop.fullAddress ?? "Not set"}</KeyValue><KeyValue label="Map pin">{shop.lat != null && shop.lng != null ? `${shop.lat.toFixed(5)}, ${shop.lng.toFixed(5)}` : "Not set"}</KeyValue><KeyValue label="Delivery radius">{shop.deliveryRadiusKm} km</KeyValue><KeyValue label="Minimum order">{rs(shop.minOrder)}</KeyValue></div>{shop.lat != null && shop.lng != null && <a className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-crimson-700" href={`https://www.openstreetmap.org/?mlat=${shop.lat}&mlon=${shop.lng}#map=17/${shop.lat}/${shop.lng}`} target="_blank" rel="noreferrer"><MapPin className="h-4 w-4" /> Open pin in OpenStreetMap</a>}</Card>
      <Card className="p-5"><h2 className="text-lg font-bold text-ink-900">Operations</h2><div className="mt-4 divide-y divide-ink-100"><KeyValue label="Hours">{shop.hours ?? "Not set"}</KeyValue><KeyValue label="Open now">{shop.isOpen ? "Yes" : "No"}</KeyValue><KeyValue label="Delivery mode">{shop.soloMode ? "Owner self-delivery" : "Assigned riders"}</KeyValue><KeyValue label="Cash on delivery">{shop.codEnabled ? "Enabled" : "Disabled"}</KeyValue><KeyValue label="Online payment">{shop.onlinePaymentEnabled ? "Enabled" : "Disabled"}</KeyValue><KeyValue label="Rating">{shop.ratingCount ? `${shop.ratingAvg.toFixed(1)} from ${num(shop.ratingCount)} reviews` : "No ratings yet"}</KeyValue></div></Card>
      {shop.description && <Card className="p-5 lg:col-span-2"><h2 className="text-lg font-bold text-ink-900">Public description</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-600">{shop.description}</p></Card>}
    </div>}
  </>;
}
