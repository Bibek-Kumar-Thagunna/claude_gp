import * as React from "react";
import { TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { previewDiscount, type CouponType } from "@gopasal/native-data/seller-promotions";
import { Sunken, Text, Touchable, fontFamily, theme, useT } from "@gopasal/native-ui";
import { rupees } from "./PromoCopy";

/**
 * The parts of the coupon form that are about money.
 *
 * A coupon that says the wrong thing is *accepted* — `FLAT 50` where `PERCENT
 * 50` was meant is a valid row that quietly halves every basket — and neither
 * number can be changed afterwards. So everything here is built to make the two
 * kinds impossible to mix up: the choice is two large cards with a worked
 * example each, the amount field wears its unit in the same size as the digits,
 * and the example underneath recomputes on every keystroke with the server's
 * own arithmetic.
 */

/** Percentage off, or a fixed amount off. Two cards, never a toggle. */
export function PromoTypePicker({
  value,
  onChange,
  problem,
}: {
  value: CouponType | null;
  onChange: (next: CouponType) => void;
  problem?: string | null;
}) {
  const t = useT();
  const options: { type: CouponType; glyph: string; title: string; example: string }[] = [
    {
      type: "PERCENT",
      glyph: "%",
      title: t("promo.type.percent"),
      example: t("promo.type.percentExample"),
    },
    {
      type: "FLAT",
      glyph: "रु",
      title: t("promo.type.flat"),
      example: t("promo.type.flatExample"),
    },
  ];

  return (
    <View style={{ gap: theme.spacing[2] }}>
      <Text variant="footnote" color="textSecondary">
        {t("promo.type.label")}
      </Text>
      <View style={{ flexDirection: "row", gap: theme.spacing[3] }} accessibilityRole="radiogroup">
        {options.map((option) => {
          const on = option.type === value;
          return (
            <Touchable
              key={option.type}
              haptic="selection"
              onPress={() => onChange(option.type)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${option.title}. ${option.example}`}
              style={{
                flex: 1,
                padding: theme.spacing[3],
                gap: theme.spacing[2],
                borderRadius: theme.radii.lg,
                borderWidth: on ? 2 : 1,
                borderColor: on ? theme.color.brand : theme.color.border,
                backgroundColor: on ? theme.color.brandSoft : theme.color.surface,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text variant="title1" color={on ? "brand" : "textSecondary"}>
                  {option.glyph}
                </Text>
                <Ionicons
                  name={on ? "radio-button-on" : "radio-button-off"}
                  size={18}
                  color={on ? theme.color.brand : theme.color.textFaint}
                />
              </View>
              <Text variant="callout">{option.title}</Text>
              <Text variant="caption" color="textMuted">
                {option.example}
              </Text>
            </Touchable>
          );
        })}
      </View>
      {problem ? (
        <Text variant="caption" style={{ color: theme.color.danger }}>
          {problem}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A number with its unit drawn as large as the number.
 *
 * `%` after, `रु` before — the way each is written on a shop sign — so "10"
 * cannot be read as ten rupees when it is ten percent.
 */
export function PromoAmountField({
  label,
  value,
  onChangeText,
  unit,
  placeholder,
  hint,
  problem,
  warning,
  accessibilityLabel,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  unit: "percent" | "rupees" | "times";
  placeholder?: string;
  hint?: string | null;
  problem?: string | null;
  /** Legal but probably not meant. Shown in amber, never blocks. */
  warning?: string | null;
  accessibilityLabel?: string;
}) {
  const wrong = Boolean(problem);
  const odd = !wrong && Boolean(warning);
  const unitText = unit === "percent" ? "%" : unit === "rupees" ? "रु" : null;

  return (
    <View style={{ gap: theme.spacing[2] }}>
      <Text variant="footnote" color="textSecondary">
        {label}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[2],
          borderRadius: theme.radii.lg,
          borderWidth: 1,
          borderColor: wrong
            ? theme.color.danger
            : odd
              ? theme.palette.marigold[500]
              : theme.color.border,
          backgroundColor: theme.color.surfaceSunken,
          paddingHorizontal: theme.spacing[4],
          minHeight: 54,
        }}
      >
        {unitText && unit === "rupees" ? (
          <Text variant="title2" color="textSecondary">
            {unitText}
          </Text>
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.color.textFaint}
          keyboardType="number-pad"
          autoCorrect={false}
          maxLength={7}
          accessibilityLabel={accessibilityLabel ?? label}
          style={{
            flex: 1,
            fontFamily: fontFamily.display,
            fontSize: 22,
            color: theme.color.text,
            minHeight: 50,
          }}
        />
        {unitText && unit === "percent" ? (
          <Text variant="title2" color="textSecondary">
            {unitText}
          </Text>
        ) : null}
      </View>
      {wrong ? (
        <Text variant="caption" style={{ color: theme.color.danger }}>
          {problem}
        </Text>
      ) : odd ? (
        <Text variant="caption" style={{ color: theme.palette.marigold[600] }}>
          {warning}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textFaint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Where the worked example starts when the coupon has no floor above it. */
export const PROMO_EXAMPLE_ORDER = 800;

/**
 * What this coupon takes off a real order, recomputed as it is typed.
 *
 * `previewDiscount` is the server's `computeDiscount` line for line, so the
 * sentence is the checkout's arithmetic rather than a promise. The first line
 * is always an ordinary order (रु 800, or the coupon's minimum if that is
 * higher, since below it the code does nothing). A second line appears only
 * when a percentage has a limit, at an order big enough for the limit to bite
 * — that is the case the limit exists for, and the one people misjudge.
 */
export function PromoExample({
  type,
  value,
  maxDiscount,
  minOrder,
}: {
  type: CouponType | null;
  value: number | undefined;
  maxDiscount: number | undefined;
  minOrder: number | undefined;
}) {
  const t = useT();
  const ready =
    type !== null &&
    value !== undefined &&
    Number.isInteger(value) &&
    value > 0 &&
    (type === "FLAT" || value <= 100);

  const floor = minOrder !== undefined && Number.isInteger(minOrder) && minOrder > 0 ? minOrder : 0;
  const cap =
    type === "PERCENT" &&
    maxDiscount !== undefined &&
    Number.isInteger(maxDiscount) &&
    maxDiscount > 0
      ? maxDiscount
      : null;

  const lines: string[] = [];
  if (!ready) {
    lines.push(t("promo.example.waiting"));
  } else {
    const coupon = { type, value, maxDiscount: cap };
    const base = Math.max(PROMO_EXAMPLE_ORDER, floor);
    const off = previewDiscount(coupon, base);
    lines.push(
      off >= base
        ? t("promo.example.free", { order: rupees(base) })
        : t("promo.example.line", {
            order: rupees(base),
            off: rupees(off),
            pays: rupees(base - off),
          }),
    );
    if (cap !== null) {
      // An order comfortably past the point where the limit starts to bite,
      // rounded to something that looks like a real bill.
      const bites = Math.ceil((((cap * 100) / value) * 1.5) / 500) * 500;
      const big = Math.max(bites, base + 500);
      lines.push(
        t("promo.example.capped", {
          order: rupees(big),
          cap: rupees(previewDiscount(coupon, big)),
        }),
      );
    }
    if (floor > 0) {
      lines.push(t("promo.example.floor", { min: rupees(floor) }));
    }
  }

  return (
    <Sunken
      style={{ flexDirection: "row", gap: theme.spacing[3], backgroundColor: theme.color.infoSoft }}
    >
      <Ionicons
        name="calculator-outline"
        size={17}
        color={theme.color.info}
        style={{ marginTop: 1 }}
      />
      <View style={{ flex: 1, gap: theme.spacing[1] }} accessibilityLiveRegion="polite">
        {lines.map((line, i) => (
          <Text
            key={i}
            variant={i === 0 ? "callout" : "caption"}
            color={i === 0 ? "text" : "textSecondary"}
          >
            {line}
          </Text>
        ))}
      </View>
    </Sunken>
  );
}

/** A fixed fact about a saved coupon: label, value, padlock. */
export function PromoLockedRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[3],
        paddingVertical: theme.spacing[2],
      }}
      accessibilityLabel={`${label}, ${value}`}
    >
      <Ionicons name="lock-closed" size={13} color={theme.color.textFaint} />
      <Text variant="footnote" color="textMuted" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="callout" style={{ flexShrink: 1 }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
