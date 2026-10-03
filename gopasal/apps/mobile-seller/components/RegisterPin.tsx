import * as React from "react";
import { View } from "react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { Button, Sunken, Text, haptic, theme, useT } from "@gopasal/native-ui";

/**
 * Where the shop is, taken by the phone that is standing in it.
 *
 * This is the field that justifies filling the form in on a phone at all. Every
 * other question could be answered from a laptop at home; this one is only
 * honest from the doorway, and the applicant is already there.
 *
 * Two things it refuses to be casual about:
 *
 *  - **Accuracy is shown, in metres, in words.** A coordinate is not a fact by
 *    itself — ±8 m puts a rider at the right shutter, ±2 km puts them in the
 *    wrong ward — and the applicant is the only person who can tell that the
 *    reading is wrong and walk outside to take it again. Hiding the figure
 *    behind a green tick would take that judgement away from the one person
 *    holding it.
 *  - **It says what happens without it.** Without a pin, an approved shop stays
 *    invisible to customers behind `VERIFIED_LOCATION`. An applicant who skips
 *    this because it looked optional finds out weeks later, wondering why it is
 *    so quiet.
 *
 * The API takes the three columns as one fact and refuses a partial pin, so
 * this reports all three or none.
 */

/** Above this the reading is not worth storing; the applicant should retake it. */
const USABLE_ACCURACY_M = 100;
/** Under this a pin is as good as it gets on a phone; say so and stop nagging. */
const GOOD_ACCURACY_M = 25;

export type Pin = { lat: number; lng: number; accuracyM: number };

export function RegisterPin({
  pin,
  onPin,
  disabled = false,
}: {
  pin: Pin | null;
  onPin: (next: Pin) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<"denied" | "unavailable" | "too-rough" | null>(null);

  const take = async () => {
    setProblem(null);
    setBusy(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setProblem("denied");
        return;
      }

      const reading = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const accuracyM = reading.coords.accuracy ?? null;

      // The API's band is 1–100 m, and a reading it would refuse is better
      // caught here — where the applicant can walk outside and try again — than
      // as a 400 after they have moved on.
      if (accuracyM === null || accuracyM > USABLE_ACCURACY_M) {
        setProblem("too-rough");
        return;
      }

      haptic("success");
      onPin({
        lat: reading.coords.latitude,
        lng: reading.coords.longitude,
        accuracyM: Math.max(1, Math.round(accuracyM)),
      });
    } catch {
      setProblem("unavailable");
    } finally {
      setBusy(false);
    }
  };

  const good = pin !== null && pin.accuracyM <= GOOD_ACCURACY_M;

  return (
    <View style={{ gap: theme.spacing[3] }}>
      <View style={{ gap: theme.spacing[1] }}>
        <Text variant="footnote" color="textSecondary">
          {t("register.pin.label")}
        </Text>
        <Text variant="caption" color="textFaint">
          {t("register.pin.why")}
        </Text>
      </View>

      {pin ? (
        <Sunken
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing[3],
            backgroundColor: good ? theme.color.successSoft : theme.color.warningSoft,
          }}
        >
          <Ionicons
            name={good ? "location" : "location-outline"}
            size={18}
            color={good ? theme.color.success : theme.palette.marigold[600]}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="callout">{good ? t("register.pin.good") : t("register.pin.rough")}</Text>
            <Text variant="caption" color="textSecondary">
              {t("register.pin.accuracy", { metres: pin.accuracyM })}
              {good ? "" : t("register.pin.retakeHint")}
            </Text>
          </View>
        </Sunken>
      ) : null}

      {problem ? (
        <Sunken
          style={{
            flexDirection: "row",
            gap: theme.spacing[3],
            backgroundColor: theme.color.dangerSoft,
          }}
        >
          <Ionicons name="alert-circle" size={16} color={theme.color.danger} />
          <Text variant="caption" style={{ color: theme.color.danger, flex: 1 }}>
            {problem === "denied"
              ? t("register.pin.denied")
              : problem === "too-rough"
                ? t("register.pin.tooRough")
                : t("register.pin.unavailable")}
          </Text>
        </Sunken>
      ) : null}

      <Button
        label={pin ? t("register.pin.retake") : t("register.pin.take")}
        variant={pin ? "secondary" : "primary"}
        leading={
          <Ionicons
            name="navigate-outline"
            size={16}
            color={pin ? theme.color.brand : theme.color.onBrand}
          />
        }
        loading={busy}
        disabled={disabled}
        onPress={take}
      />
    </View>
  );
}
