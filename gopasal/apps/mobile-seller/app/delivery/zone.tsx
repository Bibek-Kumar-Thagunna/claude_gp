import * as React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useSelectedShop } from "@gopasal/native-data/seller";
import {
  ZONE_LIMITS,
  haversineMeters,
  parseZonePolygon,
  pointInZone,
  useShopZones,
  useZoneActions,
  zoneDraftIssues,
  zoneForPoint,
  type LatLng,
  type ZoneInput,
} from "@gopasal/native-data/seller-delivery";
import { CAPTURE_ACCURACY_MAX_M } from "@gopasal/native-data/seller-settings";
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
import { DeliveryZoneOutline } from "../../components/DeliveryZoneOutline";
import { ringAreaM2, ringSelfIntersects } from "../../components/DeliveryGeometry";
import { zoneIssueText } from "../../components/DeliveryCopy";
import { apiProblemText, formatDistance } from "../../components/SettingsCopy";
import {
  SettingsGpsStatus,
  gpsTone,
  GPS_ROUGH_M,
  useLiveGps,
  useNow,
} from "../../components/SettingsGps";
import { SettingsHeader } from "../../components/SettingsHeader";
import { SettingsNoAccess } from "../../components/SettingsNoAccess";
import { SettingsNotice } from "../../components/SettingsNotice";

/**
 * Drawing a delivery zone by walking round it.
 *
 * ## Why walking
 *
 * There is no map SDK in this app, and a zone is a polygon. The honest way to
 * get a polygon out of a phone with only GPS is to take it to each corner: the
 * shopkeeper stands at the first corner of the area — the chowk, the college
 * gate — and taps **Add corner**, rides to the next corner along the edge and
 * taps again, and so on round. The outline closes itself from the last corner
 * back to the first, so nobody has to ride back to where they started.
 *
 * Every corner keeps the accuracy it was taken with, because a corner taken at
 * ±60 m under a flyover is the one to retake, and only the person standing
 * there can tell. The live accuracy is always on screen above the button.
 *
 * ## What the screen refuses, and what it only warns about
 *
 * Refused at the tap, because each is a mistake with no upside:
 *  - a reading older than {@link CORNER_MAX_AGE_MS} (GPS has stalled; the
 *    corner would be wherever the phone was a minute ago),
 *  - a reading worse than the API's own 100 m ceiling for a shop pin,
 *  - a corner on top of the previous one (a double tap, or not having moved),
 *  - a corner back at the first one (the outline already closes itself).
 *
 * Warned about, not refused, because the validator is the API and these are
 * judgement: a rough corner, and an outline that crosses itself. The crossing
 * one is worth knowing about — the server's inside test is even-odd, so the
 * parts of a figure-eight where the edges overlap count as *outside*.
 *
 * ## What cannot be edited honestly, and is said so
 *
 *  - **Corners can't be moved.** Without a map there is nothing to drag a
 *    vertex across. Undo takes the last corner off; reshaping the middle means
 *    starting again and walking it.
 *  - **Which zone wins an overlap** is the oldest, by creation date, and there
 *    is no route to reorder zones.
 *  - **Saving replaces the whole zone.** `PATCH` is a replace: every corner and
 *    the fee are sent every time, and an unset fee *clears* a stored one. The
 *    form always holds the whole zone, so this is safe — but it is why the fee
 *    control is explicit about "usual fee" rather than leaving it blank.
 *
 * A walk takes twenty minutes and lives only in this screen, so leaving with
 * unsaved corners asks first — including the hardware back button.
 */

/** A GPS fix older than this is not "here" any more for a corner. */
const CORNER_MAX_AGE_MS = 15_000;
/** Two corners closer than this (or than the fix's accuracy, up to 20 m) are the same corner. */
const SAME_SPOT_MIN_M = 8;
const SAME_SPOT_MAX_M = 20;

type Corner = LatLng & {
  /** Null for a corner that came from the saved zone — the API does not keep it. */
  accuracyM: number | null;
};

type FeeMode = "formula" | "fixed";

type Probe = {
  point: LatLng;
  accuracyM: number | null;
  inside: boolean;
  /** Metres from the shop pin, or null when the shop has no pin. */
  fromShopM: number | null;
  withinRadius: boolean;
  /** An older zone covering the same spot, whose fee would win over this one. */
  olderZone: string | null;
  /** Any other zone covering the spot — what keeps it deliverable if this one doesn't. */
  otherZone: string | null;
};

export default function ZoneScreen() {
  const t = useT();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const zoneId = typeof id === "string" && id.length > 0 ? id : null;

  const { shopId, shop, ready } = useSelectedShop();
  const perms = useShopPermissions(shopId);
  const canView = perms.has("delivery.view");
  const canEdit = perms.has("settings.manage");

  const zones = useShopZones(canView ? shopId : null);
  const actions = useZoneActions(shopId);

  const zoneList = zones.data ?? [];
  const zoneIndex = zoneId ? zoneList.findIndex((z) => z.id === zoneId) : -1;
  const zone = zoneIndex >= 0 ? zoneList[zoneIndex]! : null;

  // ── the draft ──────────────────────────────────────────────────────────
  const [name, setName] = React.useState("");
  const [corners, setCorners] = React.useState<Corner[]>([]);
  const [feeMode, setFeeMode] = React.useState<FeeMode>("formula");
  const [feeText, setFeeText] = React.useState("");
  const [unreadable, setUnreadable] = React.useState(false);
  /** What the draft looked like when it was seeded, to know whether leaving loses anything. */
  const [baseline, setBaseline] = React.useState<string | null>(null);

  // Seeded once, from the zone as the server holds it. A refetch while the
  // shopkeeper is halfway round the block must not put the old corners back.
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (seeded.current) return;
    if (zoneId === null) {
      seeded.current = true;
      setBaseline(snapshot("", [], "formula", ""));
      return;
    }
    if (!zone) return;
    seeded.current = true;
    const polygon = parseZonePolygon(zone.polygon);
    const seededCorners: Corner[] = (polygon ?? []).map((p) => ({ ...p, accuracyM: null }));
    const mode: FeeMode = zone.feeOverride === null ? "formula" : "fixed";
    const fee = zone.feeOverride === null ? "" : String(zone.feeOverride);
    setName(zone.name);
    setCorners(seededCorners);
    setFeeMode(mode);
    setFeeText(fee);
    setUnreadable(polygon === null);
    setBaseline(snapshot(zone.name, seededCorners, mode, fee));
  }, [zoneId, zone]);

  const current = snapshot(name, corners, feeMode, feeText);
  const dirty = baseline !== null && current !== baseline;

  // ── leaving ────────────────────────────────────────────────────────────
  const dirtyRef = React.useRef(dirty);
  dirtyRef.current = dirty;
  const leaving = React.useRef(false);
  type NavAction = Parameters<typeof navigation.dispatch>[0];
  const pendingLeave = React.useRef<NavAction | null>(null);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);

  React.useEffect(() => {
    return navigation.addListener("beforeRemove", (event) => {
      if (leaving.current || !dirtyRef.current) return;
      event.preventDefault();
      pendingLeave.current = event.data.action;
      setConfirmDiscard(true);
    });
  }, [navigation]);

  const leave = () => {
    leaving.current = true;
    router.back();
  };

  // ── GPS ────────────────────────────────────────────────────────────────
  // On from the start for a new zone — the first thing to do is stand at a
  // corner — and on demand for an existing one, where the likelier edit is a
  // name or a fee and the GPS radio has no reason to be running.
  const [gpsWanted, setGpsWanted] = React.useState(zoneId === null);
  const gps = useLiveGps(gpsWanted && canView);
  const now = useNow();

  const [cornerProblem, setCornerProblem] = React.useState<string | null>(null);
  const [probeProblem, setProbeProblem] = React.useState<string | null>(null);
  const [probe, setProbe] = React.useState<Probe | null>(null);
  const [attempted, setAttempted] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [confirmRestart, setConfirmRestart] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  // The probe was a statement about the outline as it was. Any corner change
  // makes it stale, and a stale "inside" is worse than none.
  React.useEffect(() => {
    setProbe(null);
  }, [corners]);

  if (!ready || !perms.ready || (zoneId !== null && zones.isPending)) {
    return <Loading />;
  }

  const title = zoneId ? (zone?.name ?? t("delivery.zone.title")) : t("delivery.zone.newTitle");

  if (!shop || !canView) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.background }}>
        <SettingsHeader title={title} subtitle={shop?.name} />
        <SettingsNoAccess
          title={t("delivery.noAccess.title")}
          detail={t("delivery.noAccess.detail")}
          restrictionReason={perms.restricted ? perms.restrictionReason : null}
        />
      </View>
    );
  }

  if (zoneId !== null && !zone) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.background }}>
        <SettingsHeader title={title} subtitle={shop.name} />
        <SettingsNoAccess
          title={t("delivery.zone.gone")}
          detail={zones.isError ? t("delivery.zones.failed") : t("delivery.zone.goneDetail")}
        />
      </View>
    );
  }

  if (zoneId === null && !canEdit) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.background }}>
        <SettingsHeader title={title} subtitle={shop.name} />
        <SettingsNoAccess
          title={t("delivery.zone.noEdit")}
          detail={t("delivery.zones.readOnly")}
          restrictionReason={perms.restricted ? perms.restrictionReason : null}
        />
      </View>
    );
  }

  // ── derived ────────────────────────────────────────────────────────────
  const polygon: LatLng[] = corners.map(({ lat, lng }) => ({ lat, lng }));
  const feeOverride =
    feeMode === "fixed" ? (feeText.trim() === "" ? Number.NaN : Number(feeText)) : undefined;
  const issues = zoneDraftIssues({ name, polygon, feeOverride });
  const crosses = ringSelfIntersects(polygon);
  const areaKm2 = ringAreaM2(polygon) / 1_000_000;
  const shopPin =
    shop.lat !== null && shop.lng !== null
      ? { lat: shop.lat, lng: shop.lng, radiusKm: shop.deliveryRadiusKm }
      : null;
  const olderZones = zoneId ? zoneList.slice(0, Math.max(0, zoneIndex)) : zoneList;
  const issueFor = (field: "name" | "polygon" | "feeOverride") => {
    const hit = issues.find((i) => i.field === field);
    return hit ? zoneIssueText(hit, { name, polygon }, t) : null;
  };

  // ── actions ────────────────────────────────────────────────────────────
  const addCorner = () => {
    setCornerProblem(null);
    const reading = gps.reading;
    const refuse = (text: string) => {
      haptic("error");
      setCornerProblem(text);
    };
    if (!reading) {
      return refuse(t("delivery.corner.noFix"));
    }
    if (now - reading.capturedAtMs > CORNER_MAX_AGE_MS) {
      return refuse(t("delivery.corner.stale"));
    }
    if (reading.accuracyM === null || reading.accuracyM > CAPTURE_ACCURACY_MAX_M) {
      return refuse(t("delivery.corner.rough", { max: CAPTURE_ACCURACY_MAX_M }));
    }
    if (corners.length >= ZONE_LIMITS.pointsMax) {
      return refuse(t("delivery.corner.full", { max: ZONE_LIMITS.pointsMax }));
    }
    const here: LatLng = { lat: reading.lat, lng: reading.lng };
    const sameSpot = Math.max(SAME_SPOT_MIN_M, Math.min(reading.accuracyM, SAME_SPOT_MAX_M));
    const previous = corners[corners.length - 1];
    if (previous && haversineMeters(previous, here) < sameSpot) {
      return refuse(t("delivery.corner.same", { n: corners.length }));
    }
    const first = corners[0];
    if (first && corners.length >= 3 && haversineMeters(first, here) < sameSpot) {
      return refuse(t("delivery.corner.closed"));
    }
    haptic("success");
    setCorners((list) => [...list, { ...here, accuracyM: reading.accuracyM }]);
  };

  const undoCorner = () => {
    setCornerProblem(null);
    setCorners((list) => list.slice(0, -1));
  };

  const checkSpot = () => {
    const reading = gps.reading;
    setProbeProblem(null);
    if (!reading || now - reading.capturedAtMs > CORNER_MAX_AGE_MS) {
      setGpsWanted(true);
      setProbeProblem(t("delivery.check.noFix"));
      return;
    }
    const point: LatLng = { lat: reading.lat, lng: reading.lng };
    const fromShopM = shopPin ? haversineMeters(shopPin, point) : null;
    const older = zoneForPoint(olderZones, point);
    const other = zoneForPoint(
      zoneList.filter((z) => z.id !== zoneId),
      point,
    );
    setProbe({
      point,
      accuracyM: reading.accuracyM,
      inside: pointInZone(point, polygon),
      fromShopM,
      withinRadius: fromShopM !== null && shopPin !== null && fromShopM <= shopPin.radiusKm * 1000,
      olderZone: older ? older.name : null,
      otherZone: other ? other.name : null,
    });
  };

  const save = async () => {
    setAttempted(true);
    setSaveError(null);
    if (issues.length > 0) {
      haptic("error");
      return;
    }
    // The whole zone, every time: PATCH is a replace, and a missing
    // `feeOverride` clears the stored one.
    const input: ZoneInput = { name: name.trim(), polygon };
    if (feeMode === "fixed" && feeOverride !== undefined) input.feeOverride = feeOverride;
    try {
      if (zoneId) await actions.update.mutateAsync({ zoneId, zone: input });
      else await actions.create.mutateAsync(input);
      haptic("success");
      leave();
    } catch (cause) {
      setSaveError(
        apiProblemText(cause, t, [
          {
            match: "at least 3 points",
            text: t("delivery.zone.issue.fewPoints", {
              min: ZONE_LIMITS.pointsMin,
              count: polygon.length,
            }),
          },
        ]),
      );
    }
  };

  const remove = async () => {
    if (!zoneId) return;
    try {
      await actions.remove.mutateAsync(zoneId);
      setConfirmDelete(false);
      leave();
    } catch (cause) {
      setConfirmDelete(false);
      setSaveError(apiProblemText(cause, t));
    }
  };

  const saving = actions.create.isPending || actions.update.isPending;

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
      <SettingsHeader
        title={title}
        subtitle={shop.name}
        trailing={
          canEdit && dirty ? (
            <Text variant="caption" color="textMuted">
              {t("delivery.zone.unsaved")}
            </Text>
          ) : null
        }
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            padding: theme.spacing[4],
            paddingBottom: theme.spacing[6],
            gap: theme.spacing[4],
          }}
          keyboardShouldPersistTaps="handled"
        >
          {unreadable ? (
            <SettingsNotice tone="warning">{t("delivery.zone.unreadableDetail")}</SettingsNotice>
          ) : null}

          {!canEdit ? (
            <SettingsNotice tone="quiet">{t("delivery.zones.readOnly")}</SettingsNotice>
          ) : null}

          {saveError ? <SettingsNotice tone="danger">{saveError}</SettingsNotice> : null}

          {/* ── name and fee ─────────────────────────────────────────── */}
          <Card>
            {canEdit ? (
              <View style={{ gap: theme.spacing[4] }}>
                <RegisterField
                  label={t("delivery.zone.name")}
                  value={name}
                  onChangeText={setName}
                  placeholder={t("delivery.zone.namePlaceholder")}
                  maxLength={ZONE_LIMITS.nameMax + 20}
                  problem={attempted ? issueFor("name") : null}
                />

                <View style={{ gap: theme.spacing[2] }}>
                  <Text variant="footnote" color="textSecondary">
                    {t("delivery.zone.fee")}
                  </Text>
                  <View style={{ flexDirection: "row", gap: theme.spacing[2] }}>
                    <Choice
                      label={t("delivery.zone.feeFormula")}
                      on={feeMode === "formula"}
                      onPress={() => setFeeMode("formula")}
                    />
                    <Choice
                      label={t("delivery.zone.feeFixedChoice")}
                      on={feeMode === "fixed"}
                      onPress={() => setFeeMode("fixed")}
                    />
                  </View>
                  {feeMode === "fixed" ? (
                    <RegisterField
                      label={t("delivery.zone.feeAmount")}
                      value={feeText}
                      onChangeText={(next) => setFeeText(next.replace(/\D/g, ""))}
                      keyboardType="number-pad"
                      maxLength={6}
                      placeholder="40"
                      problem={attempted ? issueFor("feeOverride") : null}
                    />
                  ) : (
                    <Text variant="caption" color="textFaint">
                      {t("delivery.zone.feeFormulaHint")}
                    </Text>
                  )}
                </View>
              </View>
            ) : (
              <View style={{ gap: theme.spacing[1] }}>
                <Text variant="title3">{name}</Text>
                <Text variant="footnote" color="textSecondary">
                  {feeMode === "formula"
                    ? t("delivery.zone.feeFormula")
                    : feeText === "0"
                      ? t("delivery.zone.feeFree")
                      : t("delivery.zone.feeFixed", { amount: feeText })}
                </Text>
              </View>
            )}
          </Card>

          {/* ── the boundary ─────────────────────────────────────────── */}
          <Card>
            <Text variant="title3">{t("delivery.zone.boundary")}</Text>
            {canEdit ? (
              <Text
                variant="footnote"
                color="textSecondary"
                style={{ marginTop: theme.spacing[2] }}
              >
                {t("delivery.zone.howTo")}
              </Text>
            ) : null}

            <View style={{ marginTop: theme.spacing[3] }}>
              <DeliveryZoneOutline
                points={polygon}
                shop={shopPin}
                probe={probe ? { point: probe.point, inside: probe.inside } : null}
              />
            </View>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: theme.spacing[3],
                marginTop: theme.spacing[2],
              }}
            >
              <Text variant="caption" color="textMuted">
                {t("delivery.zone.cornerCount", {
                  count: corners.length,
                  max: ZONE_LIMITS.pointsMax,
                })}
              </Text>
              {corners.length >= 3 ? (
                <Text variant="caption" color="textMuted">
                  {t("delivery.zone.area", { area: areaKm2 < 0.01 ? "<0.01" : areaKm2.toFixed(2) })}
                </Text>
              ) : null}
              {shopPin ? (
                <Text variant="caption" color="info">
                  {t("delivery.zone.legend", { km: shopPin.radiusKm })}
                </Text>
              ) : null}
            </View>

            {crosses ? (
              <View style={{ marginTop: theme.spacing[3] }}>
                <SettingsNotice tone="warning">{t("delivery.zone.crosses")}</SettingsNotice>
              </View>
            ) : null}

            {attempted && issueFor("polygon") ? (
              <Text
                variant="caption"
                style={{ color: theme.color.danger, marginTop: theme.spacing[2] }}
              >
                {issueFor("polygon")}
              </Text>
            ) : null}

            {corners.length > 0 ? (
              <View style={{ marginTop: theme.spacing[3] }}>
                {corners.map((corner, i) => (
                  <CornerRow
                    key={`${corner.lat},${corner.lng},${i}`}
                    corner={corner}
                    index={i}
                    previous={corners[i - 1] ?? null}
                  />
                ))}
              </View>
            ) : null}

            {canEdit && corners.length > 0 ? (
              <View
                style={{ flexDirection: "row", gap: theme.spacing[2], marginTop: theme.spacing[3] }}
              >
                <View style={{ flex: 1 }}>
                  <Button
                    label={t("delivery.corner.undo", { n: corners.length })}
                    variant="secondary"
                    size="sm"
                    leading={
                      <Ionicons name="arrow-undo-outline" size={15} color={theme.color.brand} />
                    }
                    onPress={undoCorner}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label={t("delivery.corner.restart")}
                    variant="ghost"
                    size="sm"
                    onPress={() => setConfirmRestart(true)}
                  />
                </View>
              </View>
            ) : null}

            {canEdit ? (
              <Text variant="caption" color="textFaint" style={{ marginTop: theme.spacing[3] }}>
                {t("delivery.zone.cantMove")}
              </Text>
            ) : null}
          </Card>

          {/* ── check a spot ─────────────────────────────────────────── */}
          <Card>
            <Text variant="title3">{t("delivery.check.title")}</Text>
            <Text variant="footnote" color="textSecondary" style={{ marginTop: theme.spacing[2] }}>
              {t("delivery.check.detail")}
            </Text>
            {probe ? <ProbeResult probe={probe} radiusKm={shop.deliveryRadiusKm} /> : null}
            {probeProblem ? (
              <Text
                variant="caption"
                style={{ color: theme.color.danger, marginTop: theme.spacing[3] }}
              >
                {probeProblem}
              </Text>
            ) : null}
            {gpsWanted && !canEdit ? (
              <View style={{ marginTop: theme.spacing[3] }}>
                <SettingsGpsStatus
                  reading={gps.reading}
                  problem={gps.problem}
                  onRetry={gps.retry}
                  now={now}
                />
              </View>
            ) : null}
            <Button
              label={!gpsWanted ? t("delivery.check.start") : t("delivery.check.action")}
              variant="secondary"
              leading={<Ionicons name="locate-outline" size={16} color={theme.color.brand} />}
              disabled={polygon.length < 3 && gpsWanted}
              onPress={() => (gpsWanted ? checkSpot() : setGpsWanted(true))}
              style={{ marginTop: theme.spacing[3] }}
            />
            {polygon.length < 3 ? (
              <Text variant="caption" color="textFaint" style={{ marginTop: theme.spacing[2] }}>
                {t("delivery.check.needCorners")}
              </Text>
            ) : null}
          </Card>

          {/* ── what the phone can't change ──────────────────────────── */}
          <Card>
            <Text variant="callout">{t("delivery.zone.limitsTitle")}</Text>
            <View style={{ gap: theme.spacing[2], marginTop: theme.spacing[2] }}>
              <Text variant="caption" color="textSecondary">
                {t("delivery.zone.limitRadius", { km: shop.deliveryRadiusKm })}
              </Text>
              <Text variant="caption" color="textSecondary">
                {t("delivery.zone.limitOverlap")}
              </Text>
              <Text variant="caption" color="textSecondary">
                {t("delivery.zone.limitOrders")}
              </Text>
            </View>
          </Card>

          {canEdit && zoneId ? (
            <Button
              label={t("delivery.zone.delete")}
              variant="danger"
              onPress={() => setConfirmDelete(true)}
            />
          ) : null}
        </ScrollView>

        {/* The two buttons a walking thumb needs, where it can reach them
            without scrolling: add the corner I'm standing on, and save. The
            live accuracy sits right above them because it is what decides
            whether to tap yet. */}
        {canEdit ? (
          <View
            style={{
              paddingHorizontal: theme.spacing[4],
              paddingTop: theme.spacing[3],
              paddingBottom: insets.bottom + theme.spacing[3],
              gap: theme.spacing[2],
              backgroundColor: theme.color.surface,
              borderTopWidth: 1,
              borderTopColor: theme.color.border,
            }}
          >
            {gpsWanted ? (
              <SettingsGpsStatus
                reading={gps.reading}
                problem={gps.problem}
                onRetry={gps.retry}
                now={now}
              />
            ) : null}
            {cornerProblem ? (
              <Animated.View entering={FadeIn.duration(140)}>
                <Text variant="caption" style={{ color: theme.color.danger }}>
                  {cornerProblem}
                </Text>
              </Animated.View>
            ) : null}
            <View style={{ flexDirection: "row", gap: theme.spacing[3] }}>
              <View style={{ flex: 1.4 }}>
                <Button
                  label={
                    gpsWanted
                      ? t("delivery.corner.add", { n: corners.length + 1 })
                      : t("delivery.corner.startGps")
                  }
                  leading={
                    <Ionicons name="add-circle-outline" size={17} color={theme.color.onBrand} />
                  }
                  haptic="none"
                  disabled={corners.length >= ZONE_LIMITS.pointsMax}
                  onPress={() => (gpsWanted ? addCorner() : setGpsWanted(true))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={saving ? t("common.saving") : t("common.save")}
                  variant="secondary"
                  loading={saving}
                  disabled={!dirty}
                  onPress={() => void save()}
                />
              </View>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <Confirm
        visible={confirmDiscard}
        title={t("delivery.zone.discardTitle")}
        message={t("delivery.zone.discardDetail")}
        confirmLabel={t("delivery.zone.discard")}
        cancelLabel={t("delivery.zone.stay")}
        destructive
        onConfirm={() => {
          setConfirmDiscard(false);
          leaving.current = true;
          const action = pendingLeave.current;
          pendingLeave.current = null;
          if (action) navigation.dispatch(action);
          else router.back();
        }}
        onCancel={() => {
          pendingLeave.current = null;
          setConfirmDiscard(false);
        }}
      />

      <Confirm
        visible={confirmRestart}
        title={t("delivery.corner.restartTitle")}
        message={t("delivery.corner.restartDetail")}
        confirmLabel={t("delivery.corner.restartAction")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => {
          setConfirmRestart(false);
          setCornerProblem(null);
          setCorners([]);
          setGpsWanted(true);
        }}
        onCancel={() => setConfirmRestart(false)}
      />

      {/* The consequence is not "a zone is gone" but what stops working:
          addresses only this zone reached, beyond the radius, can no longer
          order. And the outline is not recoverable — it has to be walked. */}
      <Confirm
        visible={confirmDelete}
        title={t("delivery.zone.deleteTitle", { name: zone?.name ?? name })}
        message={t("delivery.zone.deleteDetail", { km: shop.deliveryRadiusKm })}
        confirmLabel={t("delivery.zone.deleteAction")}
        cancelLabel={t("delivery.zone.keep")}
        destructive
        busy={actions.remove.isPending}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </View>
  );
}

/** A stable string for "has anything changed since seeding". */
function snapshot(
  name: string,
  corners: readonly Corner[],
  feeMode: FeeMode,
  feeText: string,
): string {
  return JSON.stringify([
    name,
    corners.map((c) => [c.lat, c.lng]),
    feeMode,
    feeMode === "fixed" ? feeText : "",
  ]);
}

function Choice({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Touchable
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      style={{
        flex: 1,
        paddingVertical: theme.spacing[3],
        paddingHorizontal: theme.spacing[2],
        borderRadius: theme.radii.lg,
        borderWidth: 1,
        borderColor: on ? theme.color.brand : theme.color.border,
        backgroundColor: on ? theme.color.brandSoft : theme.color.surface,
        alignItems: "center",
      }}
    >
      <Text variant="callout" color={on ? "brand" : "textSecondary"} align="center">
        {label}
      </Text>
    </Touchable>
  );
}

function CornerRow({
  corner,
  index,
  previous,
}: {
  corner: Corner;
  index: number;
  previous: Corner | null;
}) {
  const t = useT();
  const tone = gpsTone(corner.accuracyM);
  const rough = corner.accuracyM !== null && corner.accuracyM > GPS_ROUGH_M;
  const gap = previous ? haversineMeters(previous, corner) : null;
  const detail = [
    corner.accuracyM === null
      ? t("delivery.corner.saved")
      : t("delivery.corner.accuracy", { metres: corner.accuracyM }),
    gap !== null ? t("delivery.corner.gap", { distance: formatDistance(gap, t), n: index }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View
      accessible
      accessibilityLabel={t("delivery.corner.a11y", { n: index + 1, detail })}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[3],
        paddingVertical: 6,
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: theme.radii.full,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.color.brandSoft,
        }}
      >
        <Text variant="caption" color="brand" tabular>
          {String(index + 1)}
        </Text>
      </View>
      <Text variant="caption" color="textSecondary" style={{ flex: 1 }} numberOfLines={1}>
        {detail}
      </Text>
      {corner.accuracyM !== null ? (
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: theme.radii.full,
            backgroundColor: tone.color,
          }}
        />
      ) : null}
      {rough ? (
        <Text variant="caption" style={{ color: theme.palette.marigold[600] }}>
          {t("delivery.corner.roughTag")}
        </Text>
      ) : null}
    </View>
  );
}

function ProbeResult({ probe, radiusKm }: { probe: Probe; radiusKm: number }) {
  const t = useT();

  let tone: "success" | "warning" | "info" = probe.inside ? "success" : "warning";
  const headline = probe.inside ? t("delivery.check.inside") : t("delivery.check.outside");
  const lines: string[] = [];

  if (probe.withinRadius && probe.fromShopM !== null) {
    tone = "info";
    lines.push(
      t("delivery.check.inRadius", { distance: formatDistance(probe.fromShopM, t), km: radiusKm }),
    );
  } else if (probe.inside) {
    lines.push(
      probe.olderZone
        ? t("delivery.check.olderWins", { zone: probe.olderZone })
        : t("delivery.check.insideDetail"),
    );
  } else {
    lines.push(
      probe.otherZone
        ? t("delivery.check.otherZone", { zone: probe.otherZone })
        : probe.fromShopM === null
          ? t("delivery.check.outsideNoPin")
          : t("delivery.check.outsideDetail"),
    );
  }

  if (probe.accuracyM !== null && probe.accuracyM > GPS_ROUGH_M) {
    lines.push(t("delivery.check.rough", { metres: probe.accuracyM }));
  }

  return (
    <Animated.View entering={FadeIn.duration(160)} style={{ marginTop: theme.spacing[3] }}>
      <SettingsNotice tone={tone} title={headline}>
        {lines.map((line, i) => (
          <Text key={i} variant="caption" color="textSecondary">
            {line}
          </Text>
        ))}
      </SettingsNotice>
    </Animated.View>
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
      <Skeleton width="45%" height={24} />
      <Skeleton width="100%" height={120} radius={theme.radii.lg} delay={60} />
      <Skeleton width="100%" height={260} radius={theme.radii.lg} delay={120} />
    </View>
  );
}
