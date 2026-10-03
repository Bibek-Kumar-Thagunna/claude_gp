import * as React from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useSelectedShop } from "@gopasal/native-data/seller";
import {
  useRiderRoster,
  useShopRiders,
  useShopZones,
  type ShopRider,
} from "@gopasal/native-data/seller-delivery";
import { useShopPermissions } from "@gopasal/native-data/seller-team";
import {
  Button,
  Card,
  Confirm,
  ConnectionBanner,
  Skeleton,
  Text,
  theme,
  useT,
} from "@gopasal/native-ui";
import { DeliveryRiderRow } from "../../components/DeliveryRiderRow";
import { DeliveryZoneRow } from "../../components/DeliveryZoneRow";
import { riderAvailability } from "../../components/DeliveryCopy";
import { apiProblemText } from "../../components/SettingsCopy";
import { SettingsHeader } from "../../components/SettingsHeader";
import { SettingsNoAccess } from "../../components/SettingsNoAccess";
import { SettingsNotice } from "../../components/SettingsNotice";

/**
 * Delivery: who rides for the shop, and where beyond the radius it will go.
 *
 * The two halves have different owners and the screen keeps them apart:
 *
 *  - **Riders** are `delivery.view` to see and `delivery.assign` to add or
 *    remove. Their online state belongs to them — it is set in the rider's own
 *    app and moved by the assign and complete transactions — and assignment
 *    refuses a rider who is offline. That is said once, at the top of the
 *    roster, because it is the thing a shopkeeper will otherwise try to fix
 *    from here on a busy evening.
 *  - **Zones** are readable with `delivery.view` and editable only with
 *    `settings.manage`. A delivery teammate sees them and gets no pencil.
 *
 * The radius is the frame for the zones and is stated beside them. Inside it
 * the shop delivers regardless and no zone is consulted; zones only reach
 * *past* it. A zone list without that sentence invites somebody to draw their
 * own street and wonder why nothing changed.
 */

const PERM = {
  view: "delivery.view",
  assign: "delivery.assign",
  zones: "settings.manage",
} as const;

export default function DeliveryScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { shopId, shop, ready } = useSelectedShop();
  const perms = useShopPermissions(shopId);
  const canView = perms.has(PERM.view);
  const canAssign = perms.has(PERM.assign);
  const canEditZones = perms.has(PERM.zones);

  // Not asked for at all without the read grant: a 403 in the query cache is
  // noise, and the no-access state below already says everything.
  const riders = useShopRiders(canView ? shopId : null);
  const zones = useShopZones(canView ? shopId : null);
  const roster = useRiderRoster(shopId);

  const [removing, setRemoving] = React.useState<ShopRider | null>(null);
  const [notice, setNotice] = React.useState<{ tone: "success" | "danger"; text: string } | null>(
    null,
  );

  React.useEffect(() => {
    if (notice?.tone !== "success") return;
    const timer = setTimeout(() => setNotice(null), 6_000);
    return () => clearTimeout(timer);
  }, [notice]);

  const [refreshing, setRefreshing] = React.useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([riders.refetch(), zones.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  if (!ready || !perms.ready) return <Loading />;

  const title = t("delivery.title");

  if (!shop) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.background }}>
        <SettingsHeader title={title} />
        <SettingsNoAccess title={t("shop.choose.title")} detail={t("shop.choose.detail")} />
      </View>
    );
  }

  if (!canView) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.background }}>
        <SettingsHeader title={title} subtitle={shop.name} />
        <SettingsNoAccess
          title={t("delivery.noAccess.title")}
          detail={t("delivery.noAccess.detail")}
          restrictionReason={perms.restricted ? perms.restrictionReason : null}
        />
      </View>
    );
  }

  const riderList = riders.data ?? [];
  const zoneList = zones.data ?? [];

  const counts = riderList.reduce(
    (acc, rider) => {
      const state = riderAvailability(rider, t);
      if (state.assignable) acc.free += 1;
      else if (rider.activeDeliveries > 0 || rider.status === "ON_DELIVERY") acc.busy += 1;
      else acc.offline += 1;
      return acc;
    },
    { free: 0, busy: 0, offline: 0 },
  );

  const confirmRemove = async () => {
    const rider = removing;
    if (!rider) return;
    // Checked again against the freshest roster, not the row that was tapped:
    // a leg may have been assigned to them in the seconds the dialog was open,
    // and the API would refuse the delete anyway.
    const latest = riders.data?.find((r) => r.id === rider.id) ?? rider;
    const name = latest.user.name?.trim() || latest.user.phone;
    if (latest.activeDeliveries > 0) {
      setRemoving(null);
      setNotice({
        tone: "danger",
        text: t("delivery.rider.removeBusy", { name }),
      });
      return;
    }
    try {
      await roster.remove.mutateAsync(latest.id);
      setRemoving(null);
      setNotice({
        tone: "success",
        text: t("delivery.rider.removed", { name }),
      });
    } catch (cause) {
      setRemoving(null);
      setNotice({
        tone: "danger",
        text: apiProblemText(cause, t, [
          {
            match: "active deliveries",
            text: t("delivery.rider.removeBusy", { name }),
          },
        ]),
      });
    }
  };

  const removingName = removing ? removing.user.name?.trim() || removing.user.phone : "";
  const hasPin = shop.lat !== null && shop.lng !== null;

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        {notice ? (
          <Animated.View entering={FadeIn.duration(160)}>
            <SettingsNotice tone={notice.tone}>{notice.text}</SettingsNotice>
          </Animated.View>
        ) : null}

        {/* ── riders ─────────────────────────────────────────────────── */}
        <Card>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: theme.spacing[2] }}>
            <Text variant="title3" style={{ flex: 1 }}>
              {t("shop.riders")}
            </Text>
            {riderList.length > 0 ? (
              <Text variant="caption" color="textMuted">
                {t("delivery.riders.counts", counts)}
              </Text>
            ) : null}
          </View>

          <View style={{ marginTop: theme.spacing[3] }}>
            <SettingsNotice tone="quiet" icon="phone-portrait-outline">
              {t("delivery.riders.onlineNote")}
            </SettingsNotice>
          </View>

          <View style={{ marginTop: theme.spacing[2] }}>
            {riders.isPending ? (
              <View style={{ gap: theme.spacing[2], marginTop: theme.spacing[2] }}>
                {[0, 1].map((i) => (
                  <Skeleton
                    key={i}
                    width="100%"
                    height={48}
                    radius={theme.radii.md}
                    delay={i * 80}
                  />
                ))}
              </View>
            ) : riders.isError ? (
              <Text variant="footnote" color="textMuted" style={{ marginTop: theme.spacing[2] }}>
                {t("shop.riders.failed")}
              </Text>
            ) : riderList.length === 0 ? (
              <Text variant="footnote" color="textMuted" style={{ marginTop: theme.spacing[2] }}>
                {t("delivery.riders.empty")}
              </Text>
            ) : (
              riderList.map((rider, i) => (
                <View
                  key={rider.id}
                  style={
                    i > 0 ? { borderTopWidth: 1, borderTopColor: theme.color.border } : undefined
                  }
                >
                  <DeliveryRiderRow
                    rider={rider}
                    canRemove={canAssign}
                    onRemove={() => {
                      setNotice(null);
                      setRemoving(rider);
                    }}
                  />
                </View>
              ))
            )}
          </View>

          {canAssign ? (
            <Button
              label={t("delivery.rider.add")}
              variant="secondary"
              leading={<Ionicons name="person-add-outline" size={16} color={theme.color.brand} />}
              onPress={() => router.push("/delivery/rider")}
              style={{ marginTop: theme.spacing[3] }}
            />
          ) : null}
        </Card>

        {/* ── zones ──────────────────────────────────────────────────── */}
        <Card>
          <Text variant="title3">{t("delivery.zones.title")}</Text>
          <Text variant="footnote" color="textSecondary" style={{ marginTop: theme.spacing[2] }}>
            {t("delivery.zones.radius", { km: shop.deliveryRadiusKm })}
          </Text>

          {!hasPin ? (
            <View style={{ marginTop: theme.spacing[3] }}>
              <SettingsNotice tone="warning">{t("delivery.zones.noPin")}</SettingsNotice>
            </View>
          ) : null}

          <View style={{ marginTop: theme.spacing[2] }}>
            {zones.isPending ? (
              <Skeleton width="100%" height={64} radius={theme.radii.md} />
            ) : zones.isError ? (
              <Text variant="footnote" color="textMuted" style={{ marginTop: theme.spacing[2] }}>
                {t("delivery.zones.failed")}
              </Text>
            ) : zoneList.length === 0 ? (
              <Text variant="footnote" color="textMuted" style={{ marginTop: theme.spacing[2] }}>
                {t("delivery.zones.empty")}
              </Text>
            ) : (
              zoneList.map((zone, i) => (
                <View
                  key={zone.id}
                  style={
                    i > 0 ? { borderTopWidth: 1, borderTopColor: theme.color.border } : undefined
                  }
                >
                  <DeliveryZoneRow
                    zone={zone}
                    onPress={() =>
                      router.push({ pathname: "/delivery/zone", params: { id: zone.id } })
                    }
                  />
                </View>
              ))
            )}
          </View>

          {zoneList.length > 1 ? (
            <Text variant="caption" color="textFaint" style={{ marginTop: theme.spacing[2] }}>
              {t("delivery.zones.overlap")}
            </Text>
          ) : null}

          {canEditZones ? (
            <Button
              label={t("delivery.zone.new")}
              variant="secondary"
              leading={<Ionicons name="footsteps-outline" size={16} color={theme.color.brand} />}
              onPress={() => router.push("/delivery/zone")}
              style={{ marginTop: theme.spacing[3] }}
            />
          ) : (
            <Text variant="caption" color="textFaint" style={{ marginTop: theme.spacing[3] }}>
              {t("delivery.zones.readOnly")}
            </Text>
          )}
        </Card>
      </ScrollView>

      {/* A hard delete of the roster row, and only of that. The account is a
          person's and outlives the shop's use of it; the message says so,
          because "delete rider" reads as deleting a human. */}
      <Confirm
        visible={removing !== null}
        title={t("delivery.rider.removeTitle", { name: removingName })}
        message={t("delivery.rider.removeDetail")}
        confirmLabel={t("delivery.rider.removeAction")}
        cancelLabel={t("delivery.rider.keep")}
        destructive
        busy={roster.remove.isPending}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoving(null)}
      />
    </View>
  );
}

function Loading() {
  const insets = useSafeAreaInsets();
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
      <Skeleton width="40%" height={24} />
      <Skeleton width="100%" height={180} radius={theme.radii.lg} delay={60} />
      <Skeleton width="100%" height={140} radius={theme.radii.lg} delay={120} />
    </View>
  );
}
