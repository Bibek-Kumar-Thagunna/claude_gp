import * as React from "react";
import { FlatList, RefreshControl, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  useOrderTransitions,
  useSelectedShop,
  useShopOrderPages,
  useShopOrders,
  useShopRealtime,
  type OrderStatus,
  type ShopOrder,
} from "@gopasal/native-data/seller";
import {
  Button,
  Confirm,
  ConnectionBanner,
  Skeleton,
  Sunken,
  Text,
  Touchable,
  haptic,
  palette,
  theme,
  useT,
} from "@gopasal/native-ui";
import { InboxBell } from "../../components/InboxBell";
import { OrderCard } from "../../components/OrderCard";
import { RejectSheet } from "../../components/RejectSheet";

/**
 * The order queue — the screen this app exists for.
 *
 * It is grouped by **what the shopkeeper does next**, not by the status column.
 * Those are nearly the same list and not the same idea: *New* is work nobody has
 * answered, *Preparing* is work in your hands, *Ready* is work waiting on a
 * rider, *On the way* is work you can only watch. A shopkeeper glancing at this
 * from across the counter is asking "what needs me?", and the answer is the top
 * group, always, without reading a word.
 *
 * Three decisions carry the screen:
 *
 *  - **Accept is on the card.** The Accept button is where the order is, because
 *    the moment it is needed is the moment a customer is standing there. Reject
 *    is not, because it needs a reason the customer will read.
 *  - **New orders are oldest first.** Everywhere else newest-first is right; in
 *    the one group where somebody is waiting, the order that has waited longest
 *    is the one that needs answering, so the server's sort is reversed for that
 *    group alone.
 *  - **Finished orders are behind a tap.** They are not work. They are put in a
 *    collapsed section that does not even ask the server until it is opened.
 */

/** The working queue: everything that still needs a person. */
function legTroubled(order: ShopOrder): boolean {
  const leg = order.delivery?.status;
  return leg === "FAILED" || leg === "RETURNING_TO_SHOP" || leg === "RETURNED_TO_SHOP";
}

const WORKING: OrderStatus[] = ["PLACED", "ACCEPTED", "PACKED", "OUT_FOR_DELIVERY"];
/** Everything that does not. */
const FINISHED: OrderStatus[] = ["DELIVERED", "CANCELLED", "REJECTED"];

/** A phone's worth of counter. The API caps `limit` at 100. */
const QUEUE_LIMIT = 50;
const DONE_LIMIT = 20;

type Row =
  | { kind: "heading"; key: string; title: string; count: number }
  | { kind: "order"; key: string; order: ShopOrder; index: number; actionable: boolean };

export default function QueueTab() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { shopId, shop } = useSelectedShop();

  const [focused, setFocused] = React.useState(false);
  useFocusEffect(
    React.useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // The socket is the mechanism and the poll is the floor: `live` turns the poll
  // off, so a watched queue costs one request per change instead of four a
  // minute, and a queue whose socket never connected still moves.
  const realtime = useShopRealtime(shopId, focused);
  const working = useShopOrders(
    shopId,
    { status: WORKING, limit: QUEUE_LIMIT },
    { poll: focused, live: realtime.live },
  );

  const [doneOpen, setDoneOpen] = React.useState(false);
  // Passing `null` for the shop id is how this hook is asked not to run: there
  // is no `enabled` option, and a finished-orders page fetched on every visit to
  // the queue would be a request a shopkeeper pays for and never reads.
  const [doneText, setDoneText] = React.useState("");
  const [doneSearch, setDoneSearch] = React.useState("");
  React.useEffect(() => {
    const trimmed = doneText.trim();
    if (trimmed === doneSearch) return;
    const timer = setTimeout(() => setDoneSearch(trimmed), 300);
    return () => clearTimeout(timer);
  }, [doneText, doneSearch]);
  const doneQuery = React.useMemo(
    () => ({ status: FINISHED, limit: DONE_LIMIT, ...(doneSearch ? { q: doneSearch } : {}) }),
    [doneSearch],
  );
  const donePages = useShopOrderPages(doneOpen ? shopId : null, doneQuery);
  const done = donePages.first;

  // `lastOrderAt` is null until an order arrives *while this screen is
  // watching*, so every value it takes is a new order and there is no first-run
  // case to skip. The buzz is the whole point: the phone is face down on a
  // counter and the shopkeeper is serving somebody.
  React.useEffect(() => {
    if (!realtime.lastOrderAt) return;
    haptic("success");
  }, [realtime.lastOrderAt]);

  const transitions = useOrderTransitions(shopId);
  const [rejecting, setRejecting] = React.useState<ShopOrder | null>(null);
  const [confirming, setConfirming] = React.useState<{ order: ShopOrder; reason: string } | null>(
    null,
  );

  const orders = working.data?.data ?? [];
  const byStatus = (status: OrderStatus) => orders.filter((order) => order.status === status);

  const groups: { key: string; title: string; orders: ShopOrder[] }[] = [
    {
      key: "new",
      title: t("queue.new"),
      orders: [...byStatus("PLACED")].sort(
        (a, b) => Date.parse(a.placedAt) - Date.parse(b.placedAt),
      ),
    },
    { key: "preparing", title: t("queue.preparing"), orders: byStatus("ACCEPTED") },
    { key: "ready", title: t("queue.ready"), orders: byStatus("PACKED") },
    // A delivery that failed, or a parcel on its way back, is still
    // OUT_FOR_DELIVERY to the order — but it is the shop's problem now, not the
    // rider's, so it is lifted out of "On the way" where it would sit unnoticed.
    {
      key: "troubled",
      title: t("queue.troubled"),
      orders: byStatus("OUT_FOR_DELIVERY").filter((o) => legTroubled(o)),
    },
    {
      key: "onTheWay",
      title: t("queue.onTheWay"),
      orders: byStatus("OUT_FOR_DELIVERY").filter((o) => !legTroubled(o)),
    },
  ];

  const rows: Row[] = [];
  for (const group of groups) {
    if (group.orders.length === 0) continue;
    rows.push({
      kind: "heading",
      key: `h-${group.key}`,
      title: group.title,
      count: group.orders.length,
    });
    group.orders.forEach((order, index) => {
      rows.push({
        kind: "order",
        key: order.id,
        order,
        index,
        actionable: group.key === "new",
      });
    });
  }

  const open = (order: ShopOrder) =>
    router.push({ pathname: "/order/[id]", params: { id: order.id } });

  const accept = (order: ShopOrder) => transitions.mutate({ orderId: order.id, action: "accept" });

  const acceptingId =
    transitions.isPending && transitions.variables?.action === "accept"
      ? transitions.variables.orderId
      : null;

  // Tracked by hand rather than taken from `isFetching`, which is also true for
  // every background poll — a spinner that drops down by itself every fifteen
  // seconds teaches a shopkeeper that the screen is doing something when it is
  // not. This one appears only because a thumb pulled it.
  const [pulling, setPulling] = React.useState(false);
  const pull = React.useCallback(() => {
    setPulling(true);
    void Promise.all([
      working.refetch(),
      doneOpen ? donePages.refetch() : Promise.resolve(),
    ]).finally(() => setPulling(false));
  }, [working, donePages, doneOpen]);

  const closed = shop != null && !shop.isOpen;

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      <View
        style={{
          paddingTop: insets.top + theme.spacing[3],
          paddingBottom: theme.spacing[3],
          paddingHorizontal: theme.spacing[4],
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
        }}
      >
        <Text variant="title1" style={{ flex: 1 }} numberOfLines={1}>
          {t("queue.title")}
        </Text>
        {realtime.live && <LiveDot />}
        <InboxBell focused={focused} />
      </View>

      {/* The rollback the transition hook performs is silent, so the card simply
          reappears where it was. Without this strip that reads as the tap not
          having registered, and the shopkeeper taps again. */}
      {transitions.isError && (
        <Animated.View
          entering={FadeIn.duration(180)}
          style={{ paddingHorizontal: theme.spacing[4], paddingBottom: theme.spacing[3] }}
        >
          <Sunken style={{ backgroundColor: theme.color.dangerSoft }}>
            <Text variant="footnote" color="danger">
              {transitions.error instanceof Error
                ? transitions.error.message
                : t("common.somethingWrong")}
            </Text>
          </Sunken>
        </Animated.View>
      )}

      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing[4],
          paddingBottom: theme.spacing[10],
          gap: theme.spacing[3],
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            onRefresh={pull}
            tintColor={theme.color.brand}
            colors={[palette.crimson[500]]}
          />
        }
        renderItem={({ item }) =>
          item.kind === "heading" ? (
            <Text variant="overline" color="textFaint" style={{ marginTop: theme.spacing[2] }}>
              {`${item.title.toUpperCase()} · ${item.count}`}
            </Text>
          ) : (
            <OrderCard
              order={item.order}
              index={item.index}
              onOpen={() => open(item.order)}
              onAccept={item.actionable ? () => accept(item.order) : undefined}
              onReject={item.actionable ? () => setRejecting(item.order) : undefined}
              accepting={acceptingId === item.order.id}
            />
          )
        }
        ListEmptyComponent={
          working.isLoading ? (
            <View style={{ gap: theme.spacing[3] }}>
              {[0, 1, 2].map((i) => (
                <Skeleton
                  key={i}
                  width="100%"
                  height={128}
                  radius={theme.radii.lg}
                  delay={i * 90}
                />
              ))}
            </View>
          ) : (
            <Empty closed={closed} />
          )
        }
        ListFooterComponent={
          <DoneSection
            open={doneOpen}
            onToggle={() => setDoneOpen((current) => !current)}
            loading={done.isLoading}
            orders={donePages.rows}
            onOpen={open}
            search={doneText}
            onSearch={setDoneText}
            hasMore={donePages.hasMore}
            loadingMore={donePages.loadingMore}
            onMore={donePages.loadMore}
            total={donePages.total}
          />
        }
      />

      <RejectSheet
        visible={rejecting !== null}
        mode="reject"
        onClose={() => setRejecting(null)}
        onSubmit={(reason) => {
          const order = rejecting;
          setRejecting(null);
          if (order) setConfirming({ order, reason });
        }}
      />

      <Confirm
        visible={confirming !== null}
        title={t("order.reject.confirm")}
        message={t("order.reject.detail")}
        confirmLabel={t("order.reject")}
        cancelLabel={t("common.notNow")}
        destructive
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) {
            transitions.mutate({
              orderId: confirming.order.id,
              action: "reject",
              reason: confirming.reason,
            });
          }
          // Closed immediately rather than held on `busy`: the hook is
          // optimistic, so the card is already gone from the New group before
          // this dialog has finished fading out.
          setConfirming(null);
        }}
      />
    </View>
  );
}

/** The one piece of chrome that says the queue is being pushed, not polled. */
function LiveDot() {
  const t = useT();
  return (
    <View
      accessibilityLabel={t("queue.live")}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[2],
        paddingHorizontal: theme.spacing[3],
        height: 26,
        borderRadius: theme.radii.full,
        backgroundColor: theme.color.successSoft,
      }}
    >
      <View
        style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.color.success }}
      />
      <Text variant="overline" style={{ color: theme.color.success }}>
        {t("queue.live").toUpperCase()}
      </Text>
    </View>
  );
}

/**
 * Nothing waiting, and why.
 *
 * The two cases are not the same news. An empty queue on an open shop is a quiet
 * afternoon; an empty queue on a closed shop is the app explaining that no order
 * *can* arrive, which is something the shopkeeper can fix in two taps on the
 * Shop tab and would otherwise sit waiting for all morning.
 */
function Empty({ closed }: { closed: boolean }) {
  const t = useT();
  return (
    <Animated.View
      entering={FadeIn.duration(280)}
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: theme.spacing[6],
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: theme.radii["2xl"],
          backgroundColor: closed ? theme.color.warningSoft : theme.color.surfaceSunken,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons
          name={closed ? "lock-closed-outline" : "receipt-outline"}
          size={28}
          color={closed ? theme.color.warning : theme.color.textFaint}
        />
      </View>
      <Text variant="title3" style={{ marginTop: theme.spacing[4] }}>
        {closed ? t("shop.closed") : t("queue.empty.title")}
      </Text>
      <Text
        variant="footnote"
        color="textMuted"
        align="center"
        style={{ marginTop: theme.spacing[2], maxWidth: 280 }}
      >
        {closed ? t("queue.empty.closed") : t("queue.empty.detail")}
      </Text>
    </Animated.View>
  );
}

/**
 * Finished orders, collapsed — searchable by code or customer, and readable to
 * the end with "Show more", so last week's order a customer is phoning about
 * can be found on the phone.
 *
 * No count on the header. The summary the API sends beside every page counts
 * *every* delivered and closed order the shop has ever had, and putting that
 * number above a list of the last twenty would be a header disagreeing with the
 * list under it.
 */
function DoneSection({
  open,
  onToggle,
  loading,
  orders,
  onOpen,
  search,
  onSearch,
  hasMore,
  loadingMore,
  onMore,
  total,
}: {
  open: boolean;
  onToggle: () => void;
  loading: boolean;
  orders: ShopOrder[];
  onOpen: (order: ShopOrder) => void;
  search: string;
  onSearch: (next: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  total: number;
}) {
  const t = useT();
  return (
    <View style={{ marginTop: theme.spacing[5], gap: theme.spacing[3] }}>
      <Touchable
        haptic="selection"
        onPress={onToggle}
        accessibilityLabel={t("queue.done")}
        accessibilityState={{ expanded: open }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[2],
          paddingVertical: theme.spacing[2],
        }}
      >
        <Text variant="overline" color="textFaint" style={{ flex: 1 }}>
          {t("queue.done").toUpperCase()}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={theme.color.textFaint}
        />
      </Touchable>

      {open ? (
        <TextInput
          value={search}
          onChangeText={onSearch}
          placeholder={t("queue.done.search")}
          placeholderTextColor={theme.color.textFaint}
          accessibilityLabel={t("queue.done.search")}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            height: 44,
            paddingHorizontal: theme.spacing[3],
            borderRadius: theme.radii.md,
            backgroundColor: theme.color.surfaceSunken,
            color: theme.color.text,
            fontSize: theme.type.callout.fontSize,
          }}
        />
      ) : null}

      {open &&
        (loading ? (
          <View style={{ gap: theme.spacing[3] }}>
            {[0, 1].map((i) => (
              <Skeleton key={i} width="100%" height={96} radius={theme.radii.lg} delay={i * 90} />
            ))}
          </View>
        ) : orders.length === 0 ? (
          <Text variant="footnote" color="textMuted">
            {t("queue.done.empty")}
          </Text>
        ) : (
          <>
            {orders.map((order, index) => (
              <OrderCard key={order.id} order={order} index={index} onOpen={() => onOpen(order)} />
            ))}
            {hasMore ? (
              <Button
                label={t("list.showMore", { shown: orders.length, total })}
                variant="secondary"
                loading={loadingMore}
                onPress={onMore}
              />
            ) : null}
          </>
        ))}
    </View>
  );
}
