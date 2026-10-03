import * as React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useSelectedShop } from "@gopasal/native-data/seller";
import {
  riderDraftIssues,
  useRiderRoster,
  useShopRiders,
  type RegisteredRider,
  type VehicleType,
} from "@gopasal/native-data/seller-delivery";
import { useShopPermissions } from "@gopasal/native-data/seller-team";
import {
  Button,
  Card,
  Confirm,
  ConnectionBanner,
  Skeleton,
  Text,
  Touchable,
  haptic,
  theme,
  useT,
} from "@gopasal/native-ui";
import { RegisterField } from "../../components/RegisterField";
import {
  VEHICLES,
  normaliseRiderPhone,
  riderIssueText,
  spacedPhone,
  vehicleLabel,
} from "../../components/DeliveryCopy";
import { apiProblemText } from "../../components/SettingsCopy";
import { SettingsHeader } from "../../components/SettingsHeader";
import { SettingsNoAccess } from "../../components/SettingsNoAccess";
import { SettingsNotice } from "../../components/SettingsNotice";

/**
 * Adding a rider — the one write on this app that reaches outside the shop.
 *
 * `POST …/riders` upserts a `User` by phone number. An unknown number gets a
 * GoPasal account created for it; a known one — a customer, somebody's spouse,
 * a rider who left another shop — has its name overwritten with whatever is
 * typed here. The server does not ask, does not tell the person, and the shop
 * has no route to put the old name back.
 *
 * So the screen is built around one moment: the confirmation. It shows the
 * number *as it will be stored* (normalised here and sent in that form, so the
 * two cannot differ), grouped for reading aloud against the rider's own handset,
 * and says both consequences in plain words. Everything before it exists to
 * make that moment short: the number is checked as it is typed, and if it is
 * already on this shop's roster the screen says so before the dialog, because
 * "add" would then mean "rename".
 *
 * After the save the screen shows what the server stored — name, number,
 * vehicle — rather than what was typed, and stays put so a second rider can be
 * added on a Saturday morning without going back and forth.
 */

export default function AddRiderScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { shopId, shop, ready } = useSelectedShop();
  const perms = useShopPermissions(shopId);
  const canAssign = perms.has("delivery.assign");
  const roster = useRiderRoster(shopId);
  const riders = useShopRiders(canAssign ? shopId : null);

  const [phone, setPhone] = React.useState("");
  const [name, setName] = React.useState("");
  const [vehicle, setVehicle] = React.useState<VehicleType>("MOTORBIKE");
  /** Problems are shown once the shopkeeper has tried to go on, not while typing the first digit. */
  const [attempted, setAttempted] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [added, setAdded] = React.useState<RegisteredRider | null>(null);

  if (!ready || !perms.ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.color.background,
          padding: theme.spacing[4],
          paddingTop: insets.top + theme.spacing[5],
          gap: theme.spacing[4],
        }}
      >
        <Skeleton width="50%" height={24} />
        <Skeleton width="100%" height={220} radius={theme.radii.lg} delay={60} />
      </View>
    );
  }

  const title = t("delivery.rider.add");

  if (!shop || !canAssign) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.background }}>
        <SettingsHeader title={title} subtitle={shop?.name} />
        <SettingsNoAccess
          title={t("delivery.rider.noAccess.title")}
          detail={t("delivery.rider.noAccess.detail")}
          restrictionReason={perms.restricted ? perms.restrictionReason : null}
        />
      </View>
    );
  }

  const issues = riderDraftIssues({ phone, name });
  const phoneIssue = issues.find((i) => i.field === "phone") ?? null;
  const nameIssue = issues.find((i) => i.field === "name") ?? null;
  const normalised = normaliseRiderPhone(phone);
  const trimmedName = name.trim();

  // Somebody already on this roster, found by the number the server will use.
  // Re-registering them is legal and is a rename, so it is said before the
  // confirmation rather than discovered after it.
  const existing =
    normalised !== null
      ? ((riders.data ?? []).find((r) => normaliseRiderPhone(r.user.phone) === normalised) ?? null)
      : null;

  const proceed = () => {
    setAttempted(true);
    setError(null);
    if (issues.length > 0 || normalised === null) {
      haptic("error");
      return;
    }
    setConfirming(true);
  };

  const register = async () => {
    if (normalised === null) return;
    try {
      const row = await roster.register.mutateAsync({
        phone: normalised,
        name: trimmedName,
        vehicleType: vehicle,
      });
      haptic("success");
      setConfirming(false);
      setAdded(row);
      setPhone("");
      setName("");
      setVehicle("MOTORBIKE");
      setAttempted(false);
    } catch (cause) {
      setConfirming(false);
      setError(
        apiProblemText(cause, t, [
          {
            match: "already a rider for another shop",
            text: t("delivery.rider.otherShop"),
          },
        ]),
      );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
      <SettingsHeader title={title} subtitle={shop.name} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            padding: theme.spacing[4],
            paddingBottom: theme.spacing[10] + insets.bottom,
            gap: theme.spacing[4],
          }}
          keyboardShouldPersistTaps="handled"
        >
          {added ? (
            <Animated.View entering={FadeIn.duration(180)}>
              <SettingsNotice
                tone="success"
                title={t("delivery.rider.added", {
                  name: added.user.name ?? spacedPhone(added.user.phone),
                })}
              >
                <Text variant="caption" color="textSecondary">
                  {`${spacedPhone(added.user.phone)} · ${vehicleLabel(added.vehicleType, t)}`}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {t("delivery.rider.addedNext")}
                </Text>
              </SettingsNotice>
            </Animated.View>
          ) : null}

          <SettingsNotice tone="warning" title={t("delivery.rider.warnTitle")}>
            {t("delivery.rider.warn")}
          </SettingsNotice>

          <Card>
            <View style={{ gap: theme.spacing[4] }}>
              <RegisterField
                label={t("delivery.rider.phone")}
                value={phone}
                onChangeText={(next) => {
                  setPhone(next);
                  setAdded(null);
                }}
                placeholder={t("delivery.rider.phonePlaceholder")}
                keyboardType="phone-pad"
                autoCapitalize="none"
                maxLength={20}
                problem={attempted && phoneIssue ? riderIssueText(phoneIssue, phone, t) : null}
                hint={
                  normalised
                    ? t("delivery.rider.phoneWillBe", { phone: spacedPhone(normalised) })
                    : t("delivery.rider.phoneHint")
                }
              />

              <RegisterField
                label={t("delivery.rider.name")}
                value={name}
                onChangeText={(next) => {
                  setName(next);
                  setAdded(null);
                }}
                autoCapitalize="words"
                maxLength={80}
                problem={attempted && nameIssue ? riderIssueText(nameIssue, phone, t) : null}
                hint={t("delivery.rider.nameHint")}
              />

              <View style={{ gap: theme.spacing[2] }}>
                <Text variant="footnote" color="textSecondary">
                  {t("delivery.rider.vehicle")}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] }}>
                  {VEHICLES.map((option) => {
                    const on = option === vehicle;
                    return (
                      <Touchable
                        key={option}
                        haptic="selection"
                        onPress={() => setVehicle(option)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={vehicleLabel(option, t)}
                        style={{
                          paddingHorizontal: theme.spacing[4],
                          paddingVertical: theme.spacing[2],
                          borderRadius: theme.radii.full,
                          borderWidth: 1,
                          borderColor: on ? theme.color.brand : theme.color.border,
                          backgroundColor: on ? theme.color.brandSoft : theme.color.surface,
                        }}
                      >
                        <Text variant="callout" color={on ? "brand" : "textSecondary"}>
                          {vehicleLabel(option, t)}
                        </Text>
                      </Touchable>
                    );
                  })}
                </View>
              </View>
            </View>
          </Card>

          {existing ? (
            <SettingsNotice tone="warning" icon="person-circle-outline">
              {t("delivery.rider.alreadyHere", {
                name: existing.user.name ?? spacedPhone(existing.user.phone),
              })}
            </SettingsNotice>
          ) : null}

          {error ? <SettingsNotice tone="danger">{error}</SettingsNotice> : null}

          <Button
            label={existing ? t("delivery.rider.update") : t("delivery.rider.continue")}
            onPress={proceed}
            loading={roster.register.isPending}
            leading={
              <Ionicons name="shield-checkmark-outline" size={16} color={theme.color.onBrand} />
            }
          />

          {added ? (
            <Button label={t("common.done")} variant="ghost" onPress={() => router.back()} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* The number is shown grouped and in the form it will be stored under.
          The consequence is said twice over on purpose — once as the warning
          above the form, once here — because this is the tap that does it. */}
      <Confirm
        visible={confirming}
        title={
          existing
            ? t("delivery.rider.confirmRename", { name: trimmedName })
            : t("delivery.rider.confirmTitle", { name: trimmedName })
        }
        message={t("delivery.rider.confirmDetail", {
          phone: normalised ? spacedPhone(normalised) : "",
          name: trimmedName,
        })}
        confirmLabel={t("delivery.rider.confirmAction")}
        cancelLabel={t("delivery.rider.confirmCancel")}
        busy={roster.register.isPending}
        onConfirm={() => void register()}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}
