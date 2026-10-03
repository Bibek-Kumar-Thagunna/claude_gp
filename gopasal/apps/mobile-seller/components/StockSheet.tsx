import * as React from "react";
import { Modal, Pressable, View } from "react-native";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ShopProduct } from "@gopasal/native-data/seller";
import { Button, Text, Touchable, theme, useT } from "@gopasal/native-ui";

/**
 * Counting a shelf.
 *
 * ## Why this sheet holds its own `from`
 *
 * `setStock` sends a **signed delta**, not a total, because that is all the
 * route accepts — and the delta is only honest if it is measured from the number
 * the shopkeeper was actually looking at when they decided. So the sheet takes
 * one snapshot the moment it opens and never looks at the product again.
 *
 * That matters because the shelf query refetches on its own (a colleague, a
 * focus, a pull). If `from` were read at submit time it would be whatever the
 * last refetch put in the cache, and a colleague's `+6` landing while this sheet
 * was open would be counted twice — once by them, once by the delta this sheet
 * computed against their new total. Snapshotting turns that into two deltas that
 * both apply, which is the outcome the data layer's comment argues for.
 *
 * ## Why a drawn keypad rather than a `TextInput`
 *
 * This is a phone standing on a counter, often with one hand on it. The OS
 * keyboard on Android covers roughly half the screen — including the number the
 * shopkeeper is trying to check — takes a beat to animate in, and offers a
 * "done" key that is easy to mistake for the save. A keypad drawn in the sheet
 * puts the digits, the ±, the old number and the Save button on screen together,
 * and it cannot produce a minus sign or a decimal point, so the value is valid
 * by construction rather than by validation.
 */

/** What the sheet hands back: both ends of the adjustment, never a bare total. */
export type StockSubmission = { from: number; to: number };

/**
 * A ceiling on what can be typed. Not a business rule — a fat-finger guard, so
 * a stuck key cannot turn twelve into twelve thousand and send a delta nobody
 * meant.
 */
const MAX_STOCK = 99_999;

const STEPS = [-10, -1, 1, 10] as const;

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
  return Math.max(0, Math.min(MAX_STOCK, value));
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
        up ? t("shelf.stock.a11yAdd", { count: by }) : t("shelf.stock.a11yRemove", { count: -by })
      }
      style={{
        flex: 1,
        height: 48,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        borderRadius: theme.radii.md,
        backgroundColor: theme.color.surfaceSunken,
      }}
    >
      <Ionicons name={up ? "add" : "remove"} size={14} color={theme.color.textSecondary} />
      <Text variant="callout" color="textSecondary" tabular>
        {Math.abs(by)}
      </Text>
    </Touchable>
  );
}

export function StockSheet({
  product,
  busy = false,
  error,
  onSubmit,
  onClose,
}: {
  /** Non-null opens the sheet. The object is read once, on the way in. */
  product: ShopProduct | null;
  busy?: boolean;
  error?: string | null;
  onSubmit: (submission: StockSubmission) => void;
  onClose: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();

  const [snapshot, setSnapshot] = React.useState<{ name: string; from: number } | null>(null);
  const [value, setValue] = React.useState(0);
  /** Whether the next digit extends the number or starts a new one. */
  const [typing, setTyping] = React.useState(false);

  // Keyed on the product's id rather than on the object, because the shelf query
  // refetches while this is open and a new object identity for the same product
  // must not reset a half-typed count — nor move `from` out from under it.
  const opened = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!product) {
      opened.current = null;
      return;
    }
    if (opened.current === product.id) return;
    opened.current = product.id;
    setSnapshot({ name: product.name, from: product.stock });
    setValue(product.stock);
    setTyping(false);
  }, [product]);

  const from = snapshot?.from ?? 0;
  const delta = value - from;

  const digit = (d: number) => {
    const next = (typing ? value : 0) * 10 + d;
    if (next > MAX_STOCK) return;
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
    return t("shelf.stock.a11yClear");
  };

  return (
    <Modal
      visible={product !== null}
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
            {t("shelf.setStock")}
          </Text>
          <Text variant="title3" numberOfLines={1} style={{ marginTop: 2 }}>
            {snapshot?.name ?? ""}
          </Text>

          {/* The new count, the old one, and the adjustment that will be sent —
              together, because the request is a delta and a shopkeeper is
              entitled to see the arithmetic being done on their behalf. */}
          <View
            style={{
              marginTop: theme.spacing[4],
              paddingVertical: theme.spacing[4],
              borderRadius: theme.radii.lg,
              backgroundColor: theme.color.surfaceSunken,
              alignItems: "center",
            }}
            accessible
            accessibilityLabel={t("shelf.stock.a11yValue", { count: value })}
          >
            <Text variant="display" tabular>
              {value}
            </Text>
            <Text
              variant="caption"
              color={delta === 0 ? "textMuted" : delta > 0 ? "success" : "danger"}
              style={{ marginTop: 2 }}
            >
              {delta === 0
                ? t("shelf.stock.was", { count: from })
                : delta > 0
                  ? t("shelf.stock.adding", { count: delta, from })
                  : t("shelf.stock.removing", { count: -delta, from })}
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

          {error ? (
            <Text
              variant="footnote"
              color="danger"
              align="center"
              style={{ marginTop: theme.spacing[3] }}
            >
              {error}
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
                onPress={() => onSubmit({ from, to: value })}
                loading={busy}
                // Nothing to send is not an error worth explaining — the line
                // above already says the count is unchanged.
                disabled={delta === 0}
              />
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
