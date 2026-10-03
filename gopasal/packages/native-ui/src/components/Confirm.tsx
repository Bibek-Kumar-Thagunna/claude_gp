import * as React from "react";
import { Modal, Pressable, View } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import { Text } from "./Text";
import { Touchable } from "./Pressable";
import { theme } from "../theme/theme";
import { useT } from "../i18n/i18n";

/**
 * "Are you sure?", ours rather than the platform's.
 *
 * `Alert.alert` is the obvious tool and the wrong one here. React Native Web
 * does not implement it, so every destructive confirmation in this app — sign
 * out, cancel an order, close an account — silently did nothing in a browser,
 * and that is also where the review harness drives the app, so those paths
 * could not be tested at all. A dialog we draw ourselves works everywhere, can
 * be driven by a screen reader and by a test, and looks like GoPasal.
 *
 * The destructive action is never the default-looking button, and the way out
 * is always the wider one on the left, because the muscle memory for "tap the
 * big button" should not delete an account.
 */
export function Confirm({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel} statusBarTranslucent>
      <Animated.View
        entering={FadeIn.duration(140)}
        style={{
          flex: 1,
          backgroundColor: "rgba(27,18,32,0.45)",
          alignItems: "center",
          justifyContent: "center",
          padding: theme.spacing[6],
        }}
      >
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <Animated.View
          entering={ZoomIn.duration(180)}
          accessibilityViewIsModal
          style={{
            width: "100%",
            maxWidth: 360,
            borderRadius: theme.radii.xl,
            backgroundColor: theme.color.surface,
            padding: theme.spacing[5],
            ...theme.shadows.lg,
          }}
        >
          <Text variant="title3">{title}</Text>
          {message ? (
            <Text variant="footnote" color="textSecondary" style={{ marginTop: theme.spacing[2] }}>
              {message}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: theme.spacing[3], marginTop: theme.spacing[5] }}>
            <Touchable
              haptic="light"
              onPress={onCancel}
              accessibilityLabel={cancelLabel}
              style={{
                flex: 1.2,
                height: 46,
                borderRadius: theme.radii.lg,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.color.surfaceSunken,
              }}
            >
              <Text variant="callout" color="textSecondary">
                {cancelLabel}
              </Text>
            </Touchable>
            <Touchable
              haptic={destructive ? "warning" : "medium"}
              onPress={onConfirm}
              disabled={busy}
              accessibilityLabel={confirmLabel}
              style={{
                flex: 1,
                height: 46,
                borderRadius: theme.radii.lg,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: destructive ? theme.color.dangerSoft : theme.color.brand,
                opacity: busy ? 0.7 : 1,
              }}
            >
              <Text
                variant="callout"
                style={{ color: destructive ? theme.color.danger : theme.color.onBrand }}
              >
                {busy ? t("common.working", undefined, "Working…") : confirmLabel}
              </Text>
            </Touchable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
