import * as React from "react";
import { TextInput, View, type KeyboardTypeOptions } from "react-native";
import { Text, fontFamily, theme, useT } from "@gopasal/native-ui";

/**
 * One question on the registration form.
 *
 * Three things make this different from a text box with a label above it, and
 * each of them is about a form filled in on a phone, standing up, over days:
 *
 *  - **The problem is shown under the field, not collected at the bottom.** A
 *    summary of errors after Submit is a list of places to go looking. Here the
 *    field that is wrong says so, where the thumb already is.
 *  - **A reviewer's question outranks a validation message.** If GoPasal handed
 *    the application back asking about this exact field, that is the most
 *    important thing on the screen, and it is shown even when the value is
 *    perfectly well-formed.
 *  - **Nothing blocks typing.** The draft autosaves, so a half-typed phone
 *    number is a normal state, not an error. Problems describe; they never
 *    refuse input.
 */
export function RegisterField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  problem,
  flagged,
  keyboardType,
  autoCapitalize = "sentences",
  multiline = false,
  maxLength,
  accessibilityLabel,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  /** Why the question is being asked, when that is not obvious. */
  hint?: string;
  /** What is wrong with what is typed, already translated. */
  problem?: string | null;
  /** A reviewer asked about this field. Outranks `problem`. */
  flagged?: string | null;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?: boolean;
  maxLength?: number;
  accessibilityLabel?: string;
}) {
  const t = useT();
  const wrong = Boolean(problem);
  const asked = Boolean(flagged);

  return (
    <View style={{ gap: theme.spacing[2] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
        <Text variant="footnote" color="textSecondary" style={{ flex: 1, minWidth: 0 }}>
          {label}
        </Text>
        {asked ? (
          <Text variant="overline" style={{ color: theme.palette.marigold[600] }}>
            {t("register.field.asked")}
          </Text>
        ) : null}
      </View>

      <View
        style={{
          borderRadius: theme.radii.lg,
          borderWidth: 1,
          borderColor: wrong
            ? theme.color.danger
            : asked
              ? theme.palette.marigold[500]
              : theme.color.border,
          backgroundColor: theme.color.surfaceSunken,
          paddingHorizontal: theme.spacing[4],
          paddingVertical: multiline ? theme.spacing[3] : 0,
          minHeight: multiline ? 88 : 50,
          justifyContent: "center",
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.color.textFaint}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          multiline={multiline}
          maxLength={maxLength}
          accessibilityLabel={accessibilityLabel ?? label}
          style={{
            fontFamily: fontFamily.body,
            fontSize: 15,
            lineHeight: multiline ? 21 : undefined,
            color: theme.color.text,
            textAlignVertical: multiline ? "top" : "center",
            minHeight: multiline ? 60 : 48,
          }}
        />
      </View>

      {/* A reviewer's question first: it is the reason the applicant is back on
          this screen at all, and a length warning underneath it is noise. */}
      {asked ? (
        <Text variant="caption" style={{ color: theme.palette.marigold[600] }}>
          {flagged}
        </Text>
      ) : wrong ? (
        <Text variant="caption" style={{ color: theme.color.danger }}>
          {problem}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textFaint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
