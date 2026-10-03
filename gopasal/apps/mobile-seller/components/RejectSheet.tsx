import * as React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Text, Touchable, theme, useT } from "@gopasal/native-ui";

/**
 * Saying no, with a reason.
 *
 * The reason is not paperwork. `RejectOrderDto` and `CancelOrderDto` both
 * declare it `@IsString() @MinLength(3) @MaxLength(280)` with no
 * `@IsOptional()`, it is written to `Order.cancelReason` and onto the event —
 * and from there it is what the customer reads when their groceries do not
 * come. So it has to be words, and it has to be words a shopkeeper will
 * actually produce with a queue in front of them: five chips for the five real
 * reasons, and a box for the sixth.
 *
 * Tapping a chip writes its words into the box rather than storing a code,
 * because the customer is going to read a sentence and an enum is not one. The
 * shopkeeper can then edit it, which is the point — "Out of stock" becomes "Out
 * of stock, only 2 left" in one tap plus a few letters.
 *
 * **This sheet does not commit.** It collects the reason and hands back to the
 * screen, which then puts the consequences in front of the shopkeeper with
 * `Confirm` before the write goes out. The last thing anybody sees before an
 * order is destroyed should be what that does to the customer, not a keyboard.
 */

/** The five the dictionary carries. `other` clears the box and opens the keyboard. */
const REASONS = [
  "order.reason.outOfStock",
  "order.reason.tooBusy",
  "order.reason.closing",
  "order.reason.tooFar",
  "order.reason.other",
] as const;

/** `MinLength(3)` server-side. Refusing here is kinder than a 400 in Nepali-less English. */
const MIN_REASON = 3;
/** `MaxLength(280)`. */
const MAX_REASON = 280;

export function RejectSheet({
  visible,
  mode,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  /** Rejecting a new order, or cancelling one the shop already promised. */
  mode: "reject" | "cancel";
  onSubmit: (reason: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const box = React.useRef<TextInput>(null);
  const [reason, setReason] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  // A sheet reopened on a different order must not arrive carrying the last
  // order's reason — that text goes to a customer.
  React.useEffect(() => {
    if (visible) {
      setReason("");
      setTouched(false);
    }
  }, [visible]);

  const trimmed = reason.trim();
  const ready = trimmed.length >= MIN_REASON;

  const submit = () => {
    setTouched(true);
    if (!ready) return;
    onSubmit(trimmed);
  };

  return (
    <Modal
      visible={visible}
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
              maxHeight: "86%",
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

            <Text variant="title3">
              {mode === "cancel" ? t("order.cancel.title") : t("order.reject.title")}
            </Text>
            <Text variant="footnote" color="textSecondary" style={{ marginTop: theme.spacing[1] }}>
              {mode === "cancel" ? t("order.cancel.detail") : t("order.reject.detail")}
            </Text>

            <ScrollView
              style={{ marginTop: theme.spacing[4] }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] }}>
                {REASONS.map((key) => {
                  const words = t(key);
                  const own = key === "order.reason.other";
                  const picked = !own && trimmed === words;
                  return (
                    <Touchable
                      key={key}
                      haptic="selection"
                      onPress={() => {
                        // "Something else" is the only chip that is not itself a
                        // reason: it empties the box and opens the keyboard,
                        // because the words after it are the ones that matter.
                        setReason(own ? "" : words);
                        setTouched(false);
                        if (own) box.current?.focus();
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
                })}
              </View>

              {/* No `fontFamily`: Inter has no Devanagari, and a shopkeeper
                  typing the reason in Nepali must not watch it come out as
                  boxes. The system face covers both scripts. */}
              <TextInput
                ref={box}
                value={reason}
                onChangeText={(next) => {
                  setReason(next);
                  setTouched(false);
                }}
                placeholder={t("order.reason.placeholder")}
                placeholderTextColor={theme.color.textFaint}
                accessibilityLabel={t("order.reason.placeholder")}
                multiline
                maxLength={MAX_REASON}
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
                  {t("order.reason.required")}
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
              {/* Enabled regardless, so tapping it with an empty box *says* why
                  it cannot go rather than sitting there greyed out with no
                  explanation. */}
              <Button
                label={t("common.continue")}
                onPress={submit}
                haptic="warning"
                style={{ flex: 1.3, opacity: ready ? 1 : 0.6 }}
              />
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}
