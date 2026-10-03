import * as React from "react";
import { Switch, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NOTE_MAX, NOTE_MIN } from "@gopasal/native-data/rider";
import { Button, Price, Text, palette, theme, useT } from "@gopasal/native-ui";
import { Chips, Sheet } from "./Sheet";
import { rider } from "../lib/rider-theme";

/**
 * Handing the parcel over.
 *
 * The server wants two things before it will call an order delivered, and the
 * sheet asks for both in the order they happen at the door:
 *
 *  - **Who took it.** A handover note of three characters or more
 *    (`podNote`). It is what the shop reads when a customer later says nothing
 *    came, so the chips are the four real answers — the customer, someone in
 *    the family, the guard or reception, a neighbour — and the box takes the
 *    fifth.
 *  - **The cash, on a cash order.** An explicit switch, off by default, with
 *    the amount written on it. The server refuses a COD delivery without
 *    `codCollected: true`, and the switch is the rider saying so with their
 *    own thumb rather than a default nobody looked at.
 */
export function HandoverSheet({
  visible,
  cash,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  /** Cash to collect; 0 on a prepaid order. */
  cash: number;
  busy: boolean;
  error: string | null;
  onSubmit: (input: { podNote: string; codCollected: boolean }) => void;
  onClose: () => void;
}) {
  const t = useT();
  const box = React.useRef<TextInput>(null);
  const [note, setNote] = React.useState("");
  const [collected, setCollected] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (visible) {
      setNote("");
      setCollected(false);
      setTouched(false);
    }
  }, [visible]);

  const cod = cash > 0;
  const noteOk = note.trim().length >= NOTE_MIN;
  const cashOk = !cod || collected;
  const ready = noteOk && cashOk;

  const options = [
    { key: "customer", words: t("handover.who.customer") },
    { key: "family", words: t("handover.who.family") },
    { key: "guard", words: t("handover.who.guard") },
    { key: "neighbour", words: t("handover.who.neighbour") },
    { key: "other", words: t("handover.who.other"), own: true },
  ];

  const submit = () => {
    setTouched(true);
    if (!ready || busy) return;
    onSubmit({ podNote: note.trim(), codCollected: cod ? collected : false });
  };

  return (
    <Sheet
      visible={visible}
      title={t("handover.title")}
      detail={t("handover.detail")}
      onClose={onClose}
      footer={
        // The cash stays in the footer, never in the scroll: on a small phone
        // with the keyboard up it is the one line that must not be hidden.
        <View style={{ gap: theme.spacing[3] }}>
          {cod ? (
            <View
              style={{
                padding: theme.spacing[3],
                borderRadius: theme.radii.lg,
                borderWidth: 1.5,
                borderColor: collected ? theme.color.success : touched ? theme.color.danger : rider.amberLine,
                backgroundColor: collected ? theme.color.successSoft : rider.amberSoft,
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing[3],
              }}
            >
              <Ionicons
                name={collected ? "checkmark-circle" : "cash-outline"}
                size={26}
                color={collected ? theme.color.success : palette.ink[900]}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="caption" color="textSecondary">
                  {t("handover.cash.label")}
                </Text>
                <Price value={cash} variant="title2" />
              </View>
              <Switch
                value={collected}
                onValueChange={(v) => {
                  setCollected(v);
                  setTouched(false);
                }}
                accessibilityLabel={t("handover.cash.a11y", { amount: cash })}
                trackColor={{ true: theme.color.success, false: palette.ink[300] }}
                thumbColor={palette.white}
              />
            </View>
          ) : (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing[2],
              }}
            >
              <Ionicons name="checkmark-circle" size={18} color={theme.color.success} />
              <Text variant="footnote" color="textSecondary">
                {t("handover.prepaid")}
              </Text>
            </View>
          )}
          {cod && touched && !collected ? (
            <Text variant="caption" color="danger">
              {t("handover.cash.required")}
            </Text>
          ) : null}
          {error ? (
            <Text variant="footnote" color="danger">
              {error}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: theme.spacing[3] }}>
            <Button label={t("common.notNow")} variant="secondary" onPress={onClose} style={{ flex: 1 }} />
            <Button
              label={t("handover.confirm")}
              onPress={submit}
              loading={busy}
              haptic="success"
              testID="handover-confirm"
              style={{ flex: 1.4, opacity: ready ? 1 : 0.6 }}
            />
          </View>
        </View>
      }
    >
      <Text variant="overline" color="textMuted" style={{ marginBottom: theme.spacing[2] }}>
        {t("handover.who")}
      </Text>
      <Chips
        options={options}
        value={note}
        onPick={(words, own) => {
          setNote(words);
          setTouched(false);
          if (own) box.current?.focus();
        }}
      />
      {/* No `fontFamily`: the system face has Devanagari, Inter does not. */}
      <TextInput
        ref={box}
        value={note}
        onChangeText={(next) => {
          setNote(next);
          setTouched(false);
        }}
        placeholder={t("handover.placeholder")}
        placeholderTextColor={theme.color.textFaint}
        accessibilityLabel={t("handover.placeholder")}
        multiline
        maxLength={NOTE_MAX}
        style={{
          marginTop: theme.spacing[3],
          minHeight: 72,
          padding: theme.spacing[3],
          borderRadius: theme.radii.md,
          backgroundColor: theme.color.surfaceSunken,
          color: theme.color.text,
          fontSize: theme.type.body.fontSize,
          lineHeight: theme.type.body.lineHeight,
          textAlignVertical: "top",
        }}
      />
      {touched && !noteOk ? (
        <Text variant="caption" color="danger" style={{ marginTop: theme.spacing[2] }}>
          {t("handover.noteRequired")}
        </Text>
      ) : null}

    </Sheet>
  );
}
