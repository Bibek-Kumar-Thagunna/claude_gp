import * as React from "react";
import { View, type ViewStyle, type DimensionValue } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";
import { palette, theme } from "../theme/theme";
import { useT } from "../i18n/i18n";

/**
 * Loading placeholders.
 *
 * A spinner says "wait"; a skeleton says "here is what is arriving, and roughly
 * how much of it". On the connections this app runs on, that difference decides
 * whether two seconds feels like progress or like a hang — and because the
 * skeleton occupies the same space as the real content, nothing jumps when the
 * data lands. That absence of a jump is most of what people mean by "smooth".
 *
 * The sheen runs on the UI thread, so it keeps moving even while JavaScript is
 * busy parsing the very response it is waiting for. A JS-driven shimmer freezes
 * at exactly the wrong moment and makes a working app look crashed.
 */

export function Skeleton({
  width = "100%",
  height = 14,
  radius = theme.radii.sm,
  /** Staggering a group stops a list of placeholders pulsing in lockstep. */
  delay = 0,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  delay?: number;
  style?: ViewStyle;
}) {
  const t = useT();
  const progress = useSharedValue(0);

  React.useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 1150, easing: Easing.inOut(Easing.quad) }), -1, false),
    );
    return () => cancelAnimation(progress);
  }, [delay, progress]);

  const sheen = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.value * 2 - 1) * 260 }],
  }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={t("ui.loading", undefined, "Loading")}
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: theme.color.skeleton,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <Animated.View style={[{ ...StyleSheetAbsoluteFill, width: 200 }, sheen]}>
        <LinearGradient
          colors={["transparent", palette.white, "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1, opacity: 0.55 }}
        />
      </Animated.View>
    </View>
  );
}

const StyleSheetAbsoluteFill = {
  position: "absolute" as const,
  top: 0,
  bottom: 0,
  left: 0,
};

/**
 * A few lines of text, with the last one short.
 *
 * Real paragraphs do not end flush, and a block of equal-length bars reads as a
 * table. Shortening the final line is a one-line detail that makes the
 * placeholder look like prose.
 */
export function SkeletonText({
  lines = 3,
  lineHeight = 12,
  gap = theme.spacing[2],
  delay = 0,
}: {
  lines?: number;
  lineHeight?: number;
  gap?: number;
  delay?: number;
}) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: lines }, (_, i) => (
        <View key={i}>
          <Skeleton
            height={lineHeight}
            width={i === lines - 1 ? "58%" : "100%"}
            delay={delay + i * 90}
          />
        </View>
      ))}
    </View>
  );
}
