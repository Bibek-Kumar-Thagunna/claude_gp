import * as React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useSelectedShop } from "@gopasal/native-data/seller";
import { haversineMeters } from "@gopasal/native-data/seller-delivery";
import {
  CAPTURE_ACCURACY_MAX_M,
  captureIssue,
  useShopDetail,
  useShopLocationCapture,
  type CapturedPosition,
  type ShopRow as ShopRecord,
} from "@gopasal/native-data/seller-settings";
import { useShopPermissions } from "@gopasal/native-data/seller-team";
import {
  Button,
  Card,
  Confirm,
  ConnectionBanner,
  Skeleton,
  Text,
  haptic,
  theme,
  useT,
} from "@gopasal/native-ui";
import {
  apiProblemText,
  captureIssueText,
  formatCoordinate,
  formatDistance,
} from "../../components/SettingsCopy";
import { SettingsGpsStatus, useLiveGps, useNow } from "../../components/SettingsGps";
import { SettingsHeader } from "../../components/SettingsHeader";
import { SettingsNoAccess } from "../../components/SettingsNoAccess";
import { SettingsNotice } from "../../components/SettingsNotice";

/**
 * Recording where the shop is, from the phone standing in it.
 *
 * The API has exactly one way to write a shop pin: a short-lived capture link,
 * spent by submitting a fresh GPS reading to it. `UpdateShopDto` has no
 * coordinates on purpose — a pin means "somebody stood there", not "somebody
 * typed two numbers". On the console that takes two devices; here the phone
 * asks for the link in DIRECT mode and spends it itself, in one tap.
 *
 * The screen is arranged around the judgement only the person holding the
 * phone can make: is this reading good enough? So the live accuracy is on
 * screen the whole time, the distance from the pin already stored is shown
 * beside it (a new pin 400 m from the old one is either a move or a mistake,
 * and the shopkeeper knows which), and every refusal the server would give is
 * checked first by `captureIssue` and said with its fix.
 *
 * The link is created at the moment of recording, not when the screen opens:
 * it lives ten minutes and a new one revokes the last, and somebody waiting in
 * a doorway for the number to drop can easily take longer than that.
 *
 * Why it matters is said up front, because it is not obvious: a shop without a
 * recorded location stays hidden from customers even when approved and
 * stocked, and every delivery distance is measured from this point.
 */

function methodLabel(method: string | null, t: ReturnType<typeof useT>): string | null {
  if (method === "DIRECT") return t("settings.location.method.direct");
  if (method === "HANDOFF") return t("settings.location.method.handoff");
  return null;
}

export default function ShopLocationScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();

  const { shopId, shop, ready } = useSelectedShop();
  const perms = useShopPermissions(shopId);
  const canEdit = perms.has("settings.manage");
  const canRead = perms.has("dashboard.view");

  const detail = useShopDetail(canRead ? shopId : null);
  const capture = useShopLocationCapture(shopId);
  const gps = useLiveGps(canEdit);
  const now = useNow();

  const [pending, setPending] = React.useState<CapturedPosition | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [recorded, setRecorded] = React.useState<{
    accuracyM: number | null;
    lat: number | null;
    lng: number | null;
  } | null>(null);

  if (!ready || !perms.ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.color.background,
          paddingTop: insets.top + theme.spacing[5],
          paddingHorizontal: theme.spacing[4],
          gap: theme.spacing[4],
        }}
      >
        <Skeleton width="45%" height={24} />
        <Skeleton width="100%" height={160} radius={theme.radii.lg} delay={60} />
      </View>
    );
  }

  const title = t("settings.location");

  if (!shop || !canEdit) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.background }}>
        <SettingsHeader title={title} subtitle={shop?.name} />
        <SettingsNoAccess
          title={t("settings.location.noAccess")}
          detail={t("settings.noAccess.detail")}
          restrictionReason={perms.restricted ? perms.restrictionReason : null}
        />
      </View>
    );
  }

  const row: ShopRecord = detail.data ?? shop;
  const hasPin = row.lat !== null && row.lng !== null && row.locationCapturedAt !== null;
  const reading = gps.reading;
  const fromPin =
    hasPin && reading
      ? haversineMeters({ lat: row.lat!, lng: row.lng! }, { lat: reading.lat, lng: reading.lng })
      : null;
  const busy = capture.create.isPending || capture.submit.isPending;

  const start = () => {
    setProblem(null);
    setRecorded(null);
    if (!reading) {
      setProblem(t("settings.gps.waiting"));
      return;
    }
    const position: CapturedPosition = {
      lat: reading.lat,
      lng: reading.lng,
      // No figure is treated as no accuracy at all — the API would refuse it,
      // and so does `captureIssue` given NaN.
      accuracyM: reading.accuracyM ?? Number.NaN,
      capturedAtMs: reading.capturedAtMs,
    };
    const issue = captureIssue(position);
    if (issue) {
      haptic("error");
      setProblem(captureIssueText(issue, CAPTURE_ACCURACY_MAX_M, t));
      return;
    }
    setPending(position);
  };

  const record = async () => {
    const position = pending;
    if (!position) return;
    // Checked again: the dialog can sit open past the two-minute window.
    const issue = captureIssue(position);
    if (issue) {
      setPending(null);
      setProblem(captureIssueText(issue, CAPTURE_ACCURACY_MAX_M, t));
      return;
    }
    try {
      await capture.create.mutateAsync("DIRECT");
      const result = await capture.submit.mutateAsync(position);
      haptic("success");
      setPending(null);
      setRecorded(
        "lat" in result
          ? { accuracyM: result.accuracyM, lat: result.lat, lng: result.lng }
          : { accuracyM: null, lat: null, lng: null },
      );
    } catch (cause) {
      haptic("error");
      setPending(null);
      setProblem(
        apiProblemText(cause, t, [
          {
            match: "not fresh",
            text: t("settings.location.issue.stale"),
          },
        ]),
      );
    }
  };

  const capturedDate = row.locationCapturedAt
    ? new Date(row.locationCapturedAt).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const method = methodLabel(row.locationCaptureMethod, t);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
      <SettingsHeader title={title} subtitle={shop.name} />

      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing[4],
          paddingBottom: theme.spacing[10] + insets.bottom,
          gap: theme.spacing[4],
        }}
      >
        <SettingsNotice tone={hasPin ? "info" : "warning"}>
          {t("settings.location.why")}
        </SettingsNotice>

        {recorded ? (
          <Animated.View entering={FadeIn.duration(180)}>
            <SettingsNotice tone="success" title={t("settings.location.done")}>
              <Text variant="caption" color="textSecondary">
                {recorded.accuracyM !== null && recorded.lat !== null && recorded.lng !== null
                  ? t("settings.location.doneDetail", {
                      coords: formatCoordinate(recorded.lat, recorded.lng),
                      metres: recorded.accuracyM,
                    })
                  : t("settings.location.doneReceipt")}
              </Text>
            </SettingsNotice>
          </Animated.View>
        ) : null}

        <Card>
          <Text variant="title3">{t("settings.location.current")}</Text>
          {detail.isPending && canRead ? (
            <Skeleton width="70%" height={18} style={{ marginTop: theme.spacing[3] }} />
          ) : hasPin ? (
            <View style={{ gap: 2, marginTop: theme.spacing[3] }}>
              <Text variant="callout" tabular>
                {formatCoordinate(row.lat!, row.lng!)}
              </Text>
              <Text variant="caption" color="textSecondary">
                {row.locationAccuracyM !== null
                  ? t("settings.location.accuracy", { metres: row.locationAccuracyM })
                  : t("settings.location.accuracyUnknown")}
              </Text>
              {capturedDate ? (
                <Text variant="caption" color="textMuted">
                  {method
                    ? t("settings.location.whenHow", { date: capturedDate, method })
                    : t("settings.location.when", { date: capturedDate })}
                </Text>
              ) : null}
            </View>
          ) : (
            <View
              style={{ flexDirection: "row", gap: theme.spacing[2], marginTop: theme.spacing[3] }}
            >
              <Ionicons name="location-outline" size={16} color={theme.palette.marigold[600]} />
              <Text variant="callout" style={{ flex: 1 }}>
                {t("settings.location.none")}
              </Text>
            </View>
          )}
        </Card>

        <Card>
          <Text variant="title3">{t("settings.location.take")}</Text>
          <Text variant="footnote" color="textSecondary" style={{ marginTop: theme.spacing[2] }}>
            {t("settings.location.how", { max: CAPTURE_ACCURACY_MAX_M })}
          </Text>

          <View style={{ marginTop: theme.spacing[3], gap: theme.spacing[2] }}>
            <SettingsGpsStatus
              reading={reading}
              problem={gps.problem}
              onRetry={gps.retry}
              now={now}
            />
            {fromPin !== null ? (
              <Text variant="caption" color={fromPin > 100 ? "danger" : "textMuted"}>
                {t("settings.location.fromPin", { distance: formatDistance(fromPin, t) })}
              </Text>
            ) : null}
          </View>

          {problem ? (
            <View style={{ marginTop: theme.spacing[3] }}>
              <SettingsNotice tone="danger">{problem}</SettingsNotice>
            </View>
          ) : null}

          <Button
            label={
              hasPin ? t("settings.location.record.again") : t("settings.location.record.first")
            }
            leading={<Ionicons name="navigate-outline" size={16} color={theme.color.onBrand} />}
            loading={busy}
            disabled={!reading}
            onPress={start}
            style={{ marginTop: theme.spacing[4] }}
          />
        </Card>
      </ScrollView>

      {/* Moving the pin moves every delivery distance and the radius with it,
          so the dialog says how far it is moving — the one figure that tells a
          correction from a mistake. */}
      <Confirm
        visible={pending !== null}
        title={hasPin ? t("settings.location.confirmMove") : t("settings.location.confirmFirst")}
        message={
          pending
            ? hasPin && fromPin !== null
              ? t("settings.location.confirmMoveDetail", {
                  distance: formatDistance(
                    haversineMeters({ lat: row.lat!, lng: row.lng! }, pending),
                    t,
                  ),
                  metres: pending.accuracyM,
                  km: row.deliveryRadiusKm,
                })
              : t("settings.location.confirmFirstDetail", {
                  metres: pending.accuracyM,
                  km: row.deliveryRadiusKm,
                })
            : undefined
        }
        confirmLabel={t("settings.location.confirmAction")}
        cancelLabel={t("common.cancel")}
        busy={busy}
        onConfirm={() => void record()}
        onCancel={() => setPending(null)}
      />
    </View>
  );
}
