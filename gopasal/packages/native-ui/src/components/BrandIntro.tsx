import * as React from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { palette, fontFamily } from "../theme/theme";

/**
 * The first second of the app, after the native splash.
 *
 * The native splash can only show a still image, so it shows exactly the frame
 * this component starts on — the bare mark, centred, on full-bleed brand
 * colour, at the same size. The moment the app has mounted, the native splash
 * is hidden and this takes over without a visible seam: the mark lifts, the
 * wordmark and a line of copy rise in under it, it holds for a beat, and the
 * whole sheet dissolves into the first screen.
 *
 * About a second, once per cold start, and skipped to a plain fade when the
 * phone asks for reduced motion. It never blocks the app from loading
 * underneath: the first screen is already rendering behind it.
 */
const MARK_HEIGHT = 93.6; // splash-icon.png: 512px art, mark at 90% height, drawn at 104dp.
const out = Easing.bezier(0.16, 1, 0.3, 1);

export function BrandIntro({
  background,
  title,
  tagline,
  badge,
  sill,
  ink = palette.white,
  eye = palette.marigold[500],
  badgeColor = palette.crimson[500],
  onShown,
  onDone,
}: {
  background: string;
  title: string;
  tagline: string;
  /** A small label beside the wordmark — "Seller" on the shop app. */
  badge?: string;
  /** Colour of the mark's base line; white on the customer app, crimson on the seller's. */
  sill?: string;
  /** The mark and the words. White on crimson and ink; ink on the rider app's marigold. */
  ink?: string;
  /** The diamond in the window. */
  eye?: string;
  badgeColor?: string;
  /** Called on the first frame — the moment to hide the native splash. */
  onShown?: () => void;
  onDone: () => void;
}) {
  const lift = useSharedValue(0);
  const words = useSharedValue(0);
  const line = useSharedValue(0);
  const leave = useSharedValue(0);

  React.useEffect(() => {
    onShown?.();
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        const finish = () => onDone();
        if (reduce) {
          words.value = 1;
          line.value = 1;
          lift.value = 1;
          leave.value = withDelay(350, withTiming(1, { duration: 200 }, (ok) => ok && runOnJS(finish)()));
          return;
        }
        lift.value = withDelay(120, withTiming(1, { duration: 560, easing: out }));
        words.value = withDelay(260, withTiming(1, { duration: 520, easing: out }));
        line.value = withDelay(420, withTiming(1, { duration: 520, easing: out }));
        leave.value = withDelay(
          1250,
          withTiming(1, { duration: 320, easing: Easing.in(Easing.quad) }, (ok) => ok && runOnJS(finish)()),
        );
      });
    return () => {
      cancelled = true;
    };
    // Runs once: the intro plays on mount and never again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sheet = useAnimatedStyle(() => ({
    opacity: 1 - leave.value,
    transform: [{ scale: 1 + 0.04 * leave.value }],
  }));
  const markStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -44 * lift.value }, { scale: 1 - 0.18 * lift.value }],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: words.value,
    transform: [{ translateY: 36 - 14 * words.value }],
  }));
  const lineStyle = useAnimatedStyle(() => ({
    opacity: line.value * 0.86,
    transform: [{ translateY: 46 - 14 * line.value }],
  }));

  const width = MARK_HEIGHT * (48 / 56);

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: background, zIndex: 100 }, sheet]}
    >
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={markStyle}>
          <Svg width={width} height={MARK_HEIGHT} viewBox="0 0 48 56" fill="none">
            <G>
              <Rect x="3" y="51" width="42" height="5" rx="2" fill={sill ?? ink} />
              <Path
                d="M8 51 L8 22 Q8 19.6 9.6 18 L22.4 5.2 Q24 3.6 25.6 5.2 L38.4 18 Q40 19.6 40 22 L40 51 Z"
                fill="none"
                stroke={ink}
                strokeWidth="3.4"
                strokeLinejoin="round"
              />
              <Path
                d="M24 9 L24 51 M11 31 L37 31"
                stroke={ink}
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <Path d="M24 22 L31 31 L24 40 L17 31 Z" fill={eye} />
              <Circle cx="24" cy="31" r="2.4" fill={ink} />
            </G>
          </Svg>
        </Animated.View>

        <Animated.View
          style={[
            { position: "absolute", top: "50%", flexDirection: "row", alignItems: "center", gap: 8 },
            wordStyle,
          ]}
        >
          <Animated.Text
            style={{
              fontFamily: fontFamily.display,
              fontSize: 40,
              lineHeight: 48,
              letterSpacing: -0.8,
              color: ink,
            }}
          >
            {title}
          </Animated.Text>
          {badge ? (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 8,
                backgroundColor: badgeColor,
                marginTop: 4,
              }}
            >
              <Animated.Text
                style={{
                  fontFamily: fontFamily.bodyBold,
                  fontSize: 12,
                  letterSpacing: 1,
                  color: palette.white,
                }}
              >
                {badge.toUpperCase()}
              </Animated.Text>
            </View>
          ) : null}
        </Animated.View>

        <Animated.Text
          style={[
            {
              position: "absolute",
              top: "50%",
              marginTop: 52,
              fontFamily: fontFamily.body,
              fontSize: 15,
              color: ink,
              textAlign: "center",
              paddingHorizontal: 32,
            },
            lineStyle,
          ]}
        >
          {tagline}
        </Animated.Text>
      </View>
    </Animated.View>
  );
}
