import * as React from "react";
import { TextInput, View } from "react-native";
import { NOTE_MAX, NOTE_MIN } from "@gopasal/native-data/rider";
import { Button, Text, theme, useT } from "@gopasal/native-ui";
import { Chips, Sheet } from "./Sheet";

/**
 * "I can't finish this one."
 *
 * The reason goes to the shop and onto the order's history, so it has to be a
 * sentence. The chips are the real reasons for where the rider is: before
 * pickup the problem is the shop or the bike; after it, the customer or the
 * address.
 *
 * Like the seller's reject sheet it does not commit — it hands the reason back
 * and the screen puts the consequence (the parcel comes back to the shop) in a
 * confirmation first.
 */
export function ProblemSheet({
  visible,
  pickedUp,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  pickedUp: boolean;
  onSubmit: (reason: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const box = React.useRef<TextInput>(null);
  const [reason, setReason] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (visible) {
      setReason("");
      setTouched(false);
    }
  }, [visible]);

  const keys = pickedUp
    ? ["problem.noAnswer", "problem.wrongAddress", "problem.refused", "problem.vehicle"]
    : ["problem.shopNotReady", "problem.vehicle", "problem.tooFar"];
  const options = [
    ...keys.map((key) => ({ key, words: t(key) })),
    { key: "problem.other", words: t("problem.other"), own: true },
  ];
  const ready = reason.trim().length >= NOTE_MIN;

  const submit = () => {
    setTouched(true);
    if (ready) onSubmit(reason.trim());
  };

  return (
    <Sheet
      visible={visible}
      title={t("problem.title")}
      detail={pickedUp ? t("problem.detailCarrying") : t("problem.detailBefore")}
      onClose={onClose}
      footer={
        <View style={{ flexDirection: "row", gap: theme.spacing[3] }}>
          <Button label={t("common.notNow")} variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label={t("common.continue")}
            variant="danger"
            haptic="warning"
            onPress={submit}
            style={{ flex: 1.3, opacity: ready ? 1 : 0.6 }}
          />
        </View>
      }
    >
      <Chips
        options={options}
        value={reason}
        onPick={(words, own) => {
          setReason(words);
          setTouched(false);
          if (own) box.current?.focus();
        }}
      />
      <TextInput
        ref={box}
        value={reason}
        onChangeText={(next) => {
          setReason(next);
          setTouched(false);
        }}
        placeholder={t("problem.placeholder")}
        placeholderTextColor={theme.color.textFaint}
        accessibilityLabel={t("problem.placeholder")}
        multiline
        maxLength={NOTE_MAX}
        style={{
          marginTop: theme.spacing[3],
          minHeight: 80,
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
          {t("problem.required")}
        </Text>
      ) : null}
    </Sheet>
  );
}
