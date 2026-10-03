import * as React from "react";
import { Linking, ScrollView, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  useOrderTransitions,
  useRiderAssignment,
  useSelectedShop,
  useShopOrder,
  useShopRealtime,
  useShopRiders,
  type OrderItem,
  type OrderTransition,
  type ShopOrderDetail,
} from "@gopasal/native-data/seller";
import {
  orderActions,
  useDeliveryStatus,
  type DeliveryStatus,
  type DeliveryTransition,
  type OrderActions,
} from "@gopasal/native-data/seller-delivery";
import { useShopPermissions } from "@gopasal/native-data/seller-team";
import {
  Button,
  Card,
  Confirm,
  ConnectionBanner,
  Price,
  Skeleton,
  Sunken,
  Text,
  Touchable,
  theme,
  useT,
} from "@gopasal/native-ui";
import { statusWord, useMinutesSince } from "../../components/OrderCard";
import { longAgo } from "../../lib/waiting";
import { RejectSheet } from "../../components/RejectSheet";
import { RiderPicker } from "../../components/RiderPicker";
import {
  LegCard,
  LegSheet,
  legActionLabel,
  legWord,
  type LegSheetMode,
} from "../../components/OrderLeg";

/**
 * One order, in full, with every action that is legal on it and none that is not.
 *
 * The screen is built around a single claim: a shopkeeper standing here should
 * be able to fill the bag without asking anybody anything. That means the
 * variant names as they were sold, the quantities, the customer's own note, the
 * address the rider is going to, and — the one that costs money when it is
 * missed — whether cash has to come back through the door and how much.
 *
 * **The actions are the status, not a menu.** `OrdersService` allows exactly one
 * step forward from each state and refuses the rest with a 400, so offering
 * "Packed" on an order nobody has accepted would be offering a button whose only
 * outcome is an error message. Which buttons exist is decided by `orderActions`
 * — the same rules the web console uses — and then by the person's role.
 *
 * **It does not stop at the door.** After dispatch the delivery leg walks on
 * its own (picked up, on the way, delivered), and a shop that delivers itself
 * walks it from here: the handover with its note and the cash, a delivery that
 * failed, a parcel coming back and the shop confirming what state it came back
 * in, and then another rider or a cancellation.
 */

/** Whole NPR. There is no `lineTotal` on the wire; `price` is the unit price. */
function lineTotal(item: OrderItem): number {
  return item.price * item.qty;
}

/**
 * Digits the way `Price` writes them.
 *
 * `order.collect` carries its own रु, so the number is formatted rather than
 * rendered — same grouping, same Western digits, so a total drawn by `Price` and
 * a sentence about cash never disagree on the page.
 */
function rupees(amount: number): string {
  return Math.round(amount).toLocaleString("en-IN");
}

export default function OrderScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { shopId } = useSelectedShop();

  const [focused, setFocused] = React.useState(false);
  useFocusEffect(
    React.useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // The socket invalidates this order as well as the queue, which is the case it
  // exists for: two people on one counter, and the other one just packed it.
  const realtime = useShopRealtime(shopId, focused);
  const order = useShopOrder(shopId, id);
  const data = order.data;

  const transitions = useOrderTransitions(shopId);
  const assignment = useRiderAssignment(shopId);
  const legStatus = useDeliveryStatus(shopId);
  const permissions = useShopPermissions(shopId);
  const can = (key: string) => !permissions.ready || permissions.owner || permissions.has(key);

  const acts = data ? orderActions(data.status, data.delivery) : null;
  const leg = data?.delivery ?? null;
  // The picker is for choosing who takes it: before it leaves, and again after
  // a failed or returned delivery. An order already on its way with a rider
  // shows that rider instead, with "Change rider" while the leg allows it.
  const choosingRider =
    Boolean(acts?.assignRider) &&
    can("delivery.assign") &&
    (data?.status === "ACCEPTED" ||
      data?.status === "PACKED" ||
      leg?.status === "UNASSIGNED" ||
      leg?.status === "FAILED" ||
      leg?.status === "RETURNED_TO_SHOP");
  // Asked for only while a rider can be chosen — passing null is how this hook
  // is told not to run, and a roster fetched on every order a shopkeeper opens
  // is a request that answers a question nobody asked.
  const riders = useShopRiders(choosingRider ? shopId : null);
  const [legSheet, setLegSheet] = React.useState<LegSheetMode | null>(null);
  const moveLeg = (transition: DeliveryTransition) => {
    if (!data) return;
    setLegSheet(null);
    legStatus.mutate({ orderId: data.id, transition });
  };
  const stepLeg = (next: DeliveryStatus) => {
    if (next === "DELIVERED") setLegSheet("deliver");
    else if (next === "RETURNED_TO_SHOP") setLegSheet("return");
    else if (next === "PICKED_UP" || next === "EN_ROUTE" || next === "RETURNING_TO_SHOP")
      moveLeg({ status: next });
  };

  const [sheet, setSheet] = React.useState<"reject" | "cancel" | null>(null);
  const [confirming, setConfirming] = React.useState<{
    mode: "reject" | "cancel";
    reason: string;
  } | null>(null);

  const assignedRiderId = data?.delivery?.riderId ?? null;
  // Which transition is in flight, not merely *that* one is: a cancel waiting on
  // the server must not put a spinner on the Packed button beside it.
  const pending = transitions.isPending ? (transitions.variables?.action ?? null) : null;

  const commit = () => {
    if (!confirming || !data) return;
    transitions.mutate(
      confirming.mode === "reject"
        ? { orderId: data.id, action: "reject", reason: confirming.reason }
        : { orderId: data.id, action: "cancel", reason: confirming.reason },
    );
    // Closed rather than held busy: the hook patches the status straight away,
    // so the bar below has already changed by the time the dialog fades.
    setConfirming(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      <View
        style={{
          paddingTop: insets.top + theme.spacing[2],
          paddingBottom: theme.spacing[3],
          paddingHorizontal: theme.spacing[4],
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
        }}
      >
        <Touchable
          haptic="light"
          onPress={() => router.back()}
          accessibilityLabel={t("common.back")}
          style={{
            width: 40,
            height: 40,
            borderRadius: theme.radii.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.color.surface,
            borderWidth: 1,
            borderColor: theme.color.border,
          }}
        >
          <Ionicons name="chevron-back" size={20} color={theme.color.text} />
        </Touchable>
        <Text variant="title3" style={{ flex: 1 }} numberOfLines={1}>
          {data ? t("order.title", { code: data.code }) : t("ui.loading")}
        </Text>
        {realtime.live && (
          <View
            accessibilityLabel={t("queue.live")}
            style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.color.success }}
          />
        )}
      </View>

      {!data ? (
        <View style={{ paddingHorizontal: theme.spacing[4], gap: theme.spacing[3] }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width="100%" height={110} radius={theme.radii.lg} delay={i * 90} />
          ))}
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: theme.spacing[4],
              paddingBottom: theme.spacing[10],
              gap: theme.spacing[4],
            }}
            showsVerticalScrollIndicator={false}
          >
            <StatusStrip order={data} />
            <Items order={data} />
            <Payment order={data} />

            {data.note ? (
              // The note is the one part of an order the shop cannot infer from
              // the lines, and it is routinely where "no onions" lives — so it
              // gets its own block rather than a line inside the items card.
              <Card
                style={{ borderColor: theme.color.accent, backgroundColor: theme.color.accentSoft }}
              >
                <Text variant="overline" color="textMuted">
                  {t("order.note")}
                </Text>
                <Text variant="body" style={{ marginTop: theme.spacing[2] }}>
                  {data.note}
                </Text>
              </Card>
            ) : null}

            <Card>
              <Text variant="overline" color="textMuted">
                {t("order.deliverTo")}
              </Text>
              <Text variant="callout" style={{ marginTop: theme.spacing[2] }}>
                {data.fullAddress}
              </Text>
              <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                {[data.area, data.landmark].filter(Boolean).join(" · ")}
              </Text>
            </Card>

            <Customer order={data} />

            {(choosingRider || data.status === "OUT_FOR_DELIVERY") && (
              <Card>
                <Text variant="overline" color="textMuted">
                  {leg?.status === "FAILED" || leg?.status === "RETURNED_TO_SHOP"
                    ? t("leg.rider.again")
                    : t("order.rider")}
                </Text>
                {choosingRider ? (
                  <View style={{ marginTop: theme.spacing[3], gap: theme.spacing[3] }}>
                    <RiderPicker
                      riders={riders.data ?? []}
                      loading={riders.isLoading}
                      assignedRiderId={assignedRiderId}
                      busy={assignment.assign.isPending}
                      onPick={(riderId) => assignment.assign.mutate({ orderId: data.id, riderId })}
                    />
                    {/* Unassigning is legal only while the leg is still
                        ASSIGNED; once the rider has picked up, the order has
                        left the shop and this would be a 400. */}
                    {assignedRiderId && acts?.unassignRider && (
                      <Touchable
                        haptic="light"
                        onPress={() => assignment.unassign.mutate(data.id)}
                        disabled={assignment.unassign.isPending}
                        accessibilityLabel={t("order.changeRider")}
                        style={{ alignSelf: "flex-start", paddingVertical: theme.spacing[2] }}
                      >
                        <Text variant="caption" color="brand">
                          {t("order.changeRider")}
                        </Text>
                      </Touchable>
                    )}
                  </View>
                ) : (
                  <OnTheRoad order={data} />
                )}
              </Card>
            )}

            {leg && shopId && showLeg(data.status, leg.status) ? (
              <LegCard
                shopId={shopId}
                orderId={data.id}
                leg={leg}
                cod={data.paymentMethod === "COD"}
              />
            ) : null}
          </ScrollView>

          <ActionBar
            order={data}
            acts={acts!}
            can={can}
            legBusy={legStatus.isPending}
            onLeg={stepLeg}
            onFail={() => setLegSheet("fail")}
            pending={pending}
            hasRider={assignedRiderId !== null}
            onAccept={() => transitions.mutate({ orderId: data.id, action: "accept" })}
            onPack={() => transitions.mutate({ orderId: data.id, action: "pack" })}
            onDispatch={() => transitions.mutate({ orderId: data.id, action: "dispatch" })}
            onReject={() => setSheet("reject")}
            onCancel={() => setSheet("cancel")}
            error={transitions.error ?? assignment.assign.error ?? legStatus.error}
          />
        </>
      )}

      <LegSheet
        mode={legSheet}
        cod={data?.paymentMethod === "COD"}
        amount={rupees(data ? data.delivery?.codAmount || data.total : 0)}
        onSubmit={moveLeg}
        onClose={() => setLegSheet(null)}
      />

      <RejectSheet
        visible={sheet !== null}
        mode={sheet ?? "reject"}
        onClose={() => setSheet(null)}
        onSubmit={(reason) => {
          const mode = sheet;
          setSheet(null);
          if (mode) setConfirming({ mode, reason });
        }}
      />

      {/* One dialog for both, because the consequence is the same sentence: the
          customer is told, and stock, coins and coupons go back. */}
      <Confirm
        visible={confirming !== null}
        title={confirming?.mode === "cancel" ? t("order.cancel.title") : t("order.reject.confirm")}
        message={t("order.reject.detail")}
        confirmLabel={confirming?.mode === "cancel" ? t("order.cancel") : t("order.reject")}
        cancelLabel={t("common.notNow")}
        destructive
        onCancel={() => setConfirming(null)}
        onConfirm={commit}
      />
    </View>
  );
}

/* ── blocks ───────────────────────────────────────────────────────────────── */

/** The leg card earns its place once the order has left, or the leg has news. */
function showLeg(order: ShopOrderDetail["status"], leg: DeliveryStatus): boolean {
  if (order === "OUT_FOR_DELIVERY" || order === "DELIVERED") return leg !== "UNASSIGNED";
  return leg !== "UNASSIGNED" && leg !== "ASSIGNED";
}

/** Where the order is, and how long it has been there. */
function StatusStrip({ order }: { order: ShopOrderDetail }) {
  const t = useT();
  const minutes = useMinutesSince(order.placedAt);
  const stopped = order.status === "CANCELLED" || order.status === "REJECTED";

  if (stopped) {
    return (
      <Sunken style={{ backgroundColor: theme.color.dangerSoft, gap: theme.spacing[2] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
          <Ionicons name="close-circle" size={18} color={theme.color.danger} />
          <Text variant="bodyStrong" color="danger">
            {statusWord(order.status, t)}
          </Text>
        </View>
        {order.cancelReason ? (
          <>
            <Text variant="overline" color="textMuted">
              {t("order.cancelledNote")}
            </Text>
            <Text variant="footnote" color="textSecondary">
              {order.cancelReason}
            </Text>
          </>
        ) : null}
      </Sunken>
    );
  }

  const waiting = order.status === "PLACED";
  // A failed or returning delivery is still OUT_FOR_DELIVERY to the order, and
  // "On the way" at the top of a parcel that is coming back is simply wrong.
  const legStatus = order.delivery?.status;
  const troubled =
    order.status === "OUT_FOR_DELIVERY" &&
    (legStatus === "FAILED" ||
      legStatus === "RETURNING_TO_SHOP" ||
      legStatus === "RETURNED_TO_SHOP");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
      <Text
        variant="title2"
        color={troubled ? "warning" : "text"}
        style={{ flexShrink: 1 }}
        numberOfLines={1}
      >
        {troubled && legStatus ? legWord(legStatus, t) : statusWord(order.status, t)}
      </Text>
      <Text variant="callout" color={waiting ? "brand" : "textMuted"} numberOfLines={1}>
        {minutes < 1
          ? t("queue.justNow")
          : minutes < 60
            ? waiting
              ? t("queue.waiting", { minutes })
              : t("queue.minutesAgo", { minutes })
            : longAgo(minutes, t)}
      </Text>
    </View>
  );
}

/** What goes in the bag, at the prices it was sold for. */
function Items({ order }: { order: ShopOrderDetail }) {
  const t = useT();
  return (
    <Card>
      <Text variant="overline" color="textMuted">
        {t("order.items")}
      </Text>
      <View style={{ gap: theme.spacing[3], marginTop: theme.spacing[3] }}>
        {order.items.map((item) => (
          <View
            key={item.id}
            style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}
          >
            {/* The quantity is what a person packing reads first, so it is a
                column of its own rather than a suffix on the name. */}
            <Text variant="bodyStrong" tabular style={{ minWidth: 30 }}>
              {`${item.qty}×`}
            </Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="callout" numberOfLines={2}>
                {item.nameSnapshot}
              </Text>
              {/* A line bought in an option arrives with the option in both
                  fields — "Basmati Rice — 5 kg" and "5 kg" — so the second is
                  dropped when it only repeats the first. */}
              {item.unitSnapshot && !item.nameSnapshot.endsWith(item.unitSnapshot) ? (
                <Text variant="caption" color="textFaint">
                  {item.unitSnapshot}
                </Text>
              ) : null}
            </View>
            <Price value={lineTotal(item)} variant="callout" />
          </View>
        ))}
      </View>
    </Card>
  );
}

function MoneyRow({ label, value, tint }: { label: string; value: number; tint?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text variant="footnote" color="textSecondary">
        {label}
      </Text>
      <Price value={value} variant="footnote" color={tint ? "success" : "textSecondary"} />
    </View>
  );
}

/** The money, and the one question that matters at the door: is there cash? */
function Payment({ order }: { order: ShopOrderDetail }) {
  const t = useT();
  const cod = order.paymentMethod === "COD";
  // The delivery leg carries the figure the rider is held to; until a leg
  // exists, or while it is still zero, the order total is that same number.
  const cash = cod ? order.delivery?.codAmount || order.total : 0;

  return (
    <Card>
      <Text variant="overline" color="textMuted">
        {t("order.payment")}
      </Text>

      <View style={{ gap: theme.spacing[2], marginTop: theme.spacing[3] }}>
        <MoneyRow label={t("order.subtotal")} value={order.subtotal} />
        <MoneyRow label={t("order.delivery")} value={order.deliveryFee} />
        {order.discount > 0 && (
          <MoneyRow
            label={
              order.coupon ? `${t("order.discount")} · ${order.coupon.code}` : t("order.discount")
            }
            value={-order.discount}
            tint
          />
        )}
        <View style={{ height: 1, backgroundColor: theme.color.border, marginVertical: 2 }} />
        <View
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <Text variant="bodyStrong">{t("order.total")}</Text>
          <Price value={order.total} variant="title3" />
        </View>
      </View>

      {cod ? (
        // Loud on purpose. Cash that should have come back through the door and
        // did not is the one mistake on this screen that costs the shop money.
        <Sunken style={{ marginTop: theme.spacing[4], backgroundColor: theme.color.warningSoft }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
            <Ionicons name="cash-outline" size={18} color={theme.color.warning} />
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {t("order.collect", { amount: rupees(cash) })}
            </Text>
          </View>
          <Text variant="caption" color="textMuted" style={{ marginTop: theme.spacing[1] }}>
            {t("order.cod")}
          </Text>
        </Sunken>
      ) : (
        <Text variant="caption" color="textMuted" style={{ marginTop: theme.spacing[3] }}>
          {order.paymentStatus === "PAID" ? t("order.paid") : t("order.unpaid")}
        </Text>
      )}
    </Card>
  );
}

/** Who it is for, and the two ways to reach them. */
function Customer({ order }: { order: ShopOrderDetail }) {
  const t = useT();
  const router = useRouter();

  return (
    <Card>
      <Text variant="overline" color="textMuted">
        {t("order.customer")}
      </Text>
      <Text variant="bodyStrong" style={{ marginTop: theme.spacing[2] }} numberOfLines={1}>
        {order.recipientName}
      </Text>
      <Text variant="caption" color="textMuted" tabular>
        {order.recipientPhone}
      </Text>

      <View style={{ flexDirection: "row", gap: theme.spacing[3], marginTop: theme.spacing[4] }}>
        <Button
          label={t("order.callCustomer")}
          variant="secondary"
          leading={<Ionicons name="call" size={16} color={theme.color.text} />}
          onPress={() => void Linking.openURL(`tel:${order.recipientPhone}`)}
          style={{ flex: 1 }}
        />
        {/* The thread is opened by the chat screen, which upserts on
            (shop, customer, ORDER:<id>) — so there is no "do we already have a
            conversation" request to make from here. */}
        <Button
          label={t("order.messageCustomer")}
          variant="secondary"
          leading={<Ionicons name="chatbubble" size={15} color={theme.color.text} />}
          onPress={() =>
            router.push({
              pathname: "/chat/[id]",
              params: { id: "new", orderId: order.id, orderCode: order.code },
            })
          }
          style={{ flex: 1 }}
        />
      </View>
    </Card>
  );
}

/** Out for delivery: who has it, and nothing to press. */
function OnTheRoad({ order }: { order: ShopOrderDetail }) {
  const t = useT();
  const rider = order.tracking.rider ?? null;
  const name = rider?.name ?? order.delivery?.rider?.user.name ?? t("ui.yourRider");
  const phone = rider?.phone ?? order.delivery?.rider?.user.phone ?? null;

  return (
    <View style={{ marginTop: theme.spacing[3], gap: theme.spacing[3] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: theme.radii.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.color.brandSoft,
          }}
        >
          <Ionicons name="bicycle" size={19} color={theme.color.brand} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="callout" numberOfLines={1}>
            {name}
          </Text>
          {phone ? (
            <Text variant="caption" color="textMuted" tabular numberOfLines={1}>
              {phone}
            </Text>
          ) : null}
        </View>
        {phone ? (
          <Touchable
            haptic="light"
            onPress={() => void Linking.openURL(`tel:${phone}`)}
            accessibilityLabel={t("order.rider")}
            style={{
              width: 40,
              height: 40,
              borderRadius: theme.radii.full,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.color.brand,
            }}
          >
            <Ionicons name="call" size={17} color={theme.color.onBrand} />
          </Touchable>
        ) : null}
      </View>

      <Text variant="footnote" color="textMuted">
        {t("order.outForDelivery.detail")}
      </Text>
    </View>
  );
}

/**
 * The bar at the bottom, holding exactly the transitions this status allows.
 *
 * Pinned rather than scrolled to the end of the page: the shopkeeper's thumb is
 * already at the bottom of the phone, and the action they came for should not
 * require finding.
 */
function ActionBar({
  order,
  acts,
  can,
  legBusy,
  onLeg,
  onFail,
  pending,
  hasRider,
  onAccept,
  onPack,
  onDispatch,
  onReject,
  onCancel,
  error,
}: {
  order: ShopOrderDetail;
  acts: OrderActions;
  can: (key: string) => boolean;
  legBusy: boolean;
  onLeg: (next: DeliveryStatus) => void;
  onFail: () => void;
  /** The transition currently in flight, if any. */
  pending: OrderTransition | null;
  hasRider: boolean;
  onAccept: () => void;
  onPack: () => void;
  onDispatch: () => void;
  onReject: () => void;
  onCancel: () => void;
  error: unknown;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const busy = pending !== null || legBusy;

  const nextLeg = acts.nextLeg && can("delivery.update") ? acts.nextLeg : null;
  const canFail = acts.markFailed && can("delivery.update");
  // Once it has left the counter, the only order-level action is a cancel after
  // the parcel is back; everything else is the leg.
  const afterDispatch = order.status === "OUT_FOR_DELIVERY";
  const cancelBack = afterDispatch && acts.cancel && can("orders.cancel");
  const leg = order.delivery?.status ?? null;
  const redeliverHint =
    afterDispatch && (leg === "RETURNED_TO_SHOP" || (leg === "FAILED" && !nextLeg));

  const pre = order.status === "PLACED" || order.status === "ACCEPTED" || order.status === "PACKED";
  if (!pre && !nextLeg && !canFail && !cancelBack && !redeliverHint) return null;

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing[4],
        paddingTop: theme.spacing[3],
        paddingBottom: insets.bottom + theme.spacing[3],
        backgroundColor: theme.color.surface,
        borderTopWidth: 1,
        borderTopColor: theme.color.border,
        gap: theme.spacing[3],
      }}
    >
      {error instanceof Error && (
        <Animated.View entering={FadeIn.duration(180)}>
          <Text variant="caption" color="danger">
            {error.message}
          </Text>
        </Animated.View>
      )}

      {order.status === "PLACED" && (
        <View style={{ flexDirection: "row", gap: theme.spacing[3] }}>
          <Button
            label={t("order.reject")}
            variant="danger"
            onPress={onReject}
            disabled={busy}
            haptic="warning"
            style={{ flex: 1 }}
          />
          <Button
            label={pending === "accept" ? t("order.accepting") : t("order.accept")}
            onPress={onAccept}
            loading={pending === "accept"}
            haptic="success"
            style={{ flex: 1.4 }}
          />
        </View>
      )}

      {order.status === "ACCEPTED" && (
        <View style={{ flexDirection: "row", gap: theme.spacing[3] }}>
          <Button
            label={t("order.cancel")}
            variant="danger"
            onPress={onCancel}
            disabled={busy}
            haptic="warning"
            style={{ flex: 1 }}
          />
          <Button
            label={pending === "pack" ? t("order.working") : t("order.pack")}
            onPress={onPack}
            loading={pending === "pack"}
            style={{ flex: 1.4 }}
          />
        </View>
      )}

      {order.status === "PACKED" && (
        <>
          <View style={{ flexDirection: "row", gap: theme.spacing[3] }}>
            <Button
              label={t("order.cancel")}
              variant="danger"
              onPress={onCancel}
              disabled={busy}
              haptic="warning"
              style={{ flex: 1 }}
            />
            {/* Disabled rather than hidden while no rider is chosen: the button
                is the thing the shopkeeper is looking for, and it has to be
                visible for the line under it to explain itself. */}
            <Button
              label={pending === "dispatch" ? t("order.working") : t("order.dispatch")}
              onPress={onDispatch}
              loading={pending === "dispatch"}
              disabled={!hasRider || busy}
              style={{ flex: 1.4 }}
            />
          </View>
          {!hasRider && (
            <Text variant="caption" color="textMuted">
              {t("order.assignRider")}
            </Text>
          )}
        </>
      )}

      {afterDispatch && (nextLeg || canFail || cancelBack) ? (
        <View style={{ flexDirection: "row", gap: theme.spacing[3] }}>
          {cancelBack ? (
            <Button
              label={t("order.cancel")}
              variant="danger"
              onPress={onCancel}
              disabled={busy}
              haptic="warning"
              style={{ flex: 1 }}
            />
          ) : canFail ? (
            <Button
              label={t("leg.do.fail")}
              variant="secondary"
              onPress={onFail}
              disabled={busy}
              haptic="warning"
              style={{ flex: 1 }}
            />
          ) : null}
          {nextLeg ? (
            <Button
              label={legBusy ? t("order.working") : legActionLabel(nextLeg, t)}
              onPress={() => onLeg(nextLeg)}
              loading={legBusy}
              disabled={busy}
              haptic={nextLeg === "DELIVERED" ? "success" : "medium"}
              style={{ flex: 1.4 }}
            />
          ) : null}
        </View>
      ) : null}

      {redeliverHint ? (
        <Text variant="caption" color="textMuted">
          {leg === "RETURNED_TO_SHOP" ? t("leg.hint.returned") : t("leg.hint.reassign")}
        </Text>
      ) : null}
    </View>
  );
}
