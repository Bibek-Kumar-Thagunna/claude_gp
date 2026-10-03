import * as React from "react";
import { Modal, Pressable, View } from "react-native";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Price, Text, Touchable, theme, useT } from "@gopasal/native-ui";

/**
 * Setting the minimum order.
 *
 * ## Why a drawn keypad
 *
 * The same reasoning as the stock sheet, and it matters more here: the OS
 * keyboard covers the number being checked, takes a beat to animate in, and
 * offers a "done" key that is easy to mistake for Save. A keypad drawn in the
 * sheet cannot produce a minus sign or a decimal point, so "not negative" and
 * "a whole number" — which is what `UpdateShopDto` insists on, body validation
 * running without implicit conversion — are true by construction rather than by
 * a validator that has to be kept in step with the server.
 *
 * ## What is validated, and what is merely guarded
 *
 * `MAX_TYPED` is a fat-finger guard: a stuck key must not turn 200 into 200,000.
 * `SENSIBLE_MAX` is the real check, and it is soft on purpose — it does not stop
 * the digits going in, it stops the Save and says why. A kirana's minimum order
 * is tens or low hundreds of rupees; a four-figure one is almost always a
 * mistyped number, and a shop that quietly sets one disappears from checkout for
 * every customer it has.
 *
 * ## Why nothing here is optimistic
 *
 * The sheet hands the screen a number and stops. What the row above ends up
 * showing is what the server said, not what was typed — a minimum the phone
 * believed and the shop did not have would be a lie at checkout, which is the
 * one place it is expensive.
 */

/** A stuck key cannot get past this. Not a business rule. */
const MAX_TYPED = 99_999;

/** Above this, Save is refused and the reason is said out loud. */
const SENSIBLE_MAX = 5_000;

const STEPS = [-100, -50, 50, 100] as const;

type Key = { kind: "digit"; digit: number } | { kind: "clear" } | { kind: "back" };

const KEYPAD: Key[] = [
  { kind: "digit", digit: 1 },
  { kind: "digit", digit: 2 },
  { kind: "digit", digit: 3 },
  { kind: "digit", digit: 4 },
  { kind: "digit", digit: 5 },
  { kind: "digit", digit: 6 },
  { kind: "digit", digit: 7 },
  { kind: "digit", digit: 8 },
  { kind: "digit", digit: 9 },
  { kind: "clear" },
  { kind: "digit", digit: 0 },
  { kind: "back" },
];

function clamp(value: number): number {
  return Math.max(0, Math.min(MAX_TYPED, value));
}

function Step({ by, onPress }: { by: number; onPress: () => void }) {
  const t = useT();
  const up = by > 0;
  return (
    <Touchable
      haptic="light"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        up
          ? t("shop.minOrder.a11yAdd", { amount: by })
          : t("shop.minOrder.a11yRemove", { amount: -by })
      }
      style={{
        flex: 1,
        height: 46,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        borderRadius: theme.radii.md,
        backgroundColor: theme.color.surfaceSunken,
      }}
    >
      <Text variant="callout" color="textSecondary" tabular>
        {`${up ? "+" : "−"}${Math.abs(by)}`}
      </Text>
    </Touchable>
  );
}

export function ShopMinOrderSheet({
  visible,
  current,
  busy = false,
  error,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  /** The minimum the server last confirmed. Read once, on the way in. */
  current: number;
  busy?: boolean;
  error?: string | null;
  onSubmit: (minOrder: number) => void;
  onClose: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();

  const [value, setValue] = React.useState(current);
  /** Whether the next digit extends the number or starts a new one. */
  const [typing, setTyping] = React.useState(false);

  // Seeded when the sheet opens, and never again: the shop list refetches on its
  // own, and a colleague's save landing mid-edit must not move the number under
  // a half-typed one.
  const wasVisible = React.useRef(false);
  React.useEffect(() => {
    if (visible && !wasVisible.current) {
      setValue(current);
      setTyping(false);
    }
    wasVisible.current = visible;
  }, [visible, current]);

  const digit = (d: number) => {
    const next = (typing ? value : 0) * 10 + d;
    if (next > MAX_TYPED) return;
    setTyping(true);
    setValue(next);
  };

  const press = (key: Key) => {
    if (key.kind === "digit") return digit(key.digit);
    if (key.kind === "back") {
      setTyping(true);
      setValue((v) => Math.floor(v / 10));
      return;
    }
    setTyping(true);
    setValue(0);
  };

  const keyLabel = (key: Key): string => {
    if (key.kind === "digit") return String(key.digit);
    if (key.kind === "back") return "⌫";
    return t("shelf.stock.clear");
  };

  const keyA11y = (key: Key): string => {
    if (key.kind === "digit") return t("shelf.stock.a11yDigit", { digit: key.digit });
    if (key.kind === "back") return t("shelf.stock.a11yBack");
    return t("shop.minOrder.a11yClear");
  };

  const tooHigh = value > SENSIBLE_MAX;
  const unchanged = value === current;

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
        <Animated.View
          entering={SlideInDown.duration(240)}
          style={{
            backgroundColor: theme.color.surface,
            borderTopLeftRadius: theme.radii["2xl"],
            borderTopRightRadius: theme.radii["2xl"],
            paddingHorizontal: theme.spacing[4],
            paddingTop: theme.spacing[3],
            paddingBottom: insets.bottom + theme.spacing[5],
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

          <Text variant="caption" color="textMuted">
            {t("shop.minOrder")}
          </Text>
          <Text variant="title3" style={{ marginTop: 2 }}>
            {t("shop.minOrderDetail")}
          </Text>

          <View
            accessible
            accessibilityLabel={
              value === 0
                ? t("shop.minOrder.a11yNone")
                : t("shop.minOrder.a11yValue", { amount: value })
            }
            style={{
              marginTop: theme.spacing[4],
              paddingVertical: theme.spacing[4],
              borderRadius: theme.radii.lg,
              backgroundColor: theme.color.surfaceSunken,
              alignItems: "center",
            }}
          >
            <Price value={value} variant="display" />
            <Text
              variant="caption"
              color={value === 0 ? "textSecondary" : "textMuted"}
              align="center"
              style={{ marginTop: 2, paddingHorizontal: theme.spacing[4] }}
            >
              {value === 0 ? t("shop.minOrder.none") : t("shop.minOrder.was", { amount: current })}
            </Text>
          </View>

          <View
            style={{ flexDirection: "row", gap: theme.spacing[2], marginTop: theme.spacing[3] }}
          >
            {STEPS.map((by) => (
              <Step
                key={by}
                by={by}
                onPress={() => {
                  setTyping(false);
                  setValue((v) => clamp(v + by));
                }}
              />
            ))}
          </View>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              marginTop: theme.spacing[3],
              rowGap: theme.spacing[2],
            }}
          >
            {KEYPAD.map((key, i) => (
              <View key={i} style={{ width: "33.333%", paddingHorizontal: 3 }}>
                <Touchable
                  haptic="selection"
                  onPress={() => press(key)}
                  accessibilityRole="button"
                  accessibilityLabel={keyA11y(key)}
                  style={{
                    height: 52,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: theme.radii.md,
                    backgroundColor:
                      key.kind === "digit" ? theme.color.surface : theme.color.surfaceSunken,
                    borderWidth: key.kind === "digit" ? 1 : 0,
                    borderColor: theme.color.border,
                  }}
                >
                  <Text
                    variant={key.kind === "clear" ? "caption" : "title3"}
                    color={key.kind === "digit" ? "text" : "textSecondary"}
                    tabular={key.kind === "digit"}
                  >
                    {keyLabel(key)}
                  </Text>
                </Touchable>
              </View>
            ))}
          </View>

          {tooHigh || error ? (
            <Text
              variant="footnote"
              color="danger"
              align="center"
              style={{ marginTop: theme.spacing[3] }}
            >
              {error ?? t("shop.minOrder.tooHigh", { amount: SENSIBLE_MAX })}
            </Text>
          ) : null}

          <View
            style={{ flexDirection: "row", gap: theme.spacing[3], marginTop: theme.spacing[4] }}
          >
            <View style={{ flex: 1 }}>
              <Button
                label={t("common.cancel")}
                variant="secondary"
                onPress={onClose}
                disabled={busy}
              />
            </View>
            <View style={{ flex: 1.4 }}>
              <Button
                label={busy ? t("common.saving") : t("common.save")}
                onPress={() => onSubmit(value)}
                loading={busy}
                // Nothing to send, or a number that would take the shop off
                // checkout. The line above already says which.
                disabled={unchanged || tooHigh}
              />
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
