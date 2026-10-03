import * as React from "react";
import { ActivityIndicator, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { palette, theme } from "../theme/theme";
import { Text } from "./Text";
import { Touchable, type HapticKind } from "./Pressable";

/**
 * The button.
 *
 * The one behaviour worth calling out is what happens while it is busy. The
 * obvious implementation swaps the label for a spinner, which changes the
 * button's width, which shifts everything around it — on a checkout screen the
 * total jumps sideways at the exact moment the customer is watching it. Here the
 * label stays mounted and fades to transparent while the spinner fades in over
 * it, so the button keeps its geometry and nothing on the screen moves.
 *
 * Disabled and loading are also kept apart. A loading button is *already doing*
 * what was asked and must not be pressed again; a disabled button cannot be used
 * yet and should say why elsewhere on the screen. Both block the press, but they
 * read differently and are announced differently to a screen reader.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const SIZES: Record<ButtonSize, { height: number; padH: number; radius: number; variant: "callout" | "bodyStrong" }> = {
  sm: { height: 38, padH: theme.spacing[4], radius: theme.radii.md, variant: "callout" },
  md: { height: 48, padH: theme.spacing[5], radius: theme.radii.lg, variant: "bodyStrong" },
  lg: { height: 56, padH: theme.spacing[6], radius: theme.radii.lg, variant: "bodyStrong" },
};

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  /** Rendered before the label — an icon, a count badge. */
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  full?: boolean;
  /** Only meaningful with `full={false}`. Defaults to centring. */
  align?: "center" | "start";
  haptic?: HapticKind;
  /**
   * What a screen reader says, when the label alone is not enough.
   *
   * Defaults to the label, which is right for almost every button. It is not
   * right for a button that repeats down a list: five cards each offering
   * "Accept" give a screen-reader user five identical controls and no way to
   * tell which order they are about to take. Those pass the order in here.
   */
  accessibilityLabel?: string;
  style?: ViewStyle;
  testID?: string;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  leading,
  trailing,
  full = true,
  align = "center",
  haptic = "medium",
  accessibilityLabel,
  style,
  testID,
}: ButtonProps) {
  const s = SIZES[size];
  const blocked = disabled || loading;

  const surface: Record<ButtonVariant, ViewStyle> = {
    primary: {},
    secondary: {
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    ghost: { backgroundColor: "transparent" },
    danger: { backgroundColor: theme.color.dangerSoft },
  };

  const labelColor: Record<ButtonVariant, keyof typeof theme.color> = {
    primary: "onBrand",
    secondary: "text",
    ghost: "brand",
    danger: "danger",
  };

  const body = (
    <View
      style={{
        height: s.height,
        paddingHorizontal: s.padH,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: theme.spacing[2],
      }}
    >
      {/* The label never unmounts, so the button cannot change width mid-press. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2], opacity: loading ? 0 : 1 }}>
        {leading}
        <Text variant={s.variant} color={labelColor[variant]} numberOfLines={1}>
          {label}
        </Text>
        {trailing}
      </View>
      {loading && (
        <Animated.View
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(120)}
          style={{ position: "absolute", left: 0, right: 0, alignItems: "center" }}
        >
          <ActivityIndicator
            size="small"
            color={variant === "primary" ? palette.white : theme.color.brand}
          />
        </Animated.View>
      )}
    </View>
  );

  return (
    <Touchable
      testID={testID}
      onPress={blocked ? undefined : onPress}
      disabled={blocked}
      haptic={blocked ? "none" : haptic}
      scaleTo={0.96}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: loading }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        {
          borderRadius: s.radius,
          overflow: "hidden",
          // `full={false}` means "size to the label", not "hug the left edge".
          // Pinning it to flex-start meant every centred empty state — where
          // almost every non-full button in this app lives — drew its button
          // off to one side under centred text. Callers that want it in a row
          // pass `align="start"`.
          alignSelf: full ? "stretch" : align === "start" ? "flex-start" : "center",
          ...(variant === "primary" && !blocked ? theme.shadows.brand : null),
          ...surface[variant],
        },
        style as ViewStyle,
      ]}
    >
      {variant === "primary" ? (
        // A flat fill reads as a coloured rectangle; a short gradient along the
        // brand ramp gives the surface a direction and catches the eye as the
        // primary action without shouting.
        <LinearGradient
          colors={[palette.crimson[500], palette.crimson[600]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {body}
        </LinearGradient>
      ) : (
        body
      )}
    </Touchable>
  );
}
