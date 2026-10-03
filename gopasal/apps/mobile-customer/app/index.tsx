import * as React from "react";
import { Dimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  Button,
  ConnectionBanner,
  Logo,
  Text,
  palette,
  springs,
  theme,
  useNetwork,
  useT,
} from "@gopasal/native-ui";

/**
 * Welcome.
 *
 * The first screen has one job — make the next tap obvious — and one constraint:
 * it is also the screen most likely to be seen on a bad connection, because it
 * is where a cold start lands. So the entrance animation is entirely local (no
 * data, nothing to wait for) and the connection banner is free to appear above
 * it without disturbing the composition.
 *
 * The mark breathes rather than spins. A looping spinner on a screen that is not
 * loading anything is a lie; a slow scale of a couple of percent reads as "alive"
 * and costs one UI-thread animation.
 */

const { height: SCREEN_H } = Dimensions.get("window");

function Mark() {
  const breathe = useSharedValue(0);
  const drop = useSharedValue(0);

  React.useEffect(() => {
    // Settle in first, then breathe — sequenced so the two never fight for the
    // same transform on the first frame.
    drop.value = withSpring(1, springs.enter);
    breathe.value = withDelay(
      520,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
  }, [breathe, drop]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: (1 - drop.value) * -18 },
      { scale: 0.86 + drop.value * 0.14 + breathe.value * 0.025 },
    ],
    opacity: drop.value,
  }));

  return (
    <Animated.View style={style}>
      <LinearGradient
        colors={[palette.crimson[400], palette.crimson[600]]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{
          width: 104,
          height: 104,
          borderRadius: 34,
          alignItems: "center",
          justifyContent: "center",
          ...theme.shadows.brand,
        }}
      >
        <Logo size={52} tone="onDark" />
      </LinearGradient>
    </Animated.View>
  );
}

function Point({ icon, title, detail, delay }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; delay: number }) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(420)}
      style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: theme.radii.md,
          backgroundColor: theme.color.brandSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={19} color={theme.color.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="callout" style={{ fontWeight: "700" }}>
          {title}
        </Text>
        <Text variant="footnote" color="textMuted" style={{ marginTop: 1 }}>
          {detail}
        </Text>
      </View>
    </Animated.View>
  );
}

export default function Welcome() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const net = useNetwork();

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      {/* A warm wash behind the mark, so the paper background has somewhere to
          come from rather than being a flat fill.

          It is declared FIRST on purpose. As an absolutely-positioned sibling it
          paints in tree order, so declaring it after the banner covered the
          banner completely — the connection warning was mounted, announced to
          screen readers, and invisible. */}
      <LinearGradient
        colors={[theme.color.brandSoft, theme.color.background]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: SCREEN_H * 0.42 }}
        pointerEvents="none"
      />

      <ConnectionBanner />

      <View
        style={{
          flex: 1,
          paddingHorizontal: theme.spacing[6],
          paddingTop: insets.top + theme.spacing[8],
          paddingBottom: insets.bottom + theme.spacing[6],
        }}
      >
        <View style={{ alignItems: "center" }}>
          <Mark />
          <Animated.View entering={FadeIn.delay(260).duration(500)} style={{ alignItems: "center" }}>
            <Text variant="display" style={{ marginTop: theme.spacing[5] }}>
              GoPasal
            </Text>
            <Text variant="body" color="textMuted" align="center" style={{ marginTop: theme.spacing[2] }}>
              {t("landing.tagline")}
            </Text>
          </Animated.View>
        </View>

        <View style={{ flex: 1, justifyContent: "center", gap: theme.spacing[5], marginTop: theme.spacing[6] }}>
          <Point
            icon="storefront-outline"
            title={t("landing.point.shops.title")}
            detail={t("landing.point.shops.detail")}
            delay={420}
          />
          <Point
            icon="bicycle-outline"
            title={t("landing.point.track.title")}
            detail={t("landing.point.track.detail")}
            delay={520}
          />
          <Point
            icon="wallet-outline"
            title={t("landing.point.pay.title")}
            detail={t("landing.point.pay.detail")}
            delay={620}
          />
        </View>

        <Animated.View entering={FadeInDown.delay(720).duration(420)} style={{ gap: theme.spacing[3] }}>
          <Button
            label={t("landing.getStarted")}
            size="lg"
            onPress={() => router.push("/auth/phone")}
            trailing={<Ionicons name="arrow-forward" size={18} color={palette.white} />}
          />
          <Button
            label={t("landing.browse")}
            variant="ghost"
            size="md"
            haptic="selection"
            onPress={() => router.push("/(tabs)/home")}
          />
          {!net.isConnected && (
            <Text variant="caption" color="textFaint" align="center">
              {t("landing.offline")}
            </Text>
          )}
        </Animated.View>
      </View>
    </View>
  );
}
