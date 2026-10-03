import * as React from "react";
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useGopasal } from "@gopasal/native-data";
import {
  DELIVERY_NOTE_MAX_LENGTH,
  DELIVERY_NOTE_MIN_LENGTH,
  type Delivery,
  type DeliveryStatus,
  type DeliveryTransition,
} from "@gopasal/native-data/seller-delivery";
import { Button, Card, Skeleton, Sunken, Text, Touchable, theme, useT } from "@gopasal/native-ui";

/**
 * The delivery leg, after the order has left the counter.
 *
 * Until this existed the order screen ended at "Hand to rider" and then said
 * there was nothing more to do — which was true for a shop whose rider walks the
 * leg in their own app, and false for every shop that delivers itself, for
 * every rider who forgot, and for every parcel that came back. The web console
 * could close those orders and the phone could not.
 *
 * Three pieces:
 *
 *  - {@link LegCard} — where the leg is, in the words the customer's timeline
 *    uses, with the handover note, whether cash was taken, why a delivery
 *    failed, and the condition of a returned parcel.
 *  - {@link LegSheet} — the three steps that need words: the handover, the
 *    failure, and receiving a returned parcel. The API refuses each without a
 *    note of at least three characters, and those notes are what a dispute is
 *    later settled on, so the sheet offers the common sentences as chips and
 *    leaves the box editable.
 *  - {@link ProofPhoto} — the rider's doorstep photo, fetched only when asked
 *    for: every read is audited, because it is a picture of a customer's home.
 */

const STEPS: DeliveryStatus[] = ["ASSIGNED", "PICKED_UP", "EN_ROUTE", "DELIVERED"];

/** The label for a leg state, shared by the card and the action bar. */
export function legWord(status: DeliveryStatus, t: ReturnType<typeof useT>): string {
  switch (status) {
    case "UNASSIGNED":
      return t("leg.status.unassigned");
    case "ASSIGNED":
      return t("leg.status.assigned");
    case "PICKED_UP":
      return t("leg.status.pickedUp");
    case "EN_ROUTE":
      return t("leg.status.enRoute");
    case "DELIVERED":
      return t("leg.status.delivered");
    case "FAILED":
      return t("leg.status.failed");
    case "RETURNING_TO_SHOP":
      return t("leg.status.returning");
    case "RETURNED_TO_SHOP":
      return t("leg.status.returned");
  }
}

/** What the button that moves the leg to `next` says. */
export function legActionLabel(next: DeliveryStatus, t: ReturnType<typeof useT>): string {
  switch (next) {
    case "PICKED_UP":
      return t("leg.do.pickUp");
    case "EN_ROUTE":
      return t("leg.do.enRoute");
    case "DELIVERED":
      return t("leg.do.deliver");
    case "RETURNING_TO_SHOP":
      return t("leg.do.returning");
    case "RETURNED_TO_SHOP":
      return t("leg.do.returned");
    default:
      return legWord(next, t);
  }
}

function clock(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  return at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/* ── the card ─────────────────────────────────────────────────────────────── */

export function LegCard({
  shopId,
  orderId,
  leg,
  cod,
}: {
  shopId: string;
  orderId: string;
  leg: Delivery;
  cod: boolean;
}) {
  const t = useT();
  const troubled =
    leg.status === "FAILED" ||
    leg.status === "RETURNING_TO_SHOP" ||
    leg.status === "RETURNED_TO_SHOP";
  const reached = STEPS.indexOf(leg.status);
  const stamps: Record<string, string | null> = {
    ASSIGNED: clock(leg.assignedAt),
    PICKED_UP: clock(leg.pickedUpAt),
    EN_ROUTE: null,
    DELIVERED: clock(leg.deliveredAt),
  };

  return (
    <Card>
      <Text variant="overline" color="textMuted">
        {t("leg.title")}
      </Text>

      {troubled ? (
        <View style={{ marginTop: theme.spacing[3], gap: theme.spacing[3] }}>
          <Sunken style={{ backgroundColor: theme.color.warningSoft, gap: theme.spacing[1] }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
              <Ionicons name="alert-circle" size={17} color={theme.color.warning} />
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {legWord(leg.status, t)}
              </Text>
              {clock(leg.returnedAt ?? leg.returnStartedAt ?? leg.failedAt) ? (
                <Text variant="caption" color="textMuted">
                  {clock(leg.returnedAt ?? leg.returnStartedAt ?? leg.failedAt)}
                </Text>
              ) : null}
            </View>
            {leg.failReason ? (
              <Text variant="footnote" color="textSecondary">
                {t("leg.failReason", { reason: leg.failReason })}
              </Text>
            ) : null}
            {leg.returnNote ? (
              <Text variant="footnote" color="textSecondary">
                {t("leg.returnNote", { note: leg.returnNote })}
              </Text>
            ) : null}
          </Sunken>
          <Text variant="caption" color="textMuted">
            {leg.status === "FAILED"
              ? leg.pickedUpAt
                ? t("leg.next.bringBack")
                : t("leg.next.reassign")
              : leg.status === "RETURNING_TO_SHOP"
                ? t("leg.next.receive")
                : t("leg.next.redeliverOrCancel")}
          </Text>
        </View>
      ) : (
        <View style={{ marginTop: theme.spacing[3], gap: theme.spacing[2] }}>
          {STEPS.map((step, i) => {
            const done = i <= reached;
            const current = i === reached;
            return (
              <View
                key={step}
                style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}
                accessibilityLabel={`${legWord(step, t)}${done ? `, ${t("leg.a11y.done")}` : ""}`}
              >
                <Ionicons
                  name={done ? "checkmark-circle" : "ellipse-outline"}
                  size={18}
                  color={done ? theme.color.success : theme.color.borderStrong}
                />
                <Text
                  variant={current ? "bodyStrong" : "callout"}
                  color={done ? "text" : "textFaint"}
                  style={{ flex: 1 }}
                >
                  {legWord(step, t)}
                </Text>
                {stamps[step] ? (
                  <Text variant="caption" color="textMuted" tabular>
                    {stamps[step]}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      {leg.status === "DELIVERED" ? (
        <View style={{ marginTop: theme.spacing[4], gap: theme.spacing[3] }}>
          {cod ? (
            <Text variant="footnote" color={leg.codCollected ? "success" : "danger"}>
              {leg.codCollected ? t("leg.cash.taken") : t("leg.cash.notTaken")}
            </Text>
          ) : null}
          {leg.podNote ? (
            <Text variant="footnote" color="textSecondary">
              {t("leg.podNote", { note: leg.podNote })}
            </Text>
          ) : null}
          {leg.hasProofPhoto ? <ProofPhoto shopId={shopId} orderId={orderId} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

/* ── the proof photo ──────────────────────────────────────────────────────── */

export function ProofPhoto({ shopId, orderId }: { shopId: string; orderId: string }) {
  const t = useT();
  const { http } = useGopasal();
  const [uri, setUri] = React.useState<string | null>(null);
  const [state, setState] = React.useState<"idle" | "loading" | "missing">("idle");

  const load = async () => {
    setState("loading");
    try {
      const data = await http.requestDataUri(
        `/seller/shops/${encodeURIComponent(shopId)}/orders/${encodeURIComponent(orderId)}/delivery-proof`,
      );
      if (!data) {
        setState("missing");
        return;
      }
      setUri(data);
      setState("idle");
    } catch {
      setState("missing");
    }
  };

  if (uri) {
    return (
      <Animated.View entering={FadeIn.duration(240)}>
        <Image
          source={{ uri }}
          resizeMode="cover"
          accessibilityLabel={t("leg.photo.alt")}
          style={{
            width: "100%",
            height: 200,
            borderRadius: theme.radii.lg,
            backgroundColor: theme.color.surfaceSunken,
          }}
        />
      </Animated.View>
    );
  }
  if (state === "loading") return <Skeleton width="100%" height={200} radius={theme.radii.lg} />;
  if (state === "missing") {
    return (
      <Text variant="caption" color="textMuted">
        {t("leg.photo.missing")}
      </Text>
    );
  }
  return (
    <Touchable
      haptic="light"
      onPress={load}
      accessibilityRole="button"
      accessibilityLabel={t("leg.photo.show")}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[3],
        padding: theme.spacing[3],
        borderRadius: theme.radii.lg,
        borderWidth: 1,
        borderColor: theme.color.border,
      }}
    >
      <Ionicons name="image-outline" size={18} color={theme.color.textMuted} />
      <Text variant="callout" style={{ flex: 1 }}>
        {t("leg.photo.show")}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={theme.color.textFaint} />
    </Touchable>
  );
}

/* ── the sheet ────────────────────────────────────────────────────────────── */

export type LegSheetMode = "deliver" | "fail" | "return";

const CHIPS: Record<LegSheetMode, string[]> = {
  deliver: ["leg.chip.toCustomer", "leg.chip.toFamily", "leg.chip.toGuard"],
  fail: ["leg.chip.noAnswer", "leg.chip.wrongAddress", "leg.chip.refused", "leg.chip.cantReach"],
  return: ["leg.chip.intact", "leg.chip.damaged", "leg.chip.missing"],
};

export function LegSheet({
  mode,
  cod,
  amount,
  onSubmit,
  onClose,
}: {
  /** Null hides the sheet. */
  mode: LegSheetMode | null;
  cod: boolean;
  /** The cash figure, already formatted, for the COD line. */
  amount: string;
  onSubmit: (transition: DeliveryTransition) => void;
  onClose: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const box = React.useRef<TextInput>(null);
  const [note, setNote] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  // On, because the API's own default is "collected" and the web console's
  // handover starts on too — the same order must not record different cash
  // depending on which screen closed it. Switching it off is a deliberate act.
  const [cash, setCash] = React.useState(true);

  React.useEffect(() => {
    if (mode) {
      setNote("");
      setTouched(false);
      setCash(true);
    }
  }, [mode]);

  const trimmed = note.trim();
  const ready = trimmed.length >= DELIVERY_NOTE_MIN_LENGTH;

  const submit = () => {
    setTouched(true);
    if (!ready || !mode) return;
    if (mode === "deliver")
      onSubmit({ status: "DELIVERED", podNote: trimmed, codCollected: cod ? cash : false });
    else if (mode === "fail") onSubmit({ status: "FAILED", failReason: trimmed });
    else onSubmit({ status: "RETURNED_TO_SHOP", returnNote: trimmed });
  };

  const title =
    mode === "deliver"
      ? t("leg.sheet.deliver.title")
      : mode === "fail"
        ? t("leg.sheet.fail.title")
        : t("leg.sheet.return.title");
  const detail =
    mode === "deliver"
      ? t("leg.sheet.deliver.detail")
      : mode === "fail"
        ? t("leg.sheet.fail.detail")
        : t("leg.sheet.return.detail");
  const action =
    mode === "deliver"
      ? t("leg.sheet.deliver.yes")
      : mode === "fail"
        ? t("leg.sheet.fail.yes")
        : t("leg.sheet.return.yes");

  return (
    <Modal
      visible={mode !== null}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View entering={FadeIn.duration(140)} style={{ flex: 1 }}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          style={{ flex: 1, backgroundColor: theme.color.scrim }}
        />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Animated.View
            entering={SlideInDown.duration(240)}
            style={{
              backgroundColor: theme.color.surface,
              borderTopLeftRadius: theme.radii["2xl"],
              borderTopRightRadius: theme.radii["2xl"],
              paddingHorizontal: theme.spacing[4],
              paddingTop: theme.spacing[3],
              paddingBottom: insets.bottom + theme.spacing[5],
              maxHeight: "88%",
            }}
          >
            <View
              style={{
                alignSelf: "center",
                width: 38,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.color.border,
                marginBottom: theme.spacing[4],
              }}
            />
            <Text variant="title3">{title}</Text>
            <Text variant="footnote" color="textSecondary" style={{ marginTop: theme.spacing[1] }}>
              {detail}
            </Text>

            <ScrollView
              style={{ marginTop: theme.spacing[4] }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {mode === "deliver" && cod ? (
                <Sunken
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: theme.spacing[3],
                    backgroundColor: cash ? theme.color.successSoft : theme.color.dangerSoft,
                    marginBottom: theme.spacing[4],
                  }}
                >
                  <Ionicons
                    name="cash-outline"
                    size={18}
                    color={cash ? theme.color.success : theme.color.danger}
                  />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{t("leg.sheet.cash", { amount })}</Text>
                    <Text variant="caption" color="textMuted">
                      {cash ? t("leg.sheet.cashOn") : t("leg.sheet.cashOff")}
                    </Text>
                  </View>
                  <Switch
                    value={cash}
                    onValueChange={setCash}
                    accessibilityLabel={t("leg.sheet.cash", { amount })}
                    trackColor={{ true: theme.color.success, false: theme.color.borderStrong }}
                  />
                </Sunken>
              ) : null}

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] }}>
                {mode
                  ? CHIPS[mode].map((key) => {
                      const words = t(key);
                      const picked = trimmed === words;
                      return (
                        <Touchable
                          key={key}
                          haptic="selection"
                          onPress={() => {
                            setNote(words);
                            setTouched(false);
                          }}
                          accessibilityLabel={words}
                          accessibilityState={{ selected: picked }}
                          style={{
                            paddingHorizontal: theme.spacing[4],
                            height: 38,
                            justifyContent: "center",
                            borderRadius: theme.radii.full,
                            borderWidth: 1,
                            borderColor: picked ? theme.color.brand : theme.color.border,
                            backgroundColor: picked ? theme.color.brandSoft : theme.color.surface,
                          }}
                        >
                          <Text variant="callout" color={picked ? "brand" : "textSecondary"}>
                            {words}
                          </Text>
                        </Touchable>
                      );
                    })
                  : null}
              </View>

              {/* No fontFamily: the system face carries Devanagari. */}
              <TextInput
                ref={box}
                value={note}
                onChangeText={(next) => {
                  setNote(next);
                  setTouched(false);
                }}
                placeholder={t("leg.sheet.placeholder")}
                placeholderTextColor={theme.color.textFaint}
                accessibilityLabel={title}
                multiline
                maxLength={DELIVERY_NOTE_MAX_LENGTH}
                style={{
                  marginTop: theme.spacing[4],
                  minHeight: 84,
                  padding: theme.spacing[3],
                  borderRadius: theme.radii.md,
                  backgroundColor: theme.color.surfaceSunken,
                  color: theme.color.text,
                  fontSize: theme.type.body.fontSize,
                  lineHeight: theme.type.body.lineHeight,
                  textAlignVertical: "top",
                }}
              />
              {touched && !ready ? (
                <Text variant="caption" color="danger" style={{ marginTop: theme.spacing[2] }}>
                  {t("leg.sheet.required")}
                </Text>
              ) : null}
            </ScrollView>

            <View
              style={{ flexDirection: "row", gap: theme.spacing[3], marginTop: theme.spacing[4] }}
            >
              <Button
                label={t("common.notNow")}
                variant="secondary"
                onPress={onClose}
                style={{ flex: 1 }}
              />
              <Button
                label={action}
                variant={mode === "fail" ? "danger" : "primary"}
                onPress={submit}
                haptic={mode === "deliver" ? "success" : "warning"}
                style={{ flex: 1.3, opacity: ready ? 1 : 0.6 }}
              />
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}
