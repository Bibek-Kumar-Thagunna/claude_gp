import * as React from "react";
import { Linking, Platform, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { useGopasal } from "@gopasal/native-data";
import {
  useRiderAvailability,
  useRiderJobs,
  useRiderProfile,
  type VehicleType,
} from "@gopasal/native-data/rider";
import {
  Button,
  Card,
  Confirm,
  ConnectionBanner,
  Text,
  Touchable,
  palette,
  theme,
  useI18n,
} from "@gopasal/native-ui";
import { rider } from "../../lib/rider-theme";
import { stopAllTracking } from "../../lib/tracking";
import { useTrackingState } from "../../lib/tracking-context";

const VEHICLE_ICON: Record<VehicleType, keyof typeof Ionicons.glyphMap> = {
  BICYCLE: "bicycle",
  MOTORBIKE: "speedometer",
  SCOOTER: "speedometer-outline",
  WALK: "walk",
  VAN: "car",
};

/**
 * Me: who I am to the shop, how I get around, whether the shop can see me,
 * the language, and the way out.
 *
 * Signing out goes offline first, so a shop is never left looking at a rider
 * marked available who is no longer signed in anywhere — and it is refused
 * while a job is in hand, for the same reason going offline is.
 */
export default function Profile() {
  const { t, language, setLanguage, languages } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useGopasal();
  const profile = useRiderProfile();
  const jobs = useRiderJobs();
  const availability = useRiderAvailability();
  const { state } = useTrackingState();
  const [confirmOut, setConfirmOut] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);

  const me = profile.data;
  const busy = (jobs.data ?? []).length > 0;
  const name = me?.user.name ?? user?.name ?? "";
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "R";

  const locationText =
    state.kind === "live"
      ? t("profile.location.live")
      : state.kind === "denied"
        ? t("profile.location.denied")
        : state.kind === "needsConsent"
          ? t("profile.location.needsConsent")
          : state.kind === "waiting"
            ? t("tracking.waiting")
            : t("profile.location.off");

  const leave = async () => {
    setLeaving(true);
    try {
      if (me && me.status === "ONLINE") await availability.mutateAsync("OFFLINE").catch(() => undefined);
      await stopAllTracking();
      await signOut();
      router.dismissTo("/auth/phone");
    } finally {
      setLeaving(false);
      setConfirmOut(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing[3],
          paddingHorizontal: theme.spacing[4],
          paddingBottom: theme.spacing[8],
          gap: theme.spacing[4],
        }}
      >
        <Text variant="title1">{t("profile.title")}</Text>

        <Card style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[4] }}>
          <View
            style={{
              width: 58,
              height: 58,
              borderRadius: 29,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: rider.amber,
            }}
          >
            <Text variant="title2" style={{ color: palette.ink[900] }}>
              {initials}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="title3" numberOfLines={1}>
              {name || t("profile.noName")}
            </Text>
            <Text variant="callout" color="textMuted" tabular>
              {me?.user.phone ?? user?.phone ?? ""}
            </Text>
          </View>
        </Card>

        <Card padded={false}>
          <Row
            icon="storefront-outline"
            label={t("profile.shop")}
            value={me?.shop?.name ?? t("jobs.freelance")}
          />
          <Divider />
          <Row
            icon={me ? VEHICLE_ICON[me.vehicleType] : "bicycle"}
            label={t("profile.vehicle")}
            value={me ? t(`vehicle.${me.vehicleType}`) : "—"}
          />
          <Divider />
          <Row
            icon="location-outline"
            label={t("profile.location")}
            value={locationText}
            tone={state.kind === "live" ? "good" : state.kind === "denied" || state.kind === "needsConsent" ? "warn" : undefined}
            onPress={
              state.kind === "denied"
                ? () => void (Platform.OS === "web" ? router.push("/location-consent") : Linking.openSettings())
                : () => router.push("/location-consent")
            }
          />
        </Card>
        <Text variant="caption" color="textMuted" style={{ marginTop: -theme.spacing[2], paddingHorizontal: theme.spacing[1] }}>
          {t("profile.vehicleNote")}
        </Text>

        <Card>
          <Text variant="title3">{t("language.title")}</Text>
          <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
            {t("language.detail")}
          </Text>
          <View style={{ flexDirection: "row", gap: theme.spacing[2], marginTop: theme.spacing[3] }}>
            {languages.map((option) => {
              const on = option.code === language;
              return (
                <Touchable
                  key={option.code}
                  haptic="selection"
                  onPress={() => setLanguage(option.code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t("language.a11y.use", { language: option.english })}
                  style={{
                    flex: 1,
                    paddingVertical: theme.spacing[3],
                    borderRadius: theme.radii.lg,
                    borderWidth: 1,
                    borderColor: on ? palette.ink[900] : theme.color.border,
                    backgroundColor: on ? rider.amberSoft : theme.color.surface,
                    alignItems: "center",
                  }}
                >
                  <Text variant="callout" script={option.code === "np" ? "np" : undefined}>
                    {option.label}
                  </Text>
                </Touchable>
              );
            })}
          </View>
        </Card>

        <View style={{ gap: theme.spacing[2] }}>
          <Button
            label={t("profile.signOut")}
            variant="secondary"
            disabled={busy}
            onPress={() => setConfirmOut(true)}
            leading={<Ionicons name="log-out-outline" size={18} color={theme.color.text} />}
          />
          {busy ? (
            <Text variant="caption" color="textMuted" align="center">
              {t("profile.signOut.busy")}
            </Text>
          ) : null}
        </View>

        <Text variant="caption" color="textFaint" align="center">
          {t("profile.version", { version: Constants.expoConfig?.version ?? "1.0.0" })}
        </Text>
      </ScrollView>

      <Confirm
        visible={confirmOut}
        title={t("profile.signOut.confirm")}
        message={t("profile.signOut.detail")}
        confirmLabel={t("profile.signOut")}
        cancelLabel={t("common.notNow")}
        destructive
        busy={leaving}
        onCancel={() => setConfirmOut(false)}
        onConfirm={() => void leave()}
      />
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  tone,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone?: "good" | "warn";
  onPress?: () => void;
}) {
  const body = (
    <>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 11,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.color.surfaceSunken,
        }}
      >
        <Ionicons name={icon} size={18} color={palette.ink[700]} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="caption" color="textMuted">
          {label}
        </Text>
        <Text
          variant="callout"
          color={tone === "good" ? "success" : tone === "warn" ? "danger" : "text"}
          numberOfLines={2}
        >
          {value}
        </Text>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={theme.color.textFaint} /> : null}
    </>
  );
  const style = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.spacing[3],
    padding: theme.spacing[4],
  };
  return onPress ? (
    <Touchable haptic="light" onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} style={style}>
      {body}
    </Touchable>
  ) : (
    <View style={style}>{body}</View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: theme.color.border, marginLeft: 68 }} />;
}
