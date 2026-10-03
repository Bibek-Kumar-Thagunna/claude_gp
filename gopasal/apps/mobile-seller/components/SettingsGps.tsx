import * as React from "react";
import { View } from "react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { Button, Sunken, Text, theme, useT } from "@gopasal/native-ui";

/**
 * The phone's position, watched rather than asked for.
 *
 * Both places that use this — recording the shop pin, and walking a zone's
 * boundary — are done standing still at a spot and waiting for the reading to be
 * good enough. A one-shot `getCurrentPositionAsync` hides that wait behind a
 * spinner and hands back whatever the first fix was, which on a cold GPS under a
 * tin roof is ±60 m. Watching shows the accuracy settling in front of the person
 * holding the phone, so they can decide when to tap — the same judgement
 * `RegisterPin` leaves with the applicant, made continuous.
 *
 * The reading keeps its own timestamp (`capturedAtMs`), because the pin route
 * refuses a reading more than two minutes old measured from *when the satellite
 * fix happened*, not from when the button was pressed.
 */

export type GpsReading = {
  lat: number;
  lng: number;
  /** Metres, rounded, at least 1. Null when the device did not say. */
  accuracyM: number | null;
  capturedAtMs: number;
};

export type GpsProblem = "denied" | "unavailable";

/** Under this a phone reading is as good as it gets; the dot goes green. */
export const GPS_GOOD_M = 20;
/** Over this the reading is usable but worth waiting on; the dot goes amber. */
export const GPS_ROUGH_M = 50;

export function useLiveGps(active: boolean) {
  const [reading, setReading] = React.useState<GpsReading | null>(null);
  const [problem, setProblem] = React.useState<GpsProblem | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (!permission.granted) {
          setProblem("denied");
          return;
        }
        setProblem(null);
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 2_000,
            distanceInterval: 0,
          },
          (position) => {
            const raw = position.coords.accuracy;
            setReading({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracyM:
                typeof raw === "number" && Number.isFinite(raw)
                  ? Math.max(1, Math.round(raw))
                  : null,
              capturedAtMs: position.timestamp,
            });
          },
        );
        // The screen may have gone while permission was being asked for; a
        // watcher nobody is reading keeps the GPS radio on in a pocket.
        if (cancelled) subscription.remove();
      } catch {
        if (!cancelled) setProblem("unavailable");
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [active, attempt]);

  const retry = React.useCallback(() => {
    setProblem(null);
    setAttempt((n) => n + 1);
  }, []);

  return { reading, problem, retry };
}

/**
 * A clock that ticks, for "taken 4 s ago".
 *
 * The age of a reading is what decides whether it can still be used, and it
 * grows while nothing else on the screen changes — so it needs its own render.
 */
export function useNow(intervalMs = 1_000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function gpsTone(accuracyM: number | null): { color: string; background: string } {
  if (accuracyM !== null && accuracyM <= GPS_GOOD_M) {
    return { color: theme.color.success, background: theme.color.successSoft };
  }
  if (accuracyM !== null && accuracyM <= GPS_ROUGH_M) {
    return { color: theme.palette.marigold[600], background: theme.color.warningSoft };
  }
  return { color: theme.color.danger, background: theme.color.dangerSoft };
}

/**
 * The live reading, said in metres, with the one fix for each way it can fail.
 */
export function SettingsGpsStatus({
  reading,
  problem,
  onRetry,
  now,
}: {
  reading: GpsReading | null;
  problem: GpsProblem | null;
  onRetry: () => void;
  now: number;
}) {
  const t = useT();

  if (problem) {
    return (
      <Sunken style={{ gap: theme.spacing[3], backgroundColor: theme.color.dangerSoft }}>
        <View style={{ flexDirection: "row", gap: theme.spacing[3] }}>
          <Ionicons name="navigate-circle-outline" size={18} color={theme.color.danger} />
          <Text variant="caption" style={{ color: theme.color.danger, flex: 1 }}>
            {problem === "denied" ? t("settings.gps.denied") : t("settings.gps.unavailable")}
          </Text>
        </View>
        <Button label={t("common.retry")} variant="secondary" size="sm" onPress={onRetry} />
      </Sunken>
    );
  }

  if (!reading) {
    return (
      <Sunken style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
        <Ionicons name="locate-outline" size={18} color={theme.color.textMuted} />
        <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
          {t("settings.gps.waiting")}
        </Text>
      </Sunken>
    );
  }

  const tone = gpsTone(reading.accuracyM);
  const ageS = Math.max(0, Math.round((now - reading.capturedAtMs) / 1000));

  return (
    <Sunken
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[3],
        backgroundColor: tone.background,
      }}
    >
      <Ionicons name="locate" size={18} color={tone.color} />
      <View
        style={{ flex: 1, minWidth: 0 }}
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={
          reading.accuracyM === null
            ? t("settings.gps.noAccuracy")
            : t("settings.gps.accuracy", { metres: reading.accuracyM })
        }
      >
        <Text variant="callout">
          {reading.accuracyM === null
            ? t("settings.gps.noAccuracy")
            : t("settings.gps.accuracy", { metres: reading.accuracyM })}
        </Text>
        <Text variant="caption" color="textMuted">
          {ageS <= 2 ? t("settings.gps.fresh") : t("settings.gps.age", { seconds: ageS })}
        </Text>
      </View>
    </Sunken>
  );
}
