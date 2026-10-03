import * as React from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  ANALYTICS_PERIODS,
  useSelectedShop,
  useShopAnalytics,
  useShopFinance,
  type AnalyticsPeriod,
  type ShopAnalytics,
  type ShopFinance,
} from "@gopasal/native-data/seller";
import {
  Button,
  Card,
  ConnectionBanner,
  Price,
  Skeleton,
  Sunken,
  Text,
  Touchable,
  theme,
  useT,
} from "@gopasal/native-ui";
import { MoneySettlementRow } from "../../components/MoneySettlementRow";
import { MoneySparkline } from "../../components/MoneySparkline";
import { MoneyStat } from "../../components/MoneyStat";

/**
 * The money screen.
 *
 * A shopkeeper opens this to answer one question — **am I owed, or do I owe?** —
 * and the whole layout is that question answered twice, because the two halves
 * of it pull in opposite directions and a shop that confuses them ends a month
 * short:
 *
 *  - **Coming to you** is `summary.onlineReady`: the shop's share of online
 *    money GoPasal has released and not yet settled. It is not in the till.
 *  - **Cash you owe GoPasal** is `summary.codCommissionDue`: GoPasal's share of
 *    cash the shop already took at the door and spent the afternoon standing
 *    next to. It feels like income and it is a debt.
 *
 * They are drawn as two separate blocks in two different colours, with the words
 * "comes to you" and "you owe" on them, rather than as a single net figure. A
 * net number is arithmetic the app would be doing on the shopkeeper's behalf and
 * hiding the workings of; the open settlement strip underneath says which way
 * the *next* settlement runs, and that is the only netting the API actually
 * stands behind (`openSettlementAmount`, signed).
 *
 * ## Nothing on this screen is money counted
 *
 * `payments.codCollected` is the loaded word on the wire: the data layer calls
 * it "value of *delivered* COD orders — cash due, not cash counted", and it is
 * the **whole order value**, not the shop's share. Rendered as "Sales" or
 * "Earnings" it would read as takings; it is labelled as cash that passed
 * through the shop's hands, with the sentence that says whose share of it is
 * whose. The same caution governs `summary.sales`, which is delivered money
 * before any commission.
 *
 * ## Why the periods are not "today / this week / this month"
 *
 * `ANALYTICS_PERIODS` is `7d`, `30d`, `90d` — rolling windows the API computes
 * against Nepal days, and a fourth value is a 400. There is no "today" to
 * offer, and calling a rolling seven days "this week" would put a claim on the
 * screen the numbers underneath do not support, so the chips say how many days
 * and the line beneath them names the two dates the window actually runs
 * between. The dictionary's `money.today` / `money.week` / `money.month` are
 * left unused for exactly that reason.
 */

/** How many of `topProducts` a counter can act on at a glance. */
const TOP_ITEMS = 5;

/** Settlements a shopkeeper might still be checking against their own book. */
const SETTLEMENTS_SHOWN = 6;

const PERIOD_LABEL: Record<AnalyticsPeriod, { key: string; en: string }> = {
  "7d": { key: "money.period.7d", en: "7 days" },
  "30d": { key: "money.period.30d", en: "30 days" },
  "90d": { key: "money.period.90d", en: "90 days" },
};

function clock(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleDateString([], { day: "numeric", month: "short" });
}

export default function MoneyScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { shopId, ready } = useSelectedShop();

  const [period, setPeriod] = React.useState<AnalyticsPeriod>("7d");

  const finance = useShopFinance(shopId);
  const analytics = useShopAnalytics(shopId, period);

  const refresh = React.useCallback(() => {
    void finance.refetch();
    void analytics.refetch();
  }, [finance, analytics]);

  const loading = (finance.isLoading || analytics.isLoading) && ready;
  const refreshing =
    (finance.isFetching && !finance.isLoading) || (analytics.isFetching && !analytics.isLoading);

  const unreachable = !finance.data && !analytics.data && Boolean(finance.error || analytics.error);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing[3],
          paddingHorizontal: theme.spacing[4],
          paddingBottom: theme.spacing[10] + insets.bottom,
          gap: theme.spacing[4],
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={theme.color.brand}
          />
        }
      >
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: theme.spacing[2] }}>
          <Text variant="title2" style={{ flex: 1 }}>
            {t("money.title")}
          </Text>
          {/* The API stamps when it computed these, and a figure about money is
              worth dating: a shopkeeper comparing this with their own book
              needs to know which minute it is a picture of. */}
          {finance.data ? (
            <Text variant="caption" color="textFaint">
              {t("money.asOf", { time: clock(finance.data.generatedAt) })}
            </Text>
          ) : null}
        </View>

        {!ready || loading ? (
          <LoadingBody />
        ) : !shopId ? (
          <NoShop />
        ) : unreachable ? (
          <Unreachable onRetry={refresh} />
        ) : (
          <>
            {/* The two halves fail separately, and a money screen that quietly
                drew one of them is worse than one that says a figure is
                missing: a shopkeeper reading "coming to you" with nothing
                beside it would conclude they owe nothing. */}
            {finance.data ? (
              <Balances finance={finance.data} />
            ) : (
              <Missing onRetry={() => void finance.refetch()} />
            )}

            <Card index={2}>
              <PeriodChips period={period} onChange={setPeriod} />
              {analytics.data ? (
                <Performance data={analytics.data} />
              ) : analytics.error ? (
                <View style={{ marginTop: theme.spacing[4] }}>
                  <Missing onRetry={() => void analytics.refetch()} />
                </View>
              ) : (
                <View style={{ gap: theme.spacing[3], marginTop: theme.spacing[4] }}>
                  <Skeleton width="100%" height={46} radius={theme.radii.md} />
                  <Skeleton width="100%" height={76} radius={theme.radii.md} delay={80} />
                </View>
              )}
            </Card>

            {analytics.data ? <TopItems data={analytics.data} /> : null}
            {finance.data ? <Settlements finance={finance.data} /> : null}
            {finance.data && finance.data.refunds.length > 0 ? (
              <Refunds finance={finance.data} />
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/* ── what is owed, in both directions ─────────────────────────────────────── */

function Balances({ finance }: { finance: ShopFinance }) {
  const t = useT();
  const { onlineReady, escrowHeld, escrowOrders, codCommissionDue, openSettlementAmount } =
    finance.summary;

  return (
    <View style={{ gap: theme.spacing[3] }}>
      <Card
        index={0}
        style={{ backgroundColor: theme.color.brandSoft, borderColor: theme.color.brandBorder }}
      >
        <View
          accessible
          accessibilityLabel={t("money.a11y.pending", { amount: Math.round(onlineReady) })}
          style={{ gap: 2 }}
        >
          <Text variant="caption" color="textSecondary">
            {t("money.pending")}
          </Text>
          <Price value={onlineReady} variant="display" color="brand" />
          {/* Said plainly and immediately under the biggest number on the
              screen: this is money GoPasal is holding, not money in the till,
              and the difference is a whole afternoon's misunderstanding. */}
          <Text variant="caption" color="textSecondary">
            {t("money.pendingNote")}
          </Text>
        </View>

        {escrowHeld > 0 ? (
          <Sunken style={{ marginTop: theme.spacing[3], backgroundColor: theme.color.surface }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="caption" color="textSecondary">
                  {t("money.escrow")}
                </Text>
                <Text variant="caption" color="textFaint">
                  {t("money.escrowNote", { count: escrowOrders })}
                </Text>
              </View>
              <Price value={escrowHeld} variant="callout" color="textSecondary" />
            </View>
          </Sunken>
        ) : null}
      </Card>

      {/* The debt gets its own card rather than a line inside the one above.
          A figure that has to be read as the opposite of the figure over it
          cannot share its background. */}
      <Card
        index={1}
        style={{ backgroundColor: theme.color.warningSoft, borderColor: theme.color.accentSoft }}
      >
        <View
          accessible
          accessibilityLabel={t("money.a11y.codDue", { amount: Math.round(codCommissionDue) })}
          style={{ gap: 2 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
            <Ionicons name="alert-circle" size={15} color={theme.color.warning} />
            <Text variant="caption" color="textSecondary" style={{ flex: 1, minWidth: 0 }}>
              {t("money.codDue")}
            </Text>
          </View>
          <Price value={codCommissionDue} variant="title1" />
          <Text variant="caption" color="textSecondary">
            {t("money.codNote")}
          </Text>
        </View>
      </Card>

      <OpenSettlement amount={openSettlementAmount} />
    </View>
  );
}

/**
 * The next settlement, and which way it runs.
 *
 * This is the one place the two directions above are allowed to be netted,
 * because the netting is the API's: `openSettlementAmount` is signed, payouts
 * positive and collections negative, and the sign is a fact about a settlement
 * row rather than arithmetic this screen invented.
 */
function OpenSettlement({ amount }: { amount: number }) {
  const t = useT();

  if (amount === 0) {
    return (
      <Text variant="caption" color="textFaint" align="center">
        {t("money.openNone")}
      </Text>
    );
  }

  const toSeller = amount > 0;
  return (
    <Sunken>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
        <Ionicons
          name={toSeller ? "arrow-down-circle-outline" : "arrow-up-circle-outline"}
          size={19}
          color={theme.color.textMuted}
        />
        <Text variant="caption" color="textSecondary" style={{ flex: 1, minWidth: 0 }}>
          {toSeller ? t("money.openPayout") : t("money.openCollection")}
        </Text>
        <Price value={Math.abs(amount)} variant="callout" />
      </View>
    </Sunken>
  );
}

/* ── the period ───────────────────────────────────────────────────────────── */

function PeriodChips({
  period,
  onChange,
}: {
  period: AnalyticsPeriod;
  onChange: (next: AnalyticsPeriod) => void;
}) {
  const t = useT();
  return (
    <View style={{ flexDirection: "row", gap: theme.spacing[2] }}>
      {ANALYTICS_PERIODS.map((value) => {
        const selected = value === period;
        const label = t(PERIOD_LABEL[value].key);
        return (
          <Touchable
            key={value}
            haptic="selection"
            onPress={() => onChange(value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
            style={{
              flex: 1,
              height: 34,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: theme.radii.full,
              borderWidth: 1,
              backgroundColor: selected ? theme.color.brand : theme.color.surface,
              borderColor: selected ? theme.color.brand : theme.color.border,
            }}
          >
            <Text variant="caption" color={selected ? "onBrand" : "textSecondary"}>
              {label}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
}

function Performance({ data }: { data: ShopAnalytics }) {
  const t = useT();
  const { summary, comparison, payments } = data;
  const nothing = summary.sales <= 0 && summary.ordersDelivered === 0;

  return (
    <View style={{ gap: theme.spacing[4], marginTop: theme.spacing[4] }}>
      <Text variant="caption" color="textFaint">
        {t("money.window", { from: shortDate(data.window.from), to: shortDate(data.window.to) })}
      </Text>

      {nothing ? (
        <View
          style={{ alignItems: "center", paddingVertical: theme.spacing[5], gap: theme.spacing[2] }}
        >
          <Ionicons name="cash-outline" size={26} color={theme.color.textFaint} />
          <Text variant="callout" color="textMuted" align="center">
            {t("money.noSales")}
          </Text>
        </View>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: theme.spacing[3] }}>
            <MoneyStat
              label={t("money.sales")}
              value={<Price value={summary.sales} variant="title3" />}
              change={comparison.salesChangePercent}
              a11yValue={t("money.a11y.rupees", { amount: Math.round(summary.sales) })}
            />
            {/* "Delivered", not the dictionary's plain "Orders": all three
                figures in this row are about delivered orders — sales is
                delivered money and the average is one divided by the other —
                and a bare "Orders" beside them would be read as everything
                that came in, including what was rejected. */}
            <MoneyStat
              label={t("money.delivered")}
              value={
                <Text variant="title3" tabular>
                  {summary.ordersDelivered}
                </Text>
              }
              change={comparison.ordersChangePercent}
            />
            <MoneyStat
              label={t("money.average")}
              value={
                // Null is not zero: the API returns null when nothing was
                // delivered, and a रु 0 average order is a claim about a shop
                // that had no orders to average.
                summary.averageOrderValue == null ? (
                  <Text variant="title3" color="textFaint">
                    —
                  </Text>
                ) : (
                  <Price value={summary.averageOrderValue} variant="title3" />
                )
              }
              change={comparison.averageOrderValueChangePercent}
            />
          </View>

          <MoneySparkline series={data.salesSeries} />

          <View style={{ gap: theme.spacing[2] }}>
            <Sunken>
              <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="caption" color="textSecondary">
                    {t("money.cashAtDoor")}
                  </Text>
                  {/* The single most misreadable number on the wire, said in
                      full: it is the whole order value on delivered cash
                      orders, not the shop's share of it. */}
                  <Text variant="caption" color="textFaint">
                    {t("money.cashAtDoorNote", { count: payments.codOrders })}
                  </Text>
                </View>
                <Price value={payments.codCollected} variant="callout" color="textSecondary" />
              </View>
            </Sunken>

            <Sunken>
              <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
                <Text variant="caption" color="textSecondary" style={{ flex: 1, minWidth: 0 }}>
                  {t("money.onlineOrders")}
                </Text>
                {/* Orders, not rupees. The wire carries a count of online
                    orders and how many of them were delivered, and no value —
                    so the row says how many, and says how many landed. A
                    figure with रु in front of it here would be invented. */}
                <Text variant="caption" color="textSecondary" tabular>
                  {t("money.onlineDelivered", {
                    delivered: payments.onlineDelivered,
                    total: payments.onlineOrders,
                  })}
                </Text>
              </View>
            </Sunken>
          </View>
        </>
      )}
    </View>
  );
}

/* ── what is selling ──────────────────────────────────────────────────────── */

function TopItems({ data }: { data: ShopAnalytics }) {
  const t = useT();
  const items = data.topProducts.slice(0, TOP_ITEMS);

  return (
    <Card index={3}>
      <Text variant="title3">{t("money.topItems")}</Text>

      {items.length === 0 ? (
        <Text variant="footnote" color="textMuted" style={{ marginTop: theme.spacing[3] }}>
          {t("money.noSales")}
        </Text>
      ) : (
        <>
          <View style={{ gap: theme.spacing[3], marginTop: theme.spacing[4] }}>
            {items.map((item, index) => (
              <View
                key={item.productId ?? `${item.name}-${index}`}
                style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}
              >
                <Text variant="caption" color="textFaint" tabular style={{ width: 14 }}>
                  {index + 1}
                </Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="callout" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text variant="caption" color="textFaint" tabular>
                    {t("money.unitsSold", { count: item.unitsSold })}
                  </Text>
                </View>
                <Price value={item.revenue} variant="callout" color="textSecondary" />
              </View>
            ))}
          </View>

          {/* The data layer is explicit that these do not add up to the sales
              figure above — no delivery fee, and before any order-level coupon,
              which cannot honestly be split across lines. Said here so nobody
              tries to reconcile the two and concludes the app lost money. */}
          <Text variant="caption" color="textFaint" style={{ marginTop: theme.spacing[4] }}>
            {t("money.topItems.note")}
          </Text>
        </>
      )}
    </Card>
  );
}

/* ── payouts ──────────────────────────────────────────────────────────────── */

function Settlements({ finance }: { finance: ShopFinance }) {
  const t = useT();
  const rows = finance.settlements.slice(0, SETTLEMENTS_SHOWN);

  return (
    <Card index={4}>
      <Text variant="title3">{t("money.settlements")}</Text>

      {rows.length === 0 ? (
        <Text variant="footnote" color="textMuted" style={{ marginTop: theme.spacing[3] }}>
          {t("money.settlements.empty")}
        </Text>
      ) : (
        <View style={{ gap: theme.spacing[2], marginTop: theme.spacing[4] }}>
          {rows.map((settlement) => (
            <MoneySettlementRow key={settlement.id} settlement={settlement} />
          ))}
          {finance.settlements.length > rows.length ? (
            <Text
              variant="caption"
              color="textFaint"
              align="center"
              style={{ marginTop: theme.spacing[2] }}
            >
              {t("money.settlements.more", { count: finance.settlements.length - rows.length })}
            </Text>
          ) : null}
        </View>
      )}
    </Card>
  );
}

function Refunds({ finance }: { finance: ShopFinance }) {
  const t = useT();
  return (
    <Card index={5}>
      <Text variant="title3">{t("money.refunds")}</Text>
      <View style={{ gap: theme.spacing[3], marginTop: theme.spacing[4] }}>
        {finance.refunds.map((refund) => (
          <View
            key={refund.id}
            style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="callout" numberOfLines={1}>
                {t("order.title", { code: refund.order.code })}
              </Text>
              <Text variant="caption" color="textFaint" numberOfLines={1}>
                {refund.reason}
              </Text>
            </View>
            <Price value={refund.amount} variant="callout" color="textSecondary" />
          </View>
        ))}
      </View>
    </Card>
  );
}

/* ── the states before there are numbers ──────────────────────────────────── */

function LoadingBody() {
  return (
    <View style={{ gap: theme.spacing[3] }}>
      <Skeleton width="100%" height={132} radius={theme.radii.lg} />
      <Skeleton width="100%" height={104} radius={theme.radii.lg} delay={90} />
      <Skeleton width="100%" height={180} radius={theme.radii.lg} delay={160} />
    </View>
  );
}

/** One half of the screen could not be fetched. Said, not hidden. */
function Missing({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <Sunken>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
        <Text variant="caption" color="textMuted" style={{ flex: 1, minWidth: 0 }}>
          {t("money.unavailable")}
        </Text>
        <Button
          label={t("common.retry")}
          variant="secondary"
          size="sm"
          full={false}
          onPress={onRetry}
        />
      </View>
    </Sunken>
  );
}

function NoShop() {
  const t = useT();
  return (
    <View style={{ alignItems: "center", paddingTop: theme.spacing[10], gap: theme.spacing[2] }}>
      <Ionicons name="storefront-outline" size={30} color={theme.color.textFaint} />
      <Text variant="title3" align="center">
        {t("shop.choose.title")}
      </Text>
      <Text variant="footnote" color="textMuted" align="center">
        {t("shop.choose.detail")}
      </Text>
    </View>
  );
}

function Unreachable({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <View style={{ alignItems: "center", paddingTop: theme.spacing[10], gap: theme.spacing[4] }}>
      <Text variant="callout" color="textMuted" align="center">
        {t("common.somethingWrong")}
      </Text>
      <Button label={t("common.retry")} variant="secondary" full={false} onPress={onRetry} />
    </View>
  );
}
