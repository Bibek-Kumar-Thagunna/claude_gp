import * as React from "react";
import { Pressable as RNPressable, type PressableProps, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { springs, timings } from "../motion/motion";
import { theme } from "../theme/theme";

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

/**
 * The press behaviour every tappable thing in the product shares.
 *
 * A native app feels native mostly because touches answer *immediately* and
 * *physically*. Two details do nearly all that work, and both are easy to get
 * subtly wrong:
 *
 *  - **The scale runs on the UI thread.** Reanimated's shared values animate off
 *    the JS thread, so the press still tracks the finger while JavaScript is
 *    busy parsing a response. An `Animated` scale driven from JS stutters at
 *    exactly the moment the user is most attentive — the tap they just made.
 *  - **Haptics fire on press-in, not on press-out.** The tick has to coincide
 *    with the finger landing. Firing it when the action completes reads as a
 *    delayed rumble and people stop trusting it.
 *
 * Scale is modest by design: 0.97 for a card, 0.96 for a button. Anything deeper
 * looks like a toy, and on a 44pt target a deep scale visibly shrinks the thing
 * out from under the thumb.
 */

export type HapticKind = "none" | "selection" | "light" | "medium" | "success" | "warning" | "error";

function fire(kind: HapticKind) {
  // Haptics are a nicety; a device without a motor (or web) must not throw.
  try {
    switch (kind) {
      case "selection":
        void Haptics.selectionAsync();
        break;
      case "light":
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case "medium":
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case "success":
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case "warning":
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case "error":
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      default:
        break;
    }
  } catch {
    /* no haptic engine — silently fine */
  }
}

export type TouchableProps = Omit<PressableProps, "style"> & {
  style?: ViewStyle | ViewStyle[];
  /** How far it shrinks under the finger. */
  scaleTo?: number;
  /** Dim slightly as well — right for list rows, wrong for filled buttons. */
  dim?: boolean;
  haptic?: HapticKind;
  children?: React.ReactNode;
};

export function Touchable({
  style,
  scaleTo = 0.97,
  dim = false,
  haptic = "light",
  disabled,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: TouchableProps) {
  const pressed = useSharedValue(0);

  // Disabled opacity is folded into the *animated* style rather than layered
  // after it. A Reanimated style is applied through a different path from the
  // static ones in the array, and it wins regardless of order — so the obvious
  // `[base, animatedStyle, disabled && { opacity: 0.45 }]` produced a disabled
  // button that still looked fully enabled, because this hook was unconditionally
  // returning `opacity: 1`. Computing both here means there is one opacity and
  // one owner of it.
  const baseOpacity = disabled ? 0.45 : 1;
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(1 - (1 - scaleTo) * pressed.value, springs.press) }],
    opacity: dim
      ? withTiming(baseOpacity * (1 - 0.12 * pressed.value), timings.instant)
      : baseOpacity,
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={theme.hitSlop}
      onPressIn={(e) => {
        pressed.value = 1;
        if (!disabled) fire(haptic);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = 0;
        onPressOut?.(e);
      }}
      style={[style as ViewStyle, animatedStyle]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}

export { fire as haptic };
