import * as React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, Touchable, palette, theme, useT } from "@gopasal/native-ui";
import { rider } from "../lib/rider-theme";

/**
 * A bottom sheet: scrim, grab handle, title, a scrolling body and a footer that
 * stays above the keyboard. The rider app's two sheets — handing over and
 * reporting a problem — are both "write a sentence, then commit", so the
 * footer is never inside the scroll where the keyboard could hide it.
 */
export function Sheet({
  visible,
  title,
  detail,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  detail?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
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
            accessibilityViewIsModal
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
            <Text variant="title3" accessibilityRole="header">
              {title}
            </Text>
            {detail ? (
              <Text variant="footnote" color="textSecondary" style={{ marginTop: theme.spacing[1] }}>
                {detail}
              </Text>
            ) : null}
            <ScrollView
              style={{ marginTop: theme.spacing[4], flexShrink: 1 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
            <View style={{ marginTop: theme.spacing[4] }}>{footer}</View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

/** Tap-to-fill phrases above a text box. Picking one writes its words; "other" empties the box. */
export function Chips({
  options,
  value,
  onPick,
}: {
  options: { key: string; words: string; own?: boolean }[];
  value: string;
  onPick: (words: string, own: boolean) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] }}>
      {options.map((o) => {
        const picked = !o.own && value.trim() === o.words;
        return (
          <Touchable
            key={o.key}
            haptic="selection"
            onPress={() => onPick(o.own ? "" : o.words, Boolean(o.own))}
            accessibilityLabel={o.words}
            accessibilityState={{ selected: picked }}
            style={{
              paddingHorizontal: theme.spacing[4],
              minHeight: 38,
              paddingVertical: 8,
              justifyContent: "center",
              borderRadius: theme.radii.full,
              borderWidth: 1,
              borderColor: picked ? palette.ink[900] : theme.color.border,
              backgroundColor: picked ? rider.amberSoft : theme.color.surface,
            }}
          >
            <Text variant="callout" color={picked ? "text" : "textSecondary"}>
              {o.words}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
}
