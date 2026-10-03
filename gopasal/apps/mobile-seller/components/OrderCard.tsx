import * as React from "react";
import { AppState, type AppStateStatus, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { OrderStatus, ShopOrder } from "@gopasal/native-data/seller";
import { Button, Card, Price, Text, Touchable, theme, useT } from "@gopasal/native-ui";
import { agoLabel, minutesSince, urgency, waitingLabel } from "../lib/waiting";
import { legWord } from "./OrderLeg";

/**
 * One order, as it appears in the queue.
 *
 * The card answers the three questions a shopkeeper asks in the second before
 * they touch it — who is it for, how much of it is there, and how long has
 * somebody been waiting — and, on a new order, it carries the Accept button
 * itself. A shopkeeper holding a customer's bag in one hand should not have to
 * open a screen to say yes.
 *
 * Rejecting is deliberately *not* one tap: it needs a reason, which the customer
 * reads, so it hands off to the sheet.
 */

/* ── the waiting clock ────────────────────────────────────────────────────── */

/**
 * One clock for every card on the screen, ticking once a minute.
 *
 * The waiting time is the most important number on a new card, and it has to
 * keep moving — but it is measured in whole minutes, so a timer that fired every
 * second would re-render every card sixty times to change nothing fifty-nine of
 * them. A minute is the resolution of the number, so a minute is the interval.
 *
 * It is a module-level store rather than a `setInterval` per card for the reason
 * that matters on a cheap phone: twenty cards would otherwise mean twenty
 * timers, all waking the JS thread at different moments. Here there is one
 * timer, the cards subscribe to it, and the `FlatList` above them never
 * re-renders at all — only the rows that actually show a time do.
 */
let tick = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let appSub: { remove: () => void } | null = null;

function refresh(): void {
  tick = Date.now();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    // Set without notifying: React re-reads the snapshot immediately after it
    // subscribes, so a store that has been idle since the last screen still
    // hands back a fresh reading on the very first frame.
    tick = Date.now();
    timer = setInterval(refresh, 60_000);
    // An interval does not reliably fire while the phone is asleep on the
    // counter, so the elapsed time has to be re-read on the way back rather
    // than drifting until the next tick lands.
    appSub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") refresh();
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
      appSub?.remove();
      appSub = null;
    }
  };
}

function getSnapshot(): number {
  return tick;
}

/**
 * Whole minutes since an ISO timestamp, re-read once a minute.
 *
 * This hook is the clock; `minutesSince` in `../lib/waiting` is the arithmetic.
 * They are apart because the arithmetic is the part that can be wrong — see
 * that file's comment — and it cannot be reached from a test while it sits in a
 * module that imports `react-native`.
 */
export function useMinutesSince(iso: string): number {
  const now = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return minutesSince(iso, now);
}

/* ── words ────────────────────────────────────────────────────────────────── */

type T = ReturnType<typeof useT>;

/** The one word for a status, shared with the detail screen's header. */
export function statusWord(status: OrderStatus, t: T): string {
  switch (status) {
    case "PLACED":
      return t("queue.new");
    case "ACCEPTED":
      return t("queue.preparing");
    case "PACKED":
      return t("queue.ready");
    case "OUT_FOR_DELIVERY":
      return t("queue.onTheWay");
    case "DELIVERED":
      return t("order.status.delivered");
    case "CANCELLED":
      return t("order.status.cancelled");
    case "REJECTED":
      return t("order.status.rejected");
  }
}

/* ── the card ─────────────────────────────────────────────────────────────── */

export function OrderCard({
  order,
  index,
  onOpen,
  onAccept,
  onReject,
  accepting = false,
}: {
  order: ShopOrder;
  /** Position in its section — drives the entrance stagger. */
  index: number;
  onOpen: () => void;
  /** Present only on a new order; its absence is what makes the card read-only. */
  onAccept?: () => void;
  onReject?: () => void;
  accepting?: boolean;
}) {
  const t = useT();
  const minutes = useMinutesSince(order.placedAt);
  const isNew = order.status === "PLACED";
  const actionable = isNew && Boolean(onAccept);
  const itemCount = order.items.reduce((sum, item) => sum + item.qty, 0);
  const cod = order.paymentMethod === "COD";
  const rider = order.delivery?.rider?.user.name ?? null;
  const troubled =
    order.delivery?.status === "FAILED" ||
    order.delivery?.status === "RETURNING_TO_SHOP" ||
    order.delivery?.status === "RETURNED_TO_SHOP";

  // A new order is the only card with a coloured edge. Everything else on this
  // screen is work already in hand, and giving it the same emphasis would leave
  // nothing for the one order nobody has answered yet.
  return (
    <Card
      index={index}
      padded={false}
      onPress={onOpen}
      testID={`order-${order.code}`}
      style={actionable ? { borderColor: theme.color.brandBorder } : undefined}
    >
      <View style={{ padding: theme.spacing[4], gap: theme.spacing[3] }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: theme.spacing[3] }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {order.recipientName}
            </Text>
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {[
                order.code,
                itemCount === 1 ? t("queue.itemsOne") : t("queue.itemsMany", { count: itemCount }),
                order.area,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Price value={order.total} variant="callout" />
            {cod ? (
              <Text variant="overline" color="textFaint" numberOfLines={1}>
                {t("order.cod")}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
          <Ionicons
            name={isNew ? "time" : troubled ? "alert-circle" : "ellipse"}
            size={isNew || troubled ? 14 : 7}
            color={
              isNew
                ? theme.color[urgency(minutes)]
                : troubled
                  ? theme.color.warning
                  : theme.color.textFaint
            }
          />
          <Text
            variant={isNew ? "callout" : "caption"}
            color={isNew ? urgency(minutes) : troubled ? "warning" : "textMuted"}
            numberOfLines={1}
            style={{ flex: 1 }}
          >
            {isNew
              ? waitingLabel(minutes, t)
              : [
                  troubled ? legWord(order.delivery!.status, t) : statusWord(order.status, t),
                  rider,
                  agoLabel(minutes, t),
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </Text>
          {!actionable && (
            <Ionicons name="chevron-forward" size={14} color={theme.color.textFaint} />
          )}
        </View>

        {actionable && (
          <View style={{ flexDirection: "row", gap: theme.spacing[3] }}>
            <Touchable
              haptic="warning"
              onPress={onReject}
              disabled={accepting}
              accessibilityLabel={t("queue.a11y.reject", { code: order.code })}
              style={{
                height: 44,
                paddingHorizontal: theme.spacing[4],
                borderRadius: theme.radii.lg,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.color.dangerSoft,
              }}
            >
              <Text variant="callout" color="danger" numberOfLines={1}>
                {t("order.reject")}
              </Text>
            </Touchable>

            <Button
              label={accepting ? t("order.accepting") : t("order.accept")}
              // Named, because this button repeats down the list: five cards
              // each saying "Accept" give a screen-reader user five identical
              // controls and no way to tell which order they are taking.
              accessibilityLabel={t("queue.a11y.accept", { code: order.code })}
              onPress={onAccept}
              loading={accepting}
              size="md"
              style={{ flex: 1 }}
              haptic="success"
            />
          </View>
        )}
      </View>
    </Card>
  );
}
