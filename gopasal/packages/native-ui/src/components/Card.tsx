import * as React from "react";
import { View, type ViewStyle } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { theme } from "../theme/theme";
import { stagger } from "../motion/motion";
import { Touchable, type HapticKind } from "./Pressable";

/**
 * The surface everything sits on.
 *
 * `index` is the detail that makes a list feel composed rather than dumped: rows
 * arrive a beat after each other instead of all at once. The stagger is capped
 * in `motion.ts`, so a long list cascades at the top and simply exists further
 * down — a forty-item list where the last row waits two seconds is worse than no
 * animation at all.
 *
 * A card with `onPress` becomes pressable and picks up the shared press
 * physics; without it, it stays a plain `View` so a screen reader is not told
 * about a button that does nothing.
 */
export function Card({
  children,
  onPress,
  index,
  padded = true,
  elevation = "sm",
  haptic = "light",
  style,
  testID,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  /** Position in a list — enables the entrance stagger. */
  index?: number;
  padded?: boolean;
  elevation?: "none" | "xs" | "sm" | "md";
  haptic?: HapticKind;
  style?: ViewStyle;
  testID?: string;
}) {
  const base: ViewStyle = {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    ...(padded ? { padding: theme.spacing[4] } : null),
    ...(theme.shadows[elevation] as ViewStyle),
  };

  const inner = onPress ? (
    <Touchable testID={testID} onPress={onPress} haptic={haptic} scaleTo={0.985} style={[base, style as ViewStyle]}>
      {children}
    </Touchable>
  ) : (
    <View testID={testID} style={[base, style]}>
      {children}
    </View>
  );

  if (index == null) return inner;
  // `withInitialValues` is deliberately not used here. It makes Reanimated build
  // a custom keyframe, and on web that path takes the element out of normal
  // flow — the wrapper measures zero height and the next section draws straight
  // over the list. `FadeInDown` already travels the right distance, and the
  // review harness renders on web, so a builder's animation must not be able to
  // break the layout it is decorating.
  return (
    <Animated.View entering={FadeInDown.delay(stagger(index)).duration(320)}>
      {inner}
    </Animated.View>
  );
}

/** A recessed block inside a card — totals, a note, a search field. */
export function Sunken({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: theme.color.surfaceSunken,
          borderRadius: theme.radii.md,
          padding: theme.spacing[3],
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
