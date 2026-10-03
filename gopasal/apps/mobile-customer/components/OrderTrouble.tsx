import * as React from "react";
import { TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDisputes,
  useGopasal,
  useRaiseDispute,
  useRetryPayment,
  type Order,
} from "@gopasal/native-data";
import { payAtGateway } from "../lib/gateway";
import {
  Button,
  Card,
  Sunken,
  Text,
  Touchable,
  fontFamily,
  haptic,
  theme,
  useT,
} from "@gopasal/native-ui";

/**
 * When an order goes wrong.
 *
 * Two different failures live here because they arrive at the same moment and
 * the customer does not distinguish them until they are told:
 *
 *  - **The payment did not land.** An eSewa or Khalti attempt can die in a
 *    dropped redirect. The order exists and is unpaid, and without a way back
 *    to the gateway the only move is to place it again — which is how somebody
 *    ends up paying twice.
 *  - **The order did, and something is wrong with it.** That is a dispute: a
 *    formal claim against one order that finance can refund against, not a
 *    chat. The server takes one per order and not before the shop has had a
 *    chance to act, so this only appears once it would be accepted.
 *
 * A raised dispute replaces the form with its own status, because the next
 * question is always "did that go anywhere".
 */

// `value` is the canonical reason the server stores and finance reads; `key`
// is only what the chip says. Translating the label must never change what is
// posted, so the two are kept apart rather than one derived from the other.
const REASONS = [
  { value: "Items missing", key: "trouble.reason.missing" },
  { value: "Something was damaged", key: "trouble.reason.damaged" },
  { value: "Never arrived", key: "trouble.reason.neverArrived" },
  { value: "Wrong items", key: "trouble.reason.wrong" },
  { value: "Charged the wrong amount", key: "trouble.reason.amount" },
] as const;

const DISPUTE_LABEL: Record<string, string> = {
  OPEN: "trouble.dispute.OPEN",
  UNDER_REVIEW: "trouble.dispute.UNDER_REVIEW",
  RESOLVED_CUSTOMER: "trouble.dispute.RESOLVED_CUSTOMER",
  RESOLVED_SHOP: "trouble.dispute.RESOLVED_SHOP",
  REJECTED: "trouble.dispute.REJECTED",
};

export function OrderTrouble({ order }: { order: Order }) {
  const t = useT();
  const { http } = useGopasal();
  const queryClient = useQueryClient();
  const refresh = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["order", order.id] }),
    [queryClient, order.id],
  );
  const disputes = useDisputes();
  const raise = useRaiseDispute();
  const retry = useRetryPayment();

  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const mine = (disputes.data ?? []).find((d) => d.orderId === order.id);
  // The stored reason is one of the canonical values above, so it gets the
  // same label the chip had; anything else is shown as it came back.
  const mineReason = REASONS.find((r) => r.value === mine?.reason);

  const unpaid =
    order.paymentMethod !== "COD" &&
    (order.paymentStatus === "PENDING" || order.paymentStatus === "FAILED") &&
    order.status !== "CANCELLED";

  // The server refuses a dispute while the order is still only PLACED, and
  // there is nothing to dispute about one that never happened.
  const canDispute =
    !mine && order.status !== "PLACED" && order.status !== "CANCELLED";

  const payAgain = async () => {
    setError(null);
    try {
      const result = await retry.mutateAsync(order.id);
      if (!result.redirectUrl) {
        setError(t("trouble.pay.noLink"));
        return;
      }
      haptic("success");
      // Same in-app sheet as checkout, and the same reason: the gateway
      // returns to our https callback, so the app watches the order rather
      // than waiting for a redirect that never comes back to it.
      const outcome = await payAtGateway({
        url: result.redirectUrl,
        isPaid: async () => {
          const latest = await http.request<{ paymentStatus?: string }>(
            `/orders/${encodeURIComponent(order.id)}`,
          );
          return latest.paymentStatus === "PAID";
        },
      });
      await refresh();
      if (outcome !== "paid") {
        setError(t("trouble.pay.pending"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("trouble.pay.startFailed"));
    }
  };

  const submit = async () => {
    if (!reason) return setError(t("trouble.form.needReason"));
    setError(null);
    try {
      await raise.mutateAsync({
        orderId: order.id,
        reason,
        detail: detail.trim() || undefined,
      });
      haptic("success");
      setOpen(false);
      setDetail("");
      setReason(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("trouble.form.failed"));
    }
  };

  if (!unpaid && !canDispute && !mine) return null;

  return (
    <Card>
      {unpaid && (
        <View style={{ marginBottom: canDispute || mine ? theme.spacing[4] : 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
            <Ionicons name="card-outline" size={16} color={theme.color.warning} />
            <Text variant="title3" style={{ flex: 1 }}>
              {order.paymentStatus === "FAILED"
                ? t("trouble.pay.failed")
                : t("trouble.pay.unconfirmed")}
            </Text>
          </View>
          <Text variant="footnote" color="textSecondary" style={{ marginTop: theme.spacing[2] }}>
            {t("trouble.pay.detail", {
              wallet: t(
                order.paymentMethod === "ESEWA" ? "trouble.pay.esewa" : "trouble.pay.khalti",
              ),
            })}
          </Text>
          <Button
            label={retry.isPending ? t("trouble.pay.opening") : t("trouble.pay.finish")}
            loading={retry.isPending}
            onPress={payAgain}
            style={{ marginTop: theme.spacing[3] }}
          />
        </View>
      )}

      {mine ? (
        <View>
          <Text variant="title3">{t("trouble.dispute.title")}</Text>
          <Sunken style={{ marginTop: theme.spacing[3], gap: theme.spacing[2] }}>
            <Text variant="callout">{mineReason ? t(mineReason.key) : mine.reason}</Text>
            {mine.detail ? (
              <Text variant="caption" color="textSecondary">
                {mine.detail}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
              <Ionicons
                name={mine.status.startsWith("RESOLVED") ? "checkmark-circle" : "time-outline"}
                size={14}
                color={
                  mine.status === "RESOLVED_CUSTOMER"
                    ? theme.color.success
                    : mine.status === "REJECTED"
                      ? theme.color.danger
                      : theme.color.textMuted
                }
              />
              <Text variant="caption" color="textSecondary">
                {DISPUTE_LABEL[mine.status] ? t(DISPUTE_LABEL[mine.status]) : mine.status}
              </Text>
            </View>
            {mine.resolution ? (
              <Text variant="caption" color="textMuted">
                {mine.resolution}
              </Text>
            ) : null}
          </Sunken>
        </View>
      ) : canDispute ? (
        open ? (
          <Animated.View entering={FadeIn.duration(180)}>
            <Text variant="title3">{t("trouble.form.title")}</Text>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: theme.spacing[2],
                marginTop: theme.spacing[3],
              }}
            >
              {REASONS.map((r) => {
                const on = reason === r.value;
                return (
                  <Touchable
                    key={r.value}
                    haptic="selection"
                    onPress={() => setReason(r.value)}
                    accessibilityLabel={t(r.key)}
                    style={{
                      paddingHorizontal: theme.spacing[3],
                      height: 32,
                      justifyContent: "center",
                      borderRadius: theme.radii.full,
                      borderWidth: 1,
                      borderColor: on ? theme.color.brand : theme.color.border,
                      backgroundColor: on ? theme.color.brandSoft : theme.color.surface,
                    }}
                  >
                    <Text
                      variant="caption"
                      style={{ color: on ? theme.color.brand : theme.color.textSecondary }}
                    >
                      {t(r.key)}
                    </Text>
                  </Touchable>
                );
              })}
            </View>

            <View
              style={{
                marginTop: theme.spacing[3],
                borderRadius: theme.radii.lg,
                borderWidth: 1,
                borderColor: theme.color.border,
                backgroundColor: theme.color.surfaceSunken,
                paddingHorizontal: theme.spacing[4],
                paddingVertical: theme.spacing[3],
                minHeight: 84,
              }}
            >
              <TextInput
                value={detail}
                onChangeText={setDetail}
                placeholder={t("trouble.form.placeholder")}
                placeholderTextColor={theme.color.textFaint}
                multiline
                maxLength={2000}
                accessibilityLabel={t("trouble.form.detailA11y")}
                style={{
                  fontFamily: fontFamily.body,
                  fontSize: 15,
                  lineHeight: 21,
                  color: theme.color.text,
                  textAlignVertical: "top",
                  minHeight: 60,
                }}
              />
            </View>

            {error ? (
              <Text variant="caption" style={{ color: theme.color.danger, marginTop: theme.spacing[2] }}>
                {error}
              </Text>
            ) : null}

            <View style={{ flexDirection: "row", gap: theme.spacing[3], marginTop: theme.spacing[3] }}>
              <Button
                label={t("trouble.form.notNow")}
                variant="ghost"
                onPress={() => {
                  setOpen(false);
                  setError(null);
                }}
                style={{ flex: 1 }}
              />
              <Button
                label={raise.isPending ? t("trouble.form.sending") : t("trouble.form.raise")}
                loading={raise.isPending}
                onPress={submit}
                style={{ flex: 1 }}
              />
            </View>
          </Animated.View>
        ) : (
          <Touchable
            haptic="light"
            onPress={() => setOpen(true)}
            accessibilityLabel={t("trouble.open.a11y")}
            style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}
          >
            <Ionicons name="alert-circle-outline" size={18} color={theme.color.danger} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="callout">{t("trouble.open.title")}</Text>
              <Text variant="caption" color="textMuted">
                {t("trouble.open.detail")}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.color.textFaint} />
          </Touchable>
        )
      ) : null}

      {error && !open ? (
        <Text variant="caption" style={{ color: theme.color.danger, marginTop: theme.spacing[2] }}>
          {error}
        </Text>
      ) : null}
    </Card>
  );
}
