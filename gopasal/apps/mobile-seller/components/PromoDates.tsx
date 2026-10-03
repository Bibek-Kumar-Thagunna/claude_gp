import * as React from "react";
import { View } from "react-native";
import { Text, Touchable, theme, useT } from "@gopasal/native-ui";
import { RegisterField } from "./RegisterField";
import { dateLabel } from "./PromoCopy";

/**
 * When a coupon starts and stops, without a date-picker dependency.
 *
 * Almost every coupon a kirana writes ends "tonight", "in a week", "in a
 * month" or "never", so those are chips and the calendar is a typed
 * `YYYY-MM-DD` for the rest. Dates are the shop's *local* days: a coupon that
 * ends on the 3rd works until midnight on the 3rd where the shop is, and one
 * that starts on the 3rd starts at the first minute of it. That is what a
 * shopkeeper means by the date, and it is what gets turned into the instant the
 * API stores.
 */

export type PromoEnd =
  { kind: "keep" } | { kind: "none" } | { kind: "days"; days: 0 | 7 | 30 } | { kind: "typed" };

export type PromoStart = { kind: "now" } | { kind: "typed" };

/** A real calendar day typed as `YYYY-MM-DD`, at local midnight, or null. */
export function parseTypedDay(text: string): Date | null {
  const m = text.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = new Date(year, month - 1, day);
  // `new Date(2026, 1, 31)` quietly becomes 3 March; a round trip catches it.
  if (at.getFullYear() !== year || at.getMonth() !== month - 1 || at.getDate() !== day) return null;
  return at;
}

function endOfDay(at: Date): Date {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate(), 23, 59, 59, 999);
}

/**
 * The end the form means, as the API wants it.
 *
 * `iso: undefined` means "send nothing" — no end on a new coupon, the current
 * end on an existing one. `bad: true` means a typed date that is not a date,
 * which is this screen's problem to say, before the package's rules ever run.
 */
export function resolveEnd(
  choice: PromoEnd,
  typed: string,
  now: Date = new Date(),
): { iso?: string; bad: boolean } {
  switch (choice.kind) {
    case "keep":
    case "none":
      return { bad: false };
    case "days": {
      const at = new Date(now);
      at.setDate(at.getDate() + choice.days);
      return { iso: endOfDay(at).toISOString(), bad: false };
    }
    case "typed": {
      const day = parseTypedDay(typed);
      return day ? { iso: endOfDay(day).toISOString(), bad: false } : { bad: true };
    }
  }
}

export function resolveStart(choice: PromoStart, typed: string): { iso?: string; bad: boolean } {
  if (choice.kind === "now") return { bad: false };
  const day = parseTypedDay(typed);
  return day ? { iso: day.toISOString(), bad: false } : { bad: true };
}

function Chip({
  label,
  on,
  disabled,
  onPress,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Touchable
      haptic="selection"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected: on, disabled }}
      accessibilityLabel={label}
      style={{
        height: 36,
        paddingHorizontal: theme.spacing[3],
        borderRadius: theme.radii.full,
        borderWidth: 1,
        justifyContent: "center",
        backgroundColor: on ? theme.color.brand : theme.color.surface,
        borderColor: on ? theme.color.brand : theme.color.border,
      }}
    >
      <Text variant="caption" color={on ? "onBrand" : "textSecondary"}>
        {label}
      </Text>
    </Touchable>
  );
}

const same = (a: PromoEnd, b: PromoEnd) =>
  a.kind === b.kind && (a.kind !== "days" || (b.kind === "days" && a.days === b.days));

/**
 * The end of a coupon.
 *
 * `current` is the stored end on an existing coupon. The API can move an end
 * but never remove one, so once a coupon has an end the "No end" chip is shown
 * switched off with that sentence under it — rather than offered and then
 * silently ignored by the server.
 */
export function PromoEndPicker({
  choice,
  typed,
  onChoice,
  onTyped,
  current,
  problem,
  warning,
}: {
  choice: PromoEnd;
  typed: string;
  onChoice: (next: PromoEnd) => void;
  onTyped: (next: string) => void;
  /** An existing coupon's `validTo`; `undefined` on a new coupon. */
  current?: string | null;
  problem?: string | null;
  warning?: string | null;
}) {
  const t = useT();
  const editing = current !== undefined;
  const hasEnd = typeof current === "string";

  const chips: { choice: PromoEnd; label: string; disabled?: boolean }[] = [
    ...(hasEnd
      ? [
          {
            choice: { kind: "keep" } as PromoEnd,
            label: t("promo.end.keep", { date: dateLabel(current) }),
          },
        ]
      : []),
    { choice: { kind: "days", days: 0 }, label: t("promo.end.today") },
    { choice: { kind: "days", days: 7 }, label: t("promo.end.week") },
    { choice: { kind: "days", days: 30 }, label: t("promo.end.month") },
    {
      choice: { kind: "none" },
      label: t("promo.end.none"),
      disabled: hasEnd,
    },
    { choice: { kind: "typed" }, label: t("promo.end.typed") },
  ];

  return (
    <View style={{ gap: theme.spacing[2] }}>
      <Text variant="footnote" color="textSecondary">
        {t("promo.end.label")}
      </Text>
      <View
        style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] }}
        accessibilityRole="radiogroup"
      >
        {chips.map((chip) => (
          <Chip
            key={chip.label}
            label={chip.label}
            on={same(chip.choice, choice)}
            disabled={chip.disabled}
            onPress={() => onChoice(chip.choice)}
          />
        ))}
      </View>
      {choice.kind === "typed" ? (
        <RegisterField
          label={t("promo.end.typedLabel")}
          value={typed}
          onChangeText={onTyped}
          placeholder={t("promo.date.placeholder")}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          maxLength={10}
          problem={problem}
          hint={t("promo.date.hint")}
        />
      ) : problem ? (
        <Text variant="caption" style={{ color: theme.color.danger }}>
          {problem}
        </Text>
      ) : null}
      {!problem && warning ? (
        <Text variant="caption" style={{ color: theme.palette.marigold[600] }}>
          {warning}
        </Text>
      ) : null}
      {hasEnd ? (
        <Text variant="caption" color="textMuted">
          {t("promo.end.cantRemove")}
        </Text>
      ) : editing ? null : (
        <Text variant="caption" color="textFaint">
          {t("promo.end.hint")}
        </Text>
      )}
    </View>
  );
}

export function PromoStartPicker({
  choice,
  typed,
  onChoice,
  onTyped,
  problem,
}: {
  choice: PromoStart;
  typed: string;
  onChoice: (next: PromoStart) => void;
  onTyped: (next: string) => void;
  problem?: string | null;
}) {
  const t = useT();
  return (
    <View style={{ gap: theme.spacing[2] }}>
      <Text variant="footnote" color="textSecondary">
        {t("promo.start.label")}
      </Text>
      <View
        style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] }}
        accessibilityRole="radiogroup"
      >
        <Chip
          label={t("promo.start.now")}
          on={choice.kind === "now"}
          onPress={() => onChoice({ kind: "now" })}
        />
        <Chip
          label={t("promo.start.later")}
          on={choice.kind === "typed"}
          onPress={() => onChoice({ kind: "typed" })}
        />
      </View>
      {choice.kind === "typed" ? (
        <RegisterField
          label={t("promo.start.typedLabel")}
          value={typed}
          onChangeText={onTyped}
          placeholder={t("promo.date.placeholder")}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          maxLength={10}
          problem={problem}
          hint={t("promo.date.hint")}
        />
      ) : null}
    </View>
  );
}
