import * as React from "react";
import { Linking, ScrollView, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  lineTotal,
  useCancelOrder,
  useGopasal,
  useOrder,
  useOrderRealtime,
  type Order,
  type OrderStatus,
} from "@gopasal/native-data";
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
  palette,
  stagger,
  theme,
  useT,
} from "@gopasal/native-ui";
import { OrderTrouble } from "../../components/OrderTrouble";
import { DeliveredBlock } from "../../components/DeliveredBlock";
import { RouteCanvas } from "../../components/RouteCanvas";

/**
 * One order, while it is happening.
 *
 * Two rules this screen holds to, both from `docs/maps-cost-policy.md` and both
 * the honest choice anyway:
 *
 *  - **Distance remaining, never a countdown.** An ETA on a Kathmandu street at
 *    six in the evening is a guess presented as a promise, and the customer
 *    remembers the promise. "1.2 km away" is true, useful, and costs nothing.
 *  - **No map until the rider is actually moving.** A map costs tiles on every
 *    mount. Before dispatch there is nothing on it worth the load, so the
 *    journey rail carries the story instead.
 *
 * The polling interval is chosen by what the order is doing: a few seconds
 * while a rider is en route, a couple of minutes while the shop is packing,
 * nothing at all once it is delivered or cancelled. A settled order polled
 * every five seconds is a battery drain and an invoice line for no new
 * information.
 */

/** Status labels come from the dictionary; these are the English fallbacks. */
const JOURNEY: { status: OrderStatus; label: string; detail: string }[] = [
  { status: "PLACED", label: "Placed", detail: "Waiting for the shop to accept" },
  { status: "ACCEPTED", label: "Accepted", detail: "The shop is getting your items together" },
  { status: "PACKED", label: "Packed", detail: "Ready and waiting for a rider" },
  { status: "OUT_FOR_DELIVERY", label: "On the way", detail: "A rider has it" },
  { status: "DELIVERED", label: "Delivered", detail: "Handed over" },
];

const TERMINAL: OrderStatus[] = ["DELIVERED", "CANCELLED", "REJECTED"];

function pollFor(status?: OrderStatus): number | undefined {
  if (!status || TERMINAL.includes(status)) return undefined;
  if (status === "OUT_FOR_DELIVERY") return 8_000;
  return 30_000;
}

function stageIndex(status: OrderStatus): number {
  const i = JOURNEY.findIndex((s) => s.status === status);
  return i === -1 ? 0 : i;
}

function timeOf(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function Journey({ order }: { order: Order }) {
  const t = useT();
  const cancelled = order.status === "CANCELLED" || order.status === "REJECTED";
  const current = stageIndex(order.status);
  const at: Record<string, string | null | undefined> = {
    PLACED: order.placedAt,
    ACCEPTED: order.acceptedAt,
    PACKED: order.packedAt,
    OUT_FOR_DELIVERY: order.dispatchedAt,
    DELIVERED: order.deliveredAt,
  };

  if (cancelled) {
    return (
      <Sunken style={{ backgroundColor: theme.color.dangerSoft, gap: theme.spacing[2] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
          <Ionicons name="close-circle" size={18} color={theme.color.danger} />
          <Text variant="bodyStrong" style={{ color: theme.color.danger }}>
            {order.status === "REJECTED" ? t("track.rejected.title") : t("track.cancelled.title")}
          </Text>
        </View>
        {order.cancelReason ? (
          <Text variant="footnote" color="textSecondary">
            {order.cancelReason}
          </Text>
        ) : null}
        <Text variant="caption" color="textMuted">
          {t("track.restored")}
        </Text>
      </Sunken>
    );
  }

  return (
    <View style={{ gap: theme.spacing[1] }}>
      {JOURNEY.map((stage, index) => {
        const done = index < current;
        const now = index === current;
        const tint = done || now ? theme.color.brand : theme.color.border;

        return (
          <Animated.View
            key={stage.status}
            entering={FadeInDown.delay(stagger(index, 50)).duration(260)}
            style={{ flexDirection: "row", gap: theme.spacing[3] }}
          >
            {/* rail */}
            <View style={{ width: 22, alignItems: "center" }}>
              <View
                style={{
                  width: now ? 16 : 12,
                  height: now ? 16 : 12,
                  borderRadius: 8,
                  backgroundColor: done || now ? theme.color.brand : theme.color.surface,
                  borderWidth: done || now ? 0 : 2,
                  borderColor: theme.color.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {done && <Ionicons name="checkmark" size={9} color={palette.white} />}
              </View>
              {index < JOURNEY.length - 1 && (
                <View style={{ width: 2, flex: 1, minHeight: 26, backgroundColor: tint }} />
              )}
            </View>

            <View style={{ flex: 1, paddingBottom: theme.spacing[4] }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
                <Text
                  variant={now ? "bodyStrong" : "callout"}
                  color={done || now ? "text" : "textFaint"}
                  style={{ flex: 1 }}
                >
                  {t(`status.${stage.status}`, undefined, stage.label)}
                </Text>
                {at[stage.status] ? (
                  <Text variant="caption" color="textFaint" tabular>
                    {timeOf(at[stage.status])}
                  </Text>
                ) : null}
              </View>
              {now ? (
                <Text variant="caption" color="textMuted" style={{ marginTop: 1 }}>
                  {stage.status === "PLACED"
                    ? t("track.waitingShop", undefined, stage.detail)
                    : stage.status === "OUT_FOR_DELIVERY"
                      ? t("track.riderHasIt", undefined, stage.detail)
                      : t(`track.detail.${stage.status}`, undefined, stage.detail)}
                </Text>
              ) : null}
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

export default function OrderScreen() {
  const router = useRouter();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  const { user } = useGopasal();
  const [focused, setFocused] = React.useState(false);

  useFocusEffect(
    React.useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const orderQuery = useOrder(String(id ?? ""), { pollMs: undefined });
  const order = orderQuery.data;

  /*
    The socket first; the poll only when it is not there.

    `useOrderRealtime` joins the order's room and writes the rider's position
    straight into this query's cache, so while it is connected a poll would
    fetch a row the app already has. When it is not — no signal, a proxy that
    eats websockets, the app just backgrounded — `pollFor` takes over at the
    old interval and nothing about the screen changes except how fresh the
    marker is.
  */
  const realtime = useOrderRealtime(
    String(id ?? ""),
    focused && !TERMINAL.includes(order?.status ?? "PLACED"),
  );
  const live = useOrder(String(id ?? ""), {
    pollMs: focused && !realtime.live ? pollFor(order?.status) : undefined,
  });
  const cancel = useCancelOrder(String(id ?? ""));

  const data = live.data ?? order;
  const tracking = data?.tracking;
  const rider = tracking?.rider;
  const remaining = tracking?.route?.distanceMeters;

  const canCancel =
    data && !TERMINAL.includes(data.status) && data.status !== "OUT_FOR_DELIVERY";

  // Our own dialog: Alert.alert is a no-op on web, so this confirmation
  // silently did nothing there.
  const [confirmCancelOpen, setConfirmCancelOpen] = React.useState(false);
  const confirmCancel = () => setConfirmCancelOpen(true);

  if (!user) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.color.background,
          padding: theme.spacing[6],
        }}
      >
        <Text variant="title3">{t("track.signIn.title")}</Text>
        <Button
          label={t("common.continue")}
          full={false}
          onPress={() => router.push("/auth/phone")}
          style={{ marginTop: theme.spacing[5] }}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      <ScrollView
        contentContainerStyle={{
          paddingBottom: theme.spacing[10],
        }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[palette.crimson[600], palette.crimson[500]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingTop: insets.top + theme.spacing[2],
            paddingBottom: theme.spacing[8],
            paddingHorizontal: theme.spacing[4],
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
            <Touchable
              haptic="light"
              onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/orders"))}
              accessibilityLabel={t("common.back")}
              style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="arrow-back" size={20} color={palette.white} />
            </Touchable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="overline" style={{ color: "rgba(255,255,255,0.75)" }}>
                {(data ? t("track.orderCode", { code: data.code }) : t("track.order")).toUpperCase()}
              </Text>
              <Text variant="title2" style={{ color: palette.white }} numberOfLines={1}>
                {data?.shop.name ?? "…"}
              </Text>
            </View>
          </View>

          {placed === "1" && (
            <Animated.View entering={FadeIn.duration(320)} style={{ marginTop: theme.spacing[4] }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: theme.spacing[3],
                  padding: theme.spacing[3],
                  borderRadius: theme.radii.lg,
                  backgroundColor: "rgba(255,255,255,0.18)",
                }}
              >
                <Ionicons name="checkmark-circle" size={20} color={palette.white} />
                <Text variant="callout" style={{ color: palette.white, flex: 1 }}>
                  {t("track.placed.toast")}
                </Text>
              </View>
            </Animated.View>
          )}
        </LinearGradient>

        <View
          style={{
            backgroundColor: theme.color.background,
            borderTopLeftRadius: theme.radii["2xl"],
            borderTopRightRadius: theme.radii["2xl"],
            marginTop: -theme.spacing[5],
            paddingTop: theme.spacing[6],
            paddingHorizontal: theme.spacing[4],
            gap: theme.spacing[4],
          }}
        >
          {!data ? (
            <View style={{ gap: theme.spacing[3] }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} width="100%" height={72} radius={theme.radii.lg} delay={i * 90} />
              ))}
            </View>
          ) : (
            <>
              {/* The drawn route, from dispatch onward. Costs nothing: the
                  geometry is already in the tracking payload, so this is a
                  render rather than a request. */}
              {data.status === "OUT_FOR_DELIVERY" && tracking && (
                <RouteCanvas tracking={tracking} shopName={data.shop.name} />
              )}

              {/* live strip — only while something is actually moving */}
              {data.status === "OUT_FOR_DELIVERY" && (
                <Card style={{ borderColor: theme.color.brandBorder }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: theme.radii.full,
                        backgroundColor: theme.color.brandSoft,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name="bicycle" size={22} color={theme.color.brand} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {rider?.name ?? t("track.riderFallback")}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
                        {/* The distance is already on the canvas above, so this
                            line carries what the canvas cannot: who is coming,
                            whether their position is fresh, and whether it is
                            arriving continuously or every few seconds. */}
                        <Text variant="caption" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
                          {rider?.stale
                            ? t("track.stale")
                            : [
                                rider?.vehicleType,
                                realtime.live ? t("track.movingLive") : t("track.updating"),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                        </Text>
                        {realtime.live && !rider?.stale && (
                          <View
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 3,
                              backgroundColor: theme.color.success,
                            }}
                          />
                        )}
                      </View>
                    </View>
                    {rider?.phone ? (
                      <Touchable
                        haptic="light"
                        onPress={() => Linking.openURL(`tel:${rider.phone}`)}
                        accessibilityLabel={t("track.callRider")}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: theme.radii.full,
                          backgroundColor: theme.color.brand,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="call" size={18} color={palette.white} />
                      </Touchable>
                    ) : null}
                  </View>
                </Card>
              )}

              <Card>
                <Text variant="title3" style={{ marginBottom: theme.spacing[4] }}>
                  {t("track.progress")}
                </Text>
                <Journey order={data} />
              </Card>

              <Card>
                <Text variant="title3">Items</Text>
                <View style={{ gap: theme.spacing[3], marginTop: theme.spacing[3] }}>
                  {data.items.map((item) => (
                    <View
                      key={item.id}
                      style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}
                    >
                      <Text variant="caption" color="textMuted" tabular style={{ minWidth: 22 }}>
                        {item.qty}×
                      </Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        {/* The snapshot, not today's product name — this is a
                            receipt for what was actually bought. */}
                        <Text variant="callout" numberOfLines={2}>
                          {item.nameSnapshot}
                        </Text>
                        {/* For a line bought in an option the server puts the
                            option in both fields — "Basmati Rice — 5 kg" and
                            "5 kg" — so the second line is dropped when it only
                            repeats the first. */}
                        {item.unitSnapshot && !item.nameSnapshot.endsWith(item.unitSnapshot) ? (
                          <Text variant="caption" color="textFaint">
                            {item.unitSnapshot}
                          </Text>
                        ) : null}
                      </View>
                      <Price value={lineTotal(item)} variant="callout" />
                    </View>
                  ))}

                  <View style={{ height: 1, backgroundColor: theme.color.border }} />

                  <Row label={t("track.items")} value={data.subtotal} />
                  <Row label={t("checkout.delivery")} value={data.deliveryFee} />
                  {data.discount > 0 && (
                    <Row
                      label={data.coupon?.code ? t("checkout.offerCode", { code: data.coupon.code }) : t("checkout.discount")}
                      value={-data.discount}
                      success
                    />
                  )}
                  {(data.loyaltyDiscount ?? 0) > 0 && (
                    <Row
                      label={t("checkout.coinsLine", { count: data.loyaltyPointsRedeemed ?? 0 })}
                      value={-(data.loyaltyDiscount ?? 0)}
                      success
                    />
                  )}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text variant="bodyStrong">
                      {data.paymentMethod === "COD" ? t("track.payOnDelivery") : t("track.paid")}
                    </Text>
                    <Price value={data.total} variant="title3" />
                  </View>
                </View>
              </Card>

              {data.status === "DELIVERED" && <DeliveredBlock order={data} />}

              {data.fullAddress ? (
                <Card>
                  <Text variant="caption" color="textMuted">
                    {t("track.deliveringTo")}
                  </Text>
                  <Text variant="callout" style={{ marginTop: 4 }}>
                    {data.fullAddress}
                  </Text>
                  <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                    {data.area}
                    {data.landmark ? ` · ${data.landmark}` : ""}
                  </Text>
                  {data.recipientName ? (
                    <Text variant="caption" color="textFaint" style={{ marginTop: 2 }}>
                      {data.recipientName}
                      {data.recipientPhone ? ` · ${data.recipientPhone}` : ""}
                    </Text>
                  ) : null}
                </Card>
              ) : null}

              {data.note ? (
                <Card>
                  <Text variant="caption" color="textMuted">
                    {t("track.yourNote")}
                  </Text>
                  <Text variant="footnote" color="textSecondary" style={{ marginTop: 4 }}>
                    {data.note}
                  </Text>
                </Card>
              ) : null}

              <View style={{ flexDirection: "row", gap: theme.spacing[3] }}>
                <Button
                  label={t("shop.message")}
                  variant="secondary"
                  onPress={() =>
                    router.push({
                      pathname: "/chat/[id]",
                      params: { id: "new", shopId: data.shop.id, shopName: data.shop.name },
                    })
                  }
                  style={{ flex: 1 }}
                />
                {data.shop.phone ? (
                  <Button
                    label={t("track.callShop")}
                    variant="secondary"
                    onPress={() => Linking.openURL(`tel:${data.shop.phone}`)}
                    style={{ flex: 1 }}
                  />
                ) : null}
              </View>

              <OrderTrouble order={data} />

              {canCancel && (
                <Touchable
                  haptic="warning"
                  onPress={confirmCancel}
                  accessibilityLabel={t("track.cancel")}
                  style={{ alignSelf: "center", padding: theme.spacing[3] }}
                >
                  <Text variant="caption" style={{ color: theme.color.danger }}>
                    {cancel.isPending ? t("common.working") : t("track.cancel")}
                  </Text>
                </Touchable>
              )}
            </>
          )}
        </View>
      </ScrollView>

      <Confirm
        visible={confirmCancelOpen}
        title={t("track.cancel.confirm.title")}
        message={t("track.cancel.confirm.message")}
        confirmLabel={t("track.cancel.confirm.yes")}
        cancelLabel={t("track.cancel.confirm.no")}
        destructive
        busy={cancel.isPending}
        onConfirm={() => {
          setConfirmCancelOpen(false);
          cancel.mutate("Changed my mind");
        }}
        onCancel={() => setConfirmCancelOpen(false)}
      />
    </View>
  );
}

function Row({ label, value, success }: { label: string; value: number; success?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text variant="callout" color="textSecondary">
        {label}
      </Text>
      <Price
        value={value}
        variant="callout"
        style={success ? { color: theme.color.success } : undefined}
      />
    </View>
  );
}
