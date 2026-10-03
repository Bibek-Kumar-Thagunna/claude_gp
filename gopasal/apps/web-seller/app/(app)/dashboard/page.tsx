"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Package,
  ShoppingBag,
  Store,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";
import { useSeller } from "@/components/providers";
import { useShops } from "@/components/shop-provider";
import { useAuth } from "@/components/auth-provider";
import { PageHeader, Card, Button, Badge } from "@/components/primitives";
import { StatCard } from "@/components/StatCard";
import { SalesBarChart } from "@/components/charts/SalesBarChart";
import { Reveal } from "@/components/Reveal";
import { ErrorPanel, InlineNotice, SkeletonRows } from "@/components/states";
import { useAnalytics } from "@/components/use-analytics";
import { num, rs } from "@/lib/format";
import {
  coverageLabel,
  inventoryWarnings,
  measuredLabel,
  moneyOrDash,
  delta,
  shopRows,
} from "@/lib/analytics-view";

/**
 * The seller's home screen, on the real analytics API.
 *
 * Everything with a number on it comes from one request — `GET
 * /seller/shops/:shopId/analytics/overview` for a single shop, or the consolidated
 * `GET /seller/analytics/overview` on "All shops" — and nothing on the page has a
 * fallback value. Four consequences worth knowing before reading the render:
 *
 * - **The money cards can be absent.** `analytics.view` is held by Owner and Manager
 *   only, while `dashboard.view` is held by every seeded role. An Order Handler
 *   therefore gets this screen with the figures replaced by a sentence saying who can
 *   see them, rather than a wall of zeros that reads as "your shop sold nothing".
 * - **A missing average or delta prints nothing.** `averageOrderValue` and the three
 *   change percentages arrive as `null` when the question does not apply — a shop's
 *   first week has no previous week — so the chip disappears instead of claiming 0%.
 * - **"Open orders" is not a seven-day figure.** It is a snapshot of work in hand,
 *   deliberately period-independent: an order placed a fortnight ago is no less waiting
 *   for being outside the window.
 * - **There is no low-stock number and no accept-by countdown**, because the schema has
 *   neither a stock threshold nor a deadline column. What it does have — out of stock,
 *   and products GoPasal does not track at all — is what this page shows.
 */
export default function DashboardPage() {
  const { can } = useSeller();
  const { shops, activeShop, activeShopId, shopById } = useShops();
  const { user } = useAuth();
  const { data, loading, error, denied, readableShopIds, reload } = useAnalytics("7d");

  const greeting =
    new Date().getHours() < 12
      ? "Good morning"
      : new Date().getHours() < 17
        ? "Good afternoon"
        : "Good evening";
  // The signed-in account's own name, and only if the API has one: an OTP
  // sign-up has no name until the seller gives one on their application.
  const firstName = user?.name?.trim().split(/\s+/)[0];

  const warnings = data ? inventoryWarnings(data.inventory) : [];
  const rows = React.useMemo(
    () => (data ? shopRows(data, (id) => shopById(id)?.name) : []),
    [data, shopById],
  );
  const open = data?.openOrders;

  return (
    <div>
      <PageHeader
        title={firstName ? `${greeting}, ${firstName}` : greeting}
        subtitle={
          activeShop
            ? [activeShop.name, activeShop.area].filter(Boolean).join(" · ")
            : `Consolidated view across ${shops.length} shop${shops.length === 1 ? "" : "s"}`
        }
        actions={
          can("orders.view") && open && open.awaitingAcceptance > 0 ? (
            <Button href="/orders" size="sm">
              {open.awaitingAcceptance} order{open.awaitingAcceptance > 1 ? "s" : ""} need action
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : null
        }
      />
      {denied && (
        <InlineNotice
          className="mb-4"
          message={
            activeShopId === null
              ? "Sales, order and stock figures need the Analytics permission, which your role doesn’t include for any of your shops. Your shop owner or manager can see them, and can grant it to your role."
              : "Sales, order and stock figures for this shop need the Analytics permission, which your role doesn’t include here. Everything else on your sidebar still works."
          }
        />
      )}

      {!denied && error && (
        <ErrorPanel
          title="Couldn’t load your figures"
          message={
            error.offline
              ? "You appear to be offline. Your figures will load once the connection is back."
              : error.message
          }
          offline={error.offline}
          onRetry={reload}
        />
      )}

      {!denied && !error && loading && (
        <div className="space-y-4">
          <SkeletonRows rows={2} />
          <div className="gp-skeleton h-64 rounded-xl" />
        </div>
      )}

      {!denied && !error && !loading && data && (
        <>
          {/*
            On "All shops" the API answers for the shops this account may read, which
            can be fewer than the shops in the switcher. Saying so is the difference
            between a total the seller can trust and one they cannot.
          */}
          {activeShopId === null && readableShopIds.length < shops.length && (
            <InlineNotice
              className="mb-4"
              message={`These figures cover ${coverageLabel(data)} of your ${shops.length}. The rest need the Analytics permission for your role.`}
            />
          )}

          <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
            <Reveal delay={0}>
              <StatCard
                label="Sales this week"
                value={rs(data.summary.sales)}
                icon={TrendingUp}
                tone="crimson"
                delta={delta(data.comparison.salesChangePercent)}
                hint="Delivered orders only"
              />
            </Reveal>
            <Reveal delay={1}>
              <StatCard
                label="Orders this week"
                value={num(data.summary.ordersPlaced)}
                icon={ShoppingBag}
                tone="blue"
                delta={delta(data.comparison.ordersChangePercent)}
                hint={`${num(data.summary.ordersDelivered)} delivered`}
              />
            </Reveal>
            <Reveal delay={2}>
              <StatCard
                label="Avg. order value"
                value={moneyOrDash(data.summary.averageOrderValue)}
                icon={Wallet}
                tone="green"
                delta={delta(data.comparison.averageOrderValueChangePercent)}
                hint={
                  data.summary.averageOrderValue === null
                    ? "No delivered orders yet this week"
                    : "Across delivered orders"
                }
              />
            </Reveal>
            <Reveal delay={3}>
              <StatCard
                label="Open orders now"
                value={num(open?.total ?? 0)}
                icon={Truck}
                tone="marigold"
                hint={`${num(open?.awaitingAcceptance ?? 0)} awaiting your action`}
              />
            </Reveal>
          </div>

          <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
            <Card className="min-w-0 p-5 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-ink-900">Sales trend</h2>
                  <p className="truncate text-sm text-ink-400">{measuredLabel(data)}</p>
                </div>
                <Link
                  href="/analytics"
                  className="shrink-0 text-sm font-semibold text-crimson-600 hover:underline"
                >
                  Details
                </Link>
              </div>
              <SalesBarChart data={data.salesSeries} />
            </Card>

            {/*
              Work in hand. These four counts ignore the seven-day window on purpose,
              and there is no accept-by countdown: no order, event or delivery row
              records a deadline, so a timer here would be a promise nobody made.
            */}
            <Card className="min-w-0 flex flex-col p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-ink-900">Open right now</h2>
                {open && open.total > 0 && <Badge tone="marigold">{num(open.total)}</Badge>}
              </div>
              {!open || open.total === 0 ? (
                <p className="my-auto py-8 text-center text-sm text-ink-400">
                  Nothing open. New orders will appear here.
                </p>
              ) : (
                <div className="flex-1">
                  <dl className="space-y-3">
                    <OpenRow label="Awaiting your acceptance" value={open.awaitingAcceptance} />
                    <OpenRow label="Accepted or packed" value={open.preparing} />
                    <OpenRow label="Out for delivery" value={open.outForDelivery} />
                  </dl>
                  {can("orders.view") && (
                    <Link
                      href="/orders"
                      className="mt-3 flex items-center justify-center gap-1 rounded-lg py-2 text-sm font-semibold text-crimson-600 hover:bg-crimson-50"
                    >
                      Open the order queue <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              )}
            </Card>
          </div>

          <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
            <Card className="min-w-0 p-5 lg:col-span-2">
              <h2 className="mb-4 text-lg font-semibold text-ink-900">Top products</h2>
              {data.topProducts.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-400">
                  No delivered orders in this window yet, so there is nothing to rank.
                </p>
              ) : (
                <>
                  <div className="space-y-3">
                    {data.topProducts.map((p, i) => (
                      <div key={p.productId ?? `gone-${p.name}`} className="flex items-center gap-3">
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-xs font-bold text-ink-500">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink-800">
                            {p.name}
                          </span>
                          <span className="text-xs text-ink-400">
                            {num(p.unitsSold)} sold
                            {p.productId === null && " · product no longer listed"}
                          </span>
                        </span>
                        <span className="text-sm font-semibold text-ink-900">{rs(p.revenue)}</span>
                      </div>
                    ))}
                  </div>
                  {/* These line totals use the price at the time of sale and exclude the
                      delivery fee and any order-level coupon, so they do not add up to
                      the sales figure above. Saying so is cheaper than a wrong total. */}
                  <p className="mt-4 text-xs text-ink-400">
                    Line totals at the price each item sold for. They exclude your delivery fee and
                    any coupon, so they won’t add up to sales.
                  </p>
                </>
              )}
            </Card>

            {/*
              Stock, without a threshold. `Product` carries `trackStock` and `stock` and
              nothing that says "low", so the rows here are out-of-stock counts plus the
              honest counterweight: how many products GoPasal holds no stock opinion on.
            */}
            <Card className="min-w-0 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-ink-900">Stock</h2>
                {warnings.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#c02636]">
                    <AlertTriangle className="h-3.5 w-3.5" /> {warnings.length}
                  </span>
                )}
              </div>
              {warnings.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-400">
                  Nothing tracked is at zero. GoPasal has no “running low” threshold, so it
                  won’t guess one.
                </p>
              ) : (
                <div className="space-y-3">
                  {warnings.map((w) => (
                    <div key={w.id}>
                      <div className="flex items-center gap-2.5">
                        <Package className="h-4 w-4 shrink-0 text-ink-400" />
                        <span className="min-w-0 flex-1 truncate text-sm text-ink-700">
                          {w.label}
                        </span>
                        <Badge tone={w.tone}>{num(w.count)}</Badge>
                      </div>
                      <p className="mt-1 pl-7 text-xs text-ink-400">{w.hint}</p>
                    </div>
                  ))}
                  {can("inventory.view") && (
                    <Link
                      href="/inventory"
                      className="mt-1 flex items-center justify-center gap-1 rounded-lg py-2 text-sm font-semibold text-crimson-600 hover:bg-crimson-50"
                    >
                      Manage inventory <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              )}
              <p className="mt-4 text-xs text-ink-400">
                {num(data.inventory.activeProducts)} products are live for sale.
              </p>
            </Card>
          </div>

          {/*
            Per-shop cards, from the consolidated response's own split. `byShop` falls
            out of the same single query, so this costs no extra request — and it lists
            only the shops the API included, which is exactly the permitted set.
          */}
          {activeShopId === null && rows.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-3 text-lg font-semibold text-ink-900">Your shops</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {rows.map((r) => {
                  const shop = shopById(r.shopId);
                  return (
                    <Card key={r.shopId} className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-crimson-50 text-crimson-600">
                            <Store className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink-900">{r.name}</p>
                            <p className="truncate text-xs text-ink-400">
                              {shop?.area ?? shop?.statusLabel ?? "—"}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {shop && shop.status !== "ACTIVE" && (
                            <Badge tone="marigold">{shop.statusLabel}</Badge>
                          )}
                          {shop?.soloMode && <Badge tone="ink">Solo</Badge>}
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-lg font-bold text-ink-900">{rs(r.sales)}</p>
                          <p className="text-xs text-ink-400">
                            This week{r.sharePercent === null ? "" : ` · ${r.sharePercent}% of total`}
                          </p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-ink-900">{num(r.ordersPlaced)}</p>
                          <p className="text-xs text-ink-400">
                            Orders · {num(r.ordersDelivered)} delivered
                          </p>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * One line of the open-orders snapshot. A `<dl>` pair rather than a table row, so a
 * screen reader reads the label with its count; the count is never colour-coded,
 * because "3 awaiting acceptance" is urgent or not depending on the shop, not on us.
 */
function OpenRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink-50 pb-2.5 last:border-0 last:pb-0">
      <dt className="text-sm text-ink-500">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-ink-900">{num(value)}</dd>
    </div>
  );
}
