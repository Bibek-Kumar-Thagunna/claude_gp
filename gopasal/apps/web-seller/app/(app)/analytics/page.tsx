"use client";

import * as React from "react";
import {
  BarChart3,
  Banknote,
  ShoppingBag,
  Store,
  TrendingUp,
  Trophy,
  Wallet,
} from "lucide-react";
import { useShops } from "@/components/shop-provider";
import { PageHeader, Card } from "@/components/primitives";
import { StatCard } from "@/components/StatCard";
import { SalesBarChart } from "@/components/charts/SalesBarChart";
import { Reveal } from "@/components/Reveal";
import { ErrorPanel, InlineNotice, SkeletonRows } from "@/components/states";
import { useAnalytics } from "@/components/use-analytics";
import { cn } from "@/lib/cn";
import { num, rs } from "@/lib/format";
import { ANALYTICS_PERIODS, PERIOD_LABELS, type AnalyticsPeriod } from "@/lib/api/analytics";
import {
  coverageLabel,
  delta,
  measuredLabel,
  moneyOrDash,
  shopRows,
} from "@/lib/analytics-view";

/**
 * Analytics, on the real API and nothing else.
 *
 * The period switch is a refetch, not a reslice: `?period=7d|30d|90d` is the only
 * query the API accepts and `forbidNonWhitelisted` turns a fourth value into a 400, so
 * there is no way for this screen to ask for a window the backend has not measured.
 *
 * What this page deliberately does **not** show, because no column exists behind it:
 *
 * - **Settlement, payouts, net earnings.** `payments.codCollected` is cash *due* on
 *   delivered COD orders — `Order.paymentStatus` flips to PAID merely by delivering,
 *   and `Delivery.codAmount` is written only when a rider closes the leg. Nothing
 *   records a shopkeeper counting money or GoPasal paying anyone, so the panel below
 *   says "due", says why, and offers no button.
 * - **Conversion, traffic, views, repeat customers, per-coupon revenue, forecasts.**
 *   None of these are recorded anywhere in the schema. An estimate would be this
 *   console's opinion wearing the seller's data as a costume.
 * - **A "best day" figure.** It was a `Math.max` over the visible bars, which the chart
 *   already shows; the number added a claim without adding a fact. It was removed once,
 *   came back as a `Badge`, and is now gone again — if it reappears, this comment is the
 *   record that it is not wanted.
 *
 * `analytics.view` is a SHOP-scoped permission held by Owner and Manager only, so this
 * screen asks `canInShop` per shop rather than the ambient `can` — a staff member with
 * it on one shop and not another sees figures for exactly the first.
 */
export default function AnalyticsPage() {
  const { shops, activeShop, activeShopId, shopById } = useShops();
  const [period, setPeriod] = React.useState<AnalyticsPeriod>("7d");
  const { data, loading, error, denied, readableShopIds, reload } = useAnalytics(period);

  const rows = React.useMemo(
    () => (data ? shopRows(data, (id) => shopById(id)?.name) : []),
    [data, shopById],
  );

  return (
    <div>
      <PageHeader
        icon={<BarChart3 className="h-5 w-5" />}
        title="Analytics"
        subtitle={
          activeShop
            ? [activeShop.name, activeShop.area].filter(Boolean).join(" · ")
            : `Consolidated across ${shops.length} shop${shops.length === 1 ? "" : "s"}`
        }
        actions={
          <div className="inline-flex rounded-xl border border-ink-200 bg-white p-1">
            {ANALYTICS_PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                aria-pressed={period === p}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                  period === p
                    ? "bg-crimson-500 text-white"
                    : "text-ink-500 hover:text-ink-800",
                )}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        }
      />
      {denied && (
        <InlineNotice
          message={
            activeShopId === null
              ? "Analytics needs the Analytics permission, which your role doesn’t include for any of your shops. Your shop owner or manager can grant it."
              : "Analytics needs the Analytics permission, which your role doesn’t include for this shop. Try another shop from the switcher, or ask your owner to grant it here."
          }
        />
      )}

      {!denied && error && (
        <ErrorPanel
          title="Couldn’t load analytics"
          message={
            error.offline
              ? "You appear to be offline. These figures will load once the connection is back."
              : error.message
          }
          offline={error.offline}
          onRetry={reload}
        />
      )}

      {!denied && !error && loading && (
        <div className="space-y-4">
          <SkeletonRows rows={2} />
          <div className="gp-skeleton h-72 rounded-xl" />
        </div>
      )}

      {!denied && !error && !loading && data && (
        <>
          {activeShopId === null && readableShopIds.length < shops.length && (
            <InlineNotice
              className="mb-4"
              message={`These figures cover ${coverageLabel(data)} of your ${shops.length}. The rest need the Analytics permission for your role.`}
            />
          )}

          <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
            <Reveal delay={0}>
              <StatCard
                label="Sales"
                value={rs(data.summary.sales)}
                icon={TrendingUp}
                tone="crimson"
                delta={delta(data.comparison.salesChangePercent)}
                hint="Delivered orders only"
              />
            </Reveal>
            <Reveal delay={1}>
              <StatCard
                label="Orders placed"
                value={num(data.summary.ordersPlaced)}
                icon={ShoppingBag}
                tone="blue"
                delta={delta(data.comparison.ordersChangePercent)}
                hint={`${num(data.summary.ordersDelivered)} delivered · ${num(
                  data.summary.ordersCancelled,
                )} cancelled`}
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
                    ? "Nothing delivered in this window"
                    : "Across delivered orders"
                }
              />
            </Reveal>
            <Reveal delay={3}>
              <StatCard
                label="In progress"
                value={num(data.summary.ordersInProgress)}
                icon={Store}
                tone="marigold"
                hint="Placed in this window, not yet delivered"
              />
            </Reveal>
          </div>

          <Reveal className="mt-4">
            <Card className="p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-ink-900">
                    Sales — {PERIOD_LABELS[data.period]}
                  </h2>
                  {/* The window, in the API's own timezone, so "a day" is not left to the
                      reader's clock. The API reports the zone it computed in. */}
                  <p className="text-sm text-ink-400">{measuredLabel(data)}</p>
                </div>
              </div>
              <SalesBarChart data={data.salesSeries} />
              <p className="mt-3 text-xs text-ink-400">
                Each bar is one Nepal day, counted by when the order was placed. Money appears
                once an order is delivered, so a recent day can still rise.
              </p>
            </Card>
          </Reveal>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Reveal>
              <Card className="p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-crimson-500" />
                  <h2 className="text-lg font-semibold text-ink-900">Product performance</h2>
                </div>
                {data.topProducts.length === 0 ? (
                  <p className="py-6 text-center text-sm text-ink-400">
                    Nothing was delivered in this window, so there is nothing to rank.
                  </p>
                ) : (
                  <>
                    <div className="space-y-3">
                      {data.topProducts.map((p, i) => (
                        <div
                          key={p.productId ?? `gone-${p.name}`}
                          className="flex items-center gap-3"
                        >
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-xs font-bold text-ink-500">
                            {i + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink-800">
                              {p.name}
                            </span>
                            <span className="text-xs text-ink-400">
                              {num(p.unitsSold)} sold
                              {p.productId === null && " · no longer listed"}
                            </span>
                          </span>
                          <span className="text-sm font-semibold text-ink-900">{rs(p.revenue)}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 text-xs text-ink-400">
                      Line totals at the price each item sold for, from delivered orders. They
                      exclude your delivery fee and any order coupon, so they won’t add up to the
                      sales figure above.
                    </p>
                  </>
                )}
              </Card>
            </Reveal>

            {/*
              Payments. Four counts and two sums, all from the same window, and not one
              of them a settlement: the words "payout", "pending settlement" and "net
              earnings" appeared here before and had no column behind any of them.
            */}
            <Reveal>
              <Card className="p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Banknote className="h-5 w-5 text-[#0B7E58]" />
                  <h2 className="text-lg font-semibold text-ink-900">Payments &amp; COD</h2>
                </div>
                <dl className="space-y-3">
                  <MoneyRow label="COD orders placed" value={num(data.payments.codOrders)} />
                  <MoneyRow
                    label="Cash due on delivered COD orders"
                    value={rs(data.payments.codCollected)}
                    tone="green"
                  />
                  <MoneyRow label="Online orders placed" value={num(data.payments.onlineOrders)} />
                  <MoneyRow
                    label="Delivered online orders"
                    value={rs(data.payments.onlineDelivered)}
                  />
                </dl>
                <p className="mt-4 rounded-xl bg-ink-50 px-3 py-2 text-xs text-ink-500">
                  “Cash due” is the value of COD orders you have delivered. GoPasal does not record
                  your team counting or depositing it, so this is not a settlement figure and there
                  is nothing here to withdraw.
                </p>
              </Card>
            </Reveal>
          </div>

          {/*
            By shop, from `byShop` on the consolidated response — the same single query,
            split by the API rather than by fanning out one request per shop. Share is a
            share of the delivered total, and is left blank when that total is zero
            rather than dividing by it.
          */}
          {activeShopId === null && rows.length > 0 && (
            <Reveal className="mt-4">
              <Card className="p-5">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <Store className="h-5 w-5 text-crimson-500" />
                  <h2 className="text-lg font-semibold text-ink-900">By shop</h2>
                  <span className="text-sm text-ink-400">· {PERIOD_LABELS[data.period]}</span>
                </div>
                <div className="gp-scroll overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      {/*
                        `scope="col"` so a screen reader announces "Orders" against each
                        number instead of reading six bare figures per row. This is the
                        console's only real <table>; everywhere else the rows are cards.
                      */}
                      <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                        <th scope="col" className="pb-2 font-semibold">
                          Shop
                        </th>
                        <th scope="col" className="pb-2 text-right font-semibold">
                          Orders
                        </th>
                        <th scope="col" className="pb-2 text-right font-semibold">
                          Delivered
                        </th>
                        <th scope="col" className="pb-2 text-right font-semibold">
                          Avg. order
                        </th>
                        <th scope="col" className="pb-2 text-right font-semibold">
                          Sales
                        </th>
                        <th scope="col" className="pb-2 pl-4 font-semibold">
                          Share
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.shopId} className="border-b border-ink-50 last:border-0">
                          <td className="py-3">
                            <span className="font-medium text-ink-800">{r.name}</span>
                            <span className="block text-xs text-ink-400">
                              {shopById(r.shopId)?.area ?? ""}
                            </span>
                          </td>
                          <td className="py-3 text-right text-ink-700">{num(r.ordersPlaced)}</td>
                          <td className="py-3 text-right text-ink-700">{num(r.ordersDelivered)}</td>
                          <td className="py-3 text-right text-ink-700">
                            {moneyOrDash(r.averageOrderValue)}
                          </td>
                          <td className="py-3 text-right font-semibold text-ink-900">
                            {rs(r.sales)}
                          </td>
                          <td className="py-3 pl-4">
                            {r.sharePercent === null ? (
                              <span className="text-xs text-ink-400">—</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-24 overflow-hidden rounded-full bg-ink-100">
                                  <div
                                    className="h-full rounded-full bg-crimson-400"
                                    style={{ width: `${Math.round(r.sharePercent)}%` }}
                                  />
                                </div>
                                <span className="w-12 text-xs font-medium text-ink-500">
                                  {r.sharePercent}%
                                </span>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="text-sm font-bold text-ink-900">
                        <td className="pt-3">Total</td>
                        <td className="pt-3 text-right">{num(data.summary.ordersPlaced)}</td>
                        <td className="pt-3 text-right">{num(data.summary.ordersDelivered)}</td>
                        <td className="pt-3 text-right">
                          {moneyOrDash(data.summary.averageOrderValue)}
                        </td>
                        <td className="pt-3 text-right">{rs(data.summary.sales)}</td>
                        <td className="pt-3 pl-4 text-xs text-ink-400">
                          {data.summary.sales === 0 ? "—" : "100%"}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            </Reveal>
          )}
        </>
      )}
    </div>
  );
}

/**
 * One label-and-figure pair from the payments panel.
 *
 * `tone` only tints the figure; the label always carries the meaning, so colour is
 * never the sole signal of what a number is.
 */
function MoneyRow({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string;
  tone?: "ink" | "green";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink-50 pb-3 last:border-0 last:pb-0">
      <dt className="text-sm text-ink-500">{label}</dt>
      <dd
        className={cn(
          "text-sm font-semibold tabular-nums",
          tone === "green" ? "text-[#0B7E58]" : "text-ink-900",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
