"use client";

import * as React from "react";
import Link from "next/link";
import {
  Wallet,
  Search,
  Store,
  Banknote,
  HandCoins,
  PauseCircle,
  Receipt,
  TicketPercent,
  ArrowDownRight,
  ArrowUpRight,
  Info,
} from "lucide-react";
import {
  PageHeader,
  Card,
  SectionTitle,
  Badge,
  Button,
  FilterPills,
  SearchInput,
  EmptyState,
  TableWrap,
  Th,
  Td,
} from "@/components/primitives";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { PermissionGate, Can } from "@/components/PermissionGate";
import { Reveal } from "@/components/Reveal";
import { BarList, type BarRow } from "@/components/charts/BarList";
import { useAdmin, useLang } from "@/components/providers";
import {
  NOW,
  SETTLEMENTS,
  FINANCE_SUMMARY,
  COD_FLOAT,
  PAYMENT_MIX,
  type SettlementStatus,
} from "@/lib/data";
import { rs, rsCompact, num, ago, dayMonth, fullDate } from "@/lib/format";

type Filter = "ALL" | SettlementStatus;

export default function FinancePage() {
  return (
    <PermissionGate
      perm="finance.view"
      title="You can’t see platform finance"
      description="Payouts, commission and the COD float need the “View finance” permission."
    >
      <FinanceInner />
    </PermissionGate>
  );
}

function FinanceInner() {
  const { lang } = useLang();
  const { shops } = useAdmin();
  const [filter, setFilter] = React.useState<Filter>("ALL");
  const [q, setQ] = React.useState("");

  const counts = React.useMemo(
    () => ({
      ALL: SETTLEMENTS.length,
      DUE: SETTLEMENTS.filter((s) => s.status === "DUE").length,
      PROCESSING: SETTLEMENTS.filter((s) => s.status === "PROCESSING").length,
      PAID: SETTLEMENTS.filter((s) => s.status === "PAID").length,
      HELD: SETTLEMENTS.filter((s) => s.status === "HELD").length,
    }),
    [],
  );

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rank: Record<SettlementStatus, number> = { HELD: 0, DUE: 1, PROCESSING: 2, PAID: 3 };
    return SETTLEMENTS.filter((s) => (filter === "ALL" ? true : s.status === filter))
      .filter((s) => (needle ? s.shopName.toLowerCase().includes(needle) : true))
      .sort(
        (a, b) =>
          rank[a.status] - rank[b.status] ||
          new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime(),
      );
  }, [filter, q]);

  /* COD float: what shops collected in cash versus what they have remitted. */
  const float = React.useMemo(() => {
    const collected = COD_FLOAT.reduce((s, d) => s + d.collected, 0);
    const remitted = COD_FLOAT.reduce((s, d) => s + d.remitted, 0);
    return { collected, remitted, outstanding: collected - remitted };
  }, []);

  const floatRows: BarRow[] = COD_FLOAT.map((d) => ({
    label: dayMonth(d.day),
    value: d.collected,
    display: rsCompact(d.collected),
    hint: `${rsCompact(d.remitted)} remitted · ${rsCompact(Math.max(0, d.collected - d.remitted))} still with the shop`,
    tone: d.collected - d.remitted > d.collected * 0.4 ? "red" : "crimson",
  }));

  const paymentRows: BarRow[] = PAYMENT_MIX.map((p) => ({
    label: p.label,
    value: p.amount,
    display: rsCompact(p.amount),
    hint: `${num(p.orders)} orders`,
    tone: p.tone as BarRow["tone"],
  }));

  const shopFor = (shopId: string) => shops.find((s) => s.id === shopId) ?? null;

  return (
    <>
      <PageHeader
        icon={<Wallet className="h-5 w-5" />}
        title={lang === "np" ? "आर्थिक हिसाब" : "Finance"}
        subtitle={
          lang === "np"
            ? "कमिशन, पसलको भुक्तानी र नगद (COD) को हिसाब"
            : "Commission earned, what each shop owes or is owed, and where the cash is sitting"
        }
        actions={
          <>
            {counts.HELD > 0 && (
              <Badge tone="red" dot>
                {num(counts.HELD)} payout held
              </Badge>
            )}
            <Can perm="analytics.platform.view">
              <Button href="/analytics" variant="outline" size="sm">
                Analytics
              </Button>
            </Can>
          </>
        }
      />

      <Reveal className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="GMV · last 30 days"
          value={rsCompact(FINANCE_SUMMARY.gmv30)}
          icon={Receipt}
          tone="ink"
          hint="Value of goods sold through shops"
        />
        <StatCard
          label="Commission earned"
          value={rsCompact(FINANCE_SUMMARY.commission30)}
          icon={HandCoins}
          tone="crimson"
          hint="8.1% of GMV over 30 days"
        />
        <StatCard
          label="Cash held by shops"
          value={rsCompact(FINANCE_SUMMARY.codOutstanding)}
          icon={Banknote}
          tone="marigold"
          hint="COD collected, not yet remitted"
        />
        <StatCard
          label="Payouts held back"
          value={rsCompact(FINANCE_SUMMARY.heldAmount)}
          icon={PauseCircle}
          tone={FINANCE_SUMMARY.heldAmount ? "red" : "green"}
          hint="Frozen pending a fraud or dispute review"
        />
      </Reveal>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Reveal delay={0.06} className="lg:col-span-2">
          <Card className="h-full pb-5">
            <SectionTitle
              title="Cash on delivery float"
              hint="Collected at the door each day, against what reached GoPasal"
              action={
                <Badge tone={float.outstanding > 0 ? "marigold" : "green"} dot>
                  {rsCompact(float.outstanding)} outstanding
                </Badge>
              }
            />
            <div className="px-5 pt-5">
              <BarList rows={floatRows} />
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-ink-50 px-3.5 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    Collected
                  </p>
                  <p className="mt-1 text-base font-bold text-ink-900">{rs(float.collected)}</p>
                </div>
                <div className="rounded-xl bg-[#EAF7EF] px-3.5 py-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#0B7E58]">
                    <ArrowDownRight className="h-3.5 w-3.5" /> Remitted
                  </p>
                  <p className="mt-1 text-base font-bold text-ink-900">{rs(float.remitted)}</p>
                </div>
                <div className="rounded-xl bg-[#FFF3DF] px-3.5 py-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#8a5a00]">
                    <ArrowUpRight className="h-3.5 w-3.5" /> With shops
                  </p>
                  <p className="mt-1 text-base font-bold text-ink-900">{rs(float.outstanding)}</p>
                </div>
              </div>
            </div>
          </Card>
        </Reveal>

        <Reveal delay={0.1}>
          <Card className="h-full pb-5">
            <SectionTitle title="Where the money came in" hint="Collected value by method" />
            <div className="px-5 pt-5">
              <BarList rows={paymentRows} />
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between rounded-xl bg-ink-50 px-3.5 py-2.5">
                  <span className="flex items-center gap-1.5 text-sm text-ink-600">
                    <Receipt className="h-3.5 w-3.5 text-ink-400" /> Refunds · 30 days
                  </span>
                  <span className="text-sm font-bold text-ink-900">
                    {rs(FINANCE_SUMMARY.refunds30)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-ink-50 px-3.5 py-2.5">
                  <span className="flex items-center gap-1.5 text-sm text-ink-600">
                    <TicketPercent className="h-3.5 w-3.5 text-ink-400" /> Coupon spend · 30 days
                  </span>
                  <span className="text-sm font-bold text-ink-900">
                    {rs(FINANCE_SUMMARY.couponSpend30)}
                  </span>
                </div>
              </div>
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-crimson-50/70 px-3.5 py-3 text-xs text-crimson-800">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                A negative net means the shop owes GoPasal, because it already holds the cash the
                customer paid at the door.
              </p>
            </div>
          </Card>
        </Reveal>
      </div>

      <div className="mb-4 mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterPills<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "ALL", label: "All periods", count: counts.ALL },
            { value: "DUE", label: "Due", count: counts.DUE },
            { value: "PROCESSING", label: "Processing", count: counts.PROCESSING },
            { value: "HELD", label: "Held", count: counts.HELD },
            { value: "PAID", label: "Paid", count: counts.PAID },
          ]}
        />
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Shop name"
          icon={<Search className="h-4 w-4" />}
          className="w-full sm:w-72"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-6 w-6" />}
          title="No settlement in this view"
          description="Try another status, or search by shop name."
        />
      ) : (
        <Reveal>
          <TableWrap>
            <thead>
              <tr>
                <Th>Shop</Th>
                <Th>Period</Th>
                <Th className="text-right">Orders</Th>
                <Th className="text-right">Gross</Th>
                <Th className="text-right">Commission</Th>
                <Th className="text-right">Cash collected</Th>
                <Th className="text-right">Net</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const shop = shopFor(s.shopId);
                const owesUs = s.net < 0;
                return (
                  <tr key={s.id} className="transition hover:bg-ink-50">
                    <Td>
                      {shop ? (
                        <Link
                          href={`/shops/${shop.id}`}
                          className="flex items-center gap-2 font-semibold text-ink-900 hover:text-crimson-700"
                        >
                          <Store className="h-4 w-4 shrink-0 text-ink-400" />
                          <span className="truncate">{s.shopName}</span>
                        </Link>
                      ) : (
                        <span className="font-semibold text-ink-900">{s.shopName}</span>
                      )}
                      {s.note && <p className="mt-0.5 text-xs text-[#8f1c2a]">{s.note}</p>}
                    </Td>
                    <Td>
                      <span className="whitespace-nowrap">
                        {dayMonth(s.periodStart)} – {dayMonth(s.periodEnd)}
                      </span>
                      <span className="block text-xs text-ink-400">
                        {s.paidAt ? `Paid ${ago(s.paidAt, NOW)}` : `Ended ${ago(s.periodEnd, NOW)}`}
                      </span>
                    </Td>
                    <Td className="text-right">{num(s.orders)}</Td>
                    <Td className="text-right">{rs(s.gross)}</Td>
                    <Td className="text-right text-crimson-700">{rs(s.commission)}</Td>
                    <Td className="text-right">
                      {rs(s.codCollected)}
                      <span className="block text-xs text-ink-400">
                        {rs(s.onlineCollected)} online
                      </span>
                    </Td>
                    <Td className="text-right">
                      <span
                        className={
                          owesUs ? "font-bold text-[#c02636]" : "font-bold text-[#0B7E58]"
                        }
                      >
                        {owesUs ? `− ${rs(Math.abs(s.net))}` : `+ ${rs(s.net)}`}
                      </span>
                      <span className="block text-xs text-ink-400">
                        {owesUs ? "shop remits" : "we pay out"}
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge value={s.status} />
                      {s.paidAt && (
                        <span className="mt-0.5 block text-xs text-ink-400">
                          {fullDate(s.paidAt)}
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </Reveal>
      )}

      <p className="mt-6 text-xs text-ink-400">
        Settlements run weekly. A held payout is released the moment the linked fraud signal or
        dispute is closed — nothing is written off silently.
      </p>


    </>
  );
}

