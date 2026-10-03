import * as React from "react";
import { RefreshControl, ScrollView, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  dayTotals,
  useRiderAvailability,
  useRiderHistory,
  useRiderJobs,
  useRiderProfile,
} from "@gopasal/native-data/rider";
import {
  Card,
  ConnectionBanner,
  Price,
  Skeleton,
  Sunken,
  Text,
  Touchable,
  haptic,
  palette,
  theme,
  useT,
} from "@gopasal/native-ui";
import { JobCard } from "../../components/JobCard";
import { rider } from "../../lib/rider-theme";
import { hasConsent } from "../../lib/tracking";
import { useTrackingState } from "../../lib/tracking-context";

/**
 * The rider's home: am I on, what am I carrying, and how is today going.
 *
 * The availability switch is the biggest control on the screen because it is
 * the one a shop depends on — an offline rider cannot be given a job. It cannot
 * be switched off while a job is in hand (the server refuses, and the screen
 * says why before anyone tries). Going online for the first time goes through
 * the location explanation, because a rider the shop cannot see is a rider the
 * customer cannot see coming.
 */
export default function Jobs() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useRiderProfile();
  const jobs = useRiderJobs({ poll: true });
  const history = useRiderHistory();
  const availability = useRiderAvailability();
  const tracking = useTrackingState();

  const me = profile.data;
  const status = me?.status ?? "OFFLINE";
  const online = status !== "OFFLINE";
  const busy = status === "ON_DELIVERY" || (jobs.data ?? []).length > 0;
  const today = dayTotals(history.rows, new Date());
  const firstName = (me?.user.name ?? "").split(" ")[0];

  const toggle = async (next: boolean) => {
    haptic("selection");
    if (next && !(await hasConsent())) {
      router.push("/location-consent");
      return;
    }
    availability.mutate(next ? "ONLINE" : "OFFLINE");
  };

  const refreshing = jobs.isRefetching || profile.isRefetching;

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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void jobs.refetch();
              void profile.refetch();
              void history.refetch();
            }}
          />
        }
      >
        <View>
          <Text variant="caption" color="textMuted">
            {me?.shop ? t("jobs.ridingFor", { shop: me.shop.name }) : t("jobs.freelance")}
          </Text>
          <Text variant="title1">{firstName ? t("jobs.hello", { name: firstName }) : t("jobs.title")}</Text>
        </View>

        {/* availability */}
        <View
          style={{
            borderRadius: theme.radii.xl,
            padding: theme.spacing[4],
            gap: theme.spacing[3],
            backgroundColor: online ? palette.ink[900] : theme.color.surface,
            borderWidth: online ? 0 : 1,
            borderColor: theme.color.border,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: online ? rider.amber : theme.color.surfaceSunken,
              }}
            >
              <Ionicons name={online ? "flash" : "moon"} size={21} color={online ? palette.ink[900] : theme.color.textMuted} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="title3" style={{ color: online ? palette.white : theme.color.text }}>
                {busy
                  ? t("jobs.status.onDelivery")
                  : online
                    ? t("jobs.status.online")
                    : t("jobs.status.offline")}
              </Text>
              <Text variant="caption" style={{ color: online ? palette.ink[300] : theme.color.textMuted }}>
                {busy ? t("jobs.status.busyDetail") : online ? t("jobs.status.onlineDetail") : t("jobs.status.offlineDetail")}
              </Text>
            </View>
            {profile.isPending ? (
              <Skeleton width={50} height={30} radius={15} />
            ) : (
              <Switch
                value={online}
                disabled={busy || availability.isPending}
                onValueChange={(v) => void toggle(v)}
                accessibilityLabel={t("jobs.status.a11y")}
                trackColor={{ true: rider.amber, false: palette.ink[300] }}
                thumbColor={palette.white}
              />
            )}
          </View>
          {online ? <TrackingLine /> : null}
          {availability.error instanceof Error ? (
            <Text variant="caption" style={{ color: online ? palette.marigold[500] : theme.color.danger }}>
              {availability.error.message}
            </Text>
          ) : null}
        </View>

        {/* today */}
        <View style={{ flexDirection: "row", gap: theme.spacing[3] }}>
          <Card style={{ flex: 1, gap: 2 }}>
            <Text variant="caption" color="textMuted">
              {t("jobs.today.delivered")}
            </Text>
            <Text variant="title2" tabular>
              {String(today.delivered)}
            </Text>
          </Card>
          <Card style={{ flex: 1, gap: 2 }}>
            <Text variant="caption" color="textMuted">
              {t("jobs.today.cash")}
            </Text>
            <Price value={today.cash} variant="title2" />
          </Card>
        </View>

        {/* jobs */}
        <View style={{ gap: theme.spacing[3] }}>
          <Text variant="overline" color="textMuted">
            {t("jobs.inHand", { count: (jobs.data ?? []).length })}
          </Text>
          {jobs.isPending ? (
            [0, 1].map((i) => <Skeleton key={i} width="100%" height={150} radius={theme.radii.lg} delay={i * 80} />)
          ) : (jobs.data ?? []).length === 0 ? (
            <Animated.View entering={FadeIn.duration(240)}>
              <Sunken style={{ alignItems: "center", gap: theme.spacing[2], paddingVertical: theme.spacing[8] }}>
                <Ionicons name={online ? "hourglass-outline" : "power-outline"} size={28} color={theme.color.textFaint} />
                <Text variant="bodyStrong">{online ? t("jobs.empty.online") : t("jobs.empty.offline")}</Text>
                <Text variant="footnote" color="textMuted" align="center" style={{ paddingHorizontal: theme.spacing[4] }}>
                  {online ? t("jobs.empty.onlineDetail") : t("jobs.empty.offlineDetail")}
                </Text>
              </Sunken>
            </Animated.View>
          ) : (
            (jobs.data ?? []).map((job, index) => (
              <JobCard
                key={job.id}
                job={job}
                index={index}
                onOpen={() => router.push({ pathname: "/job/[id]", params: { id: job.orderId } })}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** One line under the switch: is the shop seeing where I am? */
function TrackingLine() {
  const t = useT();
  const router = useRouter();
  const { state } = useTrackingState();
  const good = state.kind === "live";
  const text =
    state.kind === "live"
      ? state.accuracy != null
        ? t("tracking.live", { metres: Math.round(state.accuracy) })
        : t("tracking.liveNoAccuracy")
      : state.kind === "waiting"
        ? t("tracking.waiting")
        : state.kind === "denied"
          ? t("tracking.denied")
          : state.kind === "needsConsent"
            ? t("tracking.needsConsent")
            : t("tracking.off");
  const actionable = state.kind === "denied" || state.kind === "needsConsent";

  return (
    <Touchable
      haptic="light"
      disabled={!actionable}
      onPress={() => router.push("/location-consent")}
      accessibilityRole={actionable ? "button" : "text"}
      accessibilityLabel={text}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[2],
        paddingVertical: theme.spacing[2],
        paddingHorizontal: theme.spacing[3],
        borderRadius: theme.radii.md,
        backgroundColor: "rgba(255,255,255,0.08)",
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: good ? theme.color.success : actionable ? palette.marigold[500] : palette.ink[400],
        }}
      />
      <Text variant="caption" style={{ color: palette.ink[200], flex: 1 }}>
        {text}
      </Text>
      {actionable ? <Ionicons name="chevron-forward" size={14} color={palette.ink[300]} /> : null}
    </Touchable>
  );
}
