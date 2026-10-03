import * as React from "react";
import { Linking, Platform, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useRiderAvailability, useRiderProfile } from "@gopasal/native-data/rider";
import { Button, Card, Text, Touchable, haptic, palette, theme, useT } from "@gopasal/native-ui";
import { rider } from "../lib/rider-theme";
import { hasConsent, recordConsent, requestLocation } from "../lib/tracking";
import { useTrackingState } from "../lib/tracking-context";

/**
 * The prominent disclosure, before any location prompt.
 *
 * Google Play requires an app that reads location in the background to say so
 * in its own words — what is collected, why, who sees it, and when it stops —
 * on a screen of its own, *before* the system dialog, with a real way to say
 * no. It is also what a rider is owed: their position goes to a shop and a
 * customer, and they should know exactly when.
 *
 * Agreeing asks for "while using the app" and then "all the time" (the OS
 * insists on two steps), records the choice, and — when the rider came here
 * from the availability switch — puts them online, so the tap that brought
 * them here still does what they meant it to.
 */
export default function LocationConsent() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useRiderProfile();
  const availability = useRiderAvailability();
  const { refresh } = useTrackingState();
  const [busy, setBusy] = React.useState(false);
  const [denied, setDenied] = React.useState(false);
  const [agreed, setAgreed] = React.useState(false);

  React.useEffect(() => {
    void hasConsent().then(setAgreed);
  }, []);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/jobs"));

  const agree = async () => {
    setBusy(true);
    setDenied(false);
    try {
      const granted = await requestLocation();
      if (!granted.foreground) {
        haptic("warning");
        setDenied(true);
        return;
      }
      await recordConsent(true);
      refresh();
      haptic("success");
      if (profile.data?.status === "OFFLINE") {
        await availability.mutateAsync("ONLINE").catch(() => undefined);
      }
      close();
    } finally {
      setBusy(false);
    }
  };

  const points = [
    { icon: "navigate-circle-outline" as const, title: t("consent.what.title"), body: t("consent.what.body") },
    { icon: "people-outline" as const, title: t("consent.who.title"), body: t("consent.who.body") },
    { icon: "time-outline" as const, title: t("consent.when.title"), body: t("consent.when.body") },
    { icon: "power-outline" as const, title: t("consent.stop.title"), body: t("consent.stop.body") },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing[4],
          paddingHorizontal: theme.spacing[5],
          paddingBottom: theme.spacing[6],
          gap: theme.spacing[5],
        }}
      >
        <Touchable
          haptic="light"
          onPress={close}
          accessibilityLabel={t("common.close")}
          style={{
            alignSelf: "flex-end",
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.color.surface,
            borderWidth: 1,
            borderColor: theme.color.border,
          }}
        >
          <Ionicons name="close" size={20} color={theme.color.text} />
        </Touchable>

        <Animated.View entering={FadeInDown.duration(260)} style={{ gap: theme.spacing[3] }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: rider.amber,
            }}
          >
            <Ionicons name="location" size={30} color={palette.ink[900]} />
          </View>
          <Text variant="title1" accessibilityRole="header">
            {t("consent.title")}
          </Text>
          <Text variant="body" color="textSecondary">
            {t("consent.lead")}
          </Text>
        </Animated.View>

        <Card style={{ gap: theme.spacing[4] }}>
          {points.map((p) => (
            <View key={p.title} style={{ flexDirection: "row", gap: theme.spacing[3] }}>
              <Ionicons name={p.icon} size={22} color={rider.amberDeep} style={{ marginTop: 1 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">{p.title}</Text>
                <Text variant="footnote" color="textSecondary">
                  {p.body}
                </Text>
              </View>
            </View>
          ))}
        </Card>

        {Platform.OS === "android" ? (
          <Text variant="footnote" color="textMuted">
            {t("consent.android")}
          </Text>
        ) : Platform.OS === "ios" ? (
          <Text variant="footnote" color="textMuted">
            {t("consent.ios")}
          </Text>
        ) : null}

        {denied ? (
          <Card style={{ gap: theme.spacing[2], borderColor: theme.color.danger, backgroundColor: theme.color.dangerSoft }}>
            <Text variant="bodyStrong">{t("consent.denied.title")}</Text>
            <Text variant="footnote" color="textSecondary">
              {t("consent.denied.body")}
            </Text>
            {Platform.OS !== "web" ? (
              <Button
                label={t("consent.openSettings")}
                variant="secondary"
                size="sm"
                onPress={() => void Linking.openSettings()}
              />
            ) : null}
          </Card>
        ) : null}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: theme.spacing[5],
          paddingTop: theme.spacing[3],
          paddingBottom: insets.bottom + theme.spacing[4],
          gap: theme.spacing[2],
          backgroundColor: theme.color.background,
        }}
      >
        <Touchable
          haptic="medium"
          disabled={busy}
          onPress={() => void agree()}
          accessibilityRole="button"
          accessibilityLabel={agreed ? t("consent.recheck") : t("consent.agree")}
          testID="consent-agree"
          style={{
            height: 56,
            borderRadius: theme.radii.lg,
            backgroundColor: palette.ink[900],
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: theme.spacing[2],
            opacity: busy ? 0.7 : 1,
          }}
        >
          <Ionicons name="location" size={18} color={rider.amber} />
          <Text variant="bodyStrong" style={{ color: palette.white }}>
            {busy ? t("action.working") : agreed ? t("consent.recheck") : t("consent.agree")}
          </Text>
        </Touchable>
        <Button
          label={t("consent.notNow")}
          variant="ghost"
          onPress={close}
        />
      </View>
    </View>
  );
}
