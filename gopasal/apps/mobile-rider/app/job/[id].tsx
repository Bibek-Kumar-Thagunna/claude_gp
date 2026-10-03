import * as React from "react";
import { Image, Linking, Platform, RefreshControl, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import {
  cashToCollect,
  destination,
  directionsUrl,
  riderStep,
  useProofUpload,
  useRiderJob,
  useRiderStep,
  type RiderDelivery,
  type RiderTransition,
} from "@gopasal/native-data/rider";
import {
  Button,
  Card,
  Confirm,
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
import { StageChip } from "../../components/JobCard";
import { HandoverSheet } from "../../components/HandoverSheet";
import { ProblemSheet } from "../../components/ProblemSheet";
import { rider } from "../../lib/rider-theme";

type Outcome = { kind: "delivered"; cash: number; code: string } | { kind: "ended"; code: string };

/**
 * One job, from counter to doorstep.
 *
 * The screen is built around a single question — *where am I going now, and
 * what do I press when I get there?* — so the top card is always the next
 * stop, with Navigate and Call at thumb height, and the bottom bar is always
 * the one next step. Everything else (the items to check at the counter, the
 * cash, the customer's note, the doorstep photo) sits between them in the
 * order a rider needs it.
 *
 * When the job leaves the active list — delivered, or ended before pickup —
 * the screen does not blank out: it shows what just happened and sends the
 * rider back to the list.
 */
export default function JobScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, isPending, isRefetching, refetch } = useRiderJob(id);
  const step = useRiderStep();
  const proof = useProofUpload();

  const [handover, setHandover] = React.useState(false);
  const [problem, setProblem] = React.useState(false);
  const [failReason, setFailReason] = React.useState<string | null>(null);
  const [confirmReturn, setConfirmReturn] = React.useState(false);
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);

  // Set while a step that ends the job is in flight: the job leaves the list
  // a moment before the outcome is known, and that moment must not read as
  // "this job isn't yours any more".
  const finishing = React.useRef(false);

  const move = async (transition: RiderTransition, onDone?: (row: RiderDelivery) => void) => {
    if (!job) return;
    setError(null);
    finishing.current = transition.status === "DELIVERED" || (transition.status === "FAILED" && !job.pickedUpAt);
    try {
      const row = await step.mutateAsync({ orderId: job.orderId, transition });
      haptic(transition.status === "FAILED" ? "warning" : "success");
      onDone?.(row);
    } catch (cause) {
      finishing.current = false;
      haptic("error");
      setError(cause instanceof Error ? cause.message : t("common.somethingWrong"));
    }
  };

  const takePhoto = async () => {
    if (!job) return;
    setPhotoError(null);
    try {
      const web = Platform.OS === "web";
      const permission = web
        ? { granted: true }
        : await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setPhotoError(t("proof.cameraDenied"));
        return;
      }
      const picked = web
        ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6, exif: false })
        : await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6, exif: false });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (!asset) return;
      setPreview(asset.uri);
      await proof.mutateAsync({
        orderId: job.orderId,
        file: {
          uri: asset.uri,
          name: asset.fileName ?? `proof-${job.order.code}.jpg`,
          type: asset.mimeType ?? "image/jpeg",
        },
      });
      haptic("success");
    } catch (cause) {
      setPreview(null);
      setPhotoError(cause instanceof Error ? cause.message : t("common.somethingWrong"));
    }
  };

  const header = (
    <View
      style={{
        paddingTop: insets.top + theme.spacing[2],
        paddingBottom: theme.spacing[3],
        paddingHorizontal: theme.spacing[4],
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[3],
      }}
    >
      <Touchable
        haptic="light"
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/jobs"))}
        accessibilityLabel={t("common.back")}
        style={{
          width: 40,
          height: 40,
          borderRadius: theme.radii.full,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.color.surface,
          borderWidth: 1,
          borderColor: theme.color.border,
        }}
      >
        <Ionicons name="chevron-back" size={20} color={theme.color.text} />
      </Touchable>
      <Text variant="title3" style={{ flex: 1 }} numberOfLines={1}>
        {job ? t("job.title", { code: job.order.code }) : outcome ? t("job.title", { code: outcome.code }) : t("job.loading")}
      </Text>
    </View>
  );

  if (outcome) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.background }}>
        {header}
        <Finished outcome={outcome} onBack={() => router.replace("/(tabs)/jobs")} />
      </View>
    );
  }

  if (!job) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.background }}>
        {header}
        {isPending || finishing.current ? (
          <View style={{ paddingHorizontal: theme.spacing[4], gap: theme.spacing[3] }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} width="100%" height={i === 0 ? 180 : 110} radius={theme.radii.lg} delay={i * 90} />
            ))}
          </View>
        ) : (
          <View style={{ padding: theme.spacing[5], gap: theme.spacing[3], alignItems: "center" }}>
            <Ionicons name="checkmark-done-circle-outline" size={44} color={theme.color.textFaint} />
            <Text variant="title3" align="center">
              {t("job.gone.title")}
            </Text>
            <Text variant="callout" color="textMuted" align="center">
              {t("job.gone.detail")}
            </Text>
            <Button label={t("job.backToJobs")} variant="secondary" onPress={() => router.replace("/(tabs)/jobs")} />
          </View>
        )}
      </View>
    );
  }

  const next = riderStep(job);
  const to = destination(job);
  const cash = cashToCollect(job);
  const pickedUp = Boolean(job.pickedUpAt);
  const callNumber = to.kind === "shop" ? job.order.shop.phone : job.order.recipientPhone;
  const itemCount = job.order.items.reduce((n, i) => n + i.qty, 0);

  const primary =
    next.primary === "pickUp"
      ? { label: t("action.pickUp"), icon: "bag-check" as const, run: () => void move({ status: "PICKED_UP" }) }
      : next.primary === "start"
        ? { label: t("action.start"), icon: "navigate" as const, run: () => void move({ status: "EN_ROUTE" }) }
        : next.primary === "handover"
          ? { label: t("action.handover"), icon: "hand-left" as const, run: () => setHandover(true) }
          : next.primary === "startReturn"
            ? { label: t("action.startReturn"), icon: "return-down-back" as const, run: () => setConfirmReturn(true) }
            : null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
      {header}
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing[4],
          paddingBottom: theme.spacing[6],
          gap: theme.spacing[4],
        }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      >
        {/* next stop */}
        <Animated.View
          entering={FadeInDown.duration(260)}
          style={{
            borderRadius: theme.radii.xl,
            padding: theme.spacing[4],
            gap: theme.spacing[3],
            backgroundColor: palette.ink[900],
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
            <StageChip step={next} />
            <View style={{ flex: 1 }} />
            <Text variant="caption" style={{ color: palette.ink[300] }}>
              {to.kind === "shop" ? t("job.nextStop.shop") : t("job.nextStop.customer")}
            </Text>
          </View>
          <View style={{ gap: 2 }}>
            <Text variant="title2" style={{ color: palette.white }} numberOfLines={2}>
              {to.kind === "shop" ? job.order.shop.name : job.order.recipientName}
            </Text>
            <Text variant="callout" style={{ color: palette.ink[200] }}>
              {to.address}
            </Text>
            {to.kind === "customer" && job.order.landmark ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                <Ionicons name="flag" size={13} color={rider.amber} />
                <Text variant="footnote" style={{ color: rider.amber, flex: 1 }}>
                  {t("job.landmark", { landmark: job.order.landmark })}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", gap: theme.spacing[3] }}>
            <Touchable
              haptic="medium"
              onPress={() => void Linking.openURL(directionsUrl(to))}
              accessibilityRole="link"
              accessibilityLabel={t("job.navigate")}
              style={{
                flex: 1.4,
                height: 50,
                borderRadius: theme.radii.lg,
                backgroundColor: rider.amber,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: theme.spacing[2],
              }}
            >
              <Ionicons name="navigate" size={18} color={palette.ink[900]} />
              <Text variant="bodyStrong" style={{ color: palette.ink[900] }}>
                {t("job.navigate")}
              </Text>
            </Touchable>
            {callNumber ? (
              <Touchable
                haptic="light"
                onPress={() => void Linking.openURL(`tel:${callNumber}`)}
                accessibilityRole="link"
                accessibilityLabel={to.kind === "shop" ? t("job.callShop") : t("job.callCustomer")}
                style={{
                  flex: 1,
                  height: 50,
                  borderRadius: theme.radii.lg,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.22)",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: theme.spacing[2],
                }}
              >
                <Ionicons name="call" size={17} color={palette.white} />
                <Text variant="bodyStrong" style={{ color: palette.white }}>
                  {t("job.call")}
                </Text>
              </Touchable>
            ) : null}
          </View>
        </Animated.View>

        {/* a failed job that is still in the rider's hands */}
        {next.stage === "mustReturn" || next.stage === "returning" ? (
          <Card style={{ gap: theme.spacing[2], borderColor: theme.color.danger, backgroundColor: theme.color.dangerSoft }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
              <Ionicons name="alert-circle" size={18} color={theme.color.danger} />
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {next.stage === "returning" ? t("return.onWay.title") : t("return.must.title")}
              </Text>
            </View>
            <Text variant="footnote" color="textSecondary">
              {next.stage === "returning"
                ? t("return.onWay.detail", { shop: job.order.shop.name })
                : t("return.must.detail", { shop: job.order.shop.name })}
            </Text>
            {job.failReason ? (
              <Text variant="footnote" color="textMuted">
                {t("return.reason", { reason: job.failReason })}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {/* cash */}
        <Card
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing[3],
            backgroundColor: cash > 0 ? rider.amberSoft : theme.color.surface,
            borderColor: cash > 0 ? rider.amberLine : theme.color.border,
          }}
        >
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 13,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: cash > 0 ? rider.amber : theme.color.successSoft,
            }}
          >
            <Ionicons
              name={cash > 0 ? "cash" : "shield-checkmark"}
              size={20}
              color={cash > 0 ? palette.ink[900] : theme.color.success}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="caption" color="textMuted">
              {cash > 0 ? t("job.cash.collect") : t("job.cash.prepaid")}
            </Text>
            {cash > 0 ? (
              <Price value={cash} variant="title2" />
            ) : (
              <Text variant="bodyStrong">{t("job.cash.nothing")}</Text>
            )}
          </View>
        </Card>

        {/* route */}
        <Card style={{ gap: theme.spacing[3] }}>
          <Stop
            icon="storefront"
            title={job.order.shop.name}
            detail={[job.order.shop.area, job.order.shop.fullAddress].filter(Boolean).join(" · ")}
            done={pickedUp}
            doneLabel={pickedUp ? t("job.pickedUpAt", { time: clock(job.pickedUpAt) }) : null}
          />
          <View style={{ marginLeft: 15, width: 2, height: 14, backgroundColor: palette.ink[200] }} />
          <Stop
            icon="home"
            title={job.order.recipientName}
            detail={[job.order.area, job.order.fullAddress].filter(Boolean).join(" · ")}
            done={false}
            doneLabel={null}
          />
        </Card>

        {/* note from the customer */}
        {job.order.note ? (
          <Sunken style={{ flexDirection: "row", gap: theme.spacing[3] }}>
            <Ionicons name="chatbox-ellipses-outline" size={18} color={theme.color.textMuted} />
            <View style={{ flex: 1 }}>
              <Text variant="caption" color="textMuted">
                {t("job.customerNote")}
              </Text>
              <Text variant="callout">{job.order.note}</Text>
            </View>
          </Sunken>
        ) : null}

        {/* items */}
        <Card style={{ gap: theme.spacing[2] }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text variant="overline" color="textMuted" style={{ flex: 1 }}>
              {t("job.items", { count: itemCount })}
            </Text>
            <Price value={job.order.total} variant="footnote" />
          </View>
          {next.stage === "toShop" ? (
            <Text variant="footnote" color="textSecondary">
              {t("job.items.check")}
            </Text>
          ) : null}
          {job.order.items.map((item) => (
            <View key={item.id} style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
              <View
                style={{
                  minWidth: 30,
                  height: 26,
                  borderRadius: 8,
                  paddingHorizontal: 6,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.color.surfaceSunken,
                }}
              >
                <Text variant="caption" tabular>
                  {`×${item.qty}`}
                </Text>
              </View>
              <Text variant="callout" style={{ flex: 1 }} numberOfLines={2}>
                {item.nameSnapshot}
                {item.unitSnapshot ? (
                  <Text variant="footnote" color="textMuted">{`  ${item.unitSnapshot}`}</Text>
                ) : null}
              </Text>
            </View>
          ))}
        </Card>

        {/* doorstep photo */}
        {next.canAttachProof || job.hasProofPhoto ? (
          <Card style={{ gap: theme.spacing[3] }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
              {preview ? (
                <Image source={{ uri: preview }} style={{ width: 52, height: 52, borderRadius: 12 }} />
              ) : (
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: job.hasProofPhoto ? theme.color.successSoft : theme.color.surfaceSunken,
                  }}
                >
                  <Ionicons
                    name={job.hasProofPhoto ? "checkmark" : "camera-outline"}
                    size={22}
                    color={job.hasProofPhoto ? theme.color.success : theme.color.textMuted}
                  />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodyStrong">{job.hasProofPhoto ? t("proof.attached") : t("proof.title")}</Text>
                <Text variant="caption" color="textMuted">
                  {t("proof.detail")}
                </Text>
              </View>
            </View>
            {next.canAttachProof ? (
              <Button
                label={job.hasProofPhoto ? t("proof.retake") : t("proof.take")}
                variant="secondary"
                size="sm"
                loading={proof.isPending}
                leading={<Ionicons name="camera" size={16} color={theme.color.text} />}
                onPress={() => void takePhoto()}
              />
            ) : null}
            {photoError ? (
              <Text variant="caption" color="danger">
                {photoError}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {next.canFail ? (
          <Touchable
            haptic="light"
            onPress={() => setProblem(true)}
            accessibilityRole="button"
            accessibilityLabel={t("problem.open")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: theme.spacing[2],
              paddingVertical: theme.spacing[3],
            }}
          >
            <Ionicons name="warning-outline" size={16} color={theme.color.danger} />
            <Text variant="callout" color="danger">
              {t("problem.open")}
            </Text>
          </Touchable>
        ) : null}
      </ScrollView>

      {/* the one next step */}
      {primary ? (
        <View
          style={{
            paddingHorizontal: theme.spacing[4],
            paddingTop: theme.spacing[3],
            paddingBottom: insets.bottom + theme.spacing[3],
            backgroundColor: theme.color.surface,
            borderTopWidth: 1,
            borderTopColor: theme.color.border,
            gap: theme.spacing[2],
          }}
        >
          {error && !handover ? (
            <Animated.View entering={FadeIn.duration(160)}>
              <Text variant="footnote" color="danger">
                {error}
              </Text>
            </Animated.View>
          ) : null}
          <Touchable
            haptic="medium"
            disabled={step.isPending}
            onPress={primary.run}
            accessibilityRole="button"
            accessibilityLabel={primary.label}
            accessibilityState={{ busy: step.isPending }}
            testID="job-primary"
            style={{
              height: 58,
              borderRadius: theme.radii.lg,
              backgroundColor: next.primary === "startReturn" ? theme.color.danger : palette.ink[900],
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: theme.spacing[3],
              opacity: step.isPending ? 0.7 : 1,
            }}
          >
            <Ionicons name={primary.icon} size={20} color={next.primary === "startReturn" ? palette.white : rider.amber} />
            <Text variant="bodyStrong" style={{ color: palette.white }}>
              {step.isPending ? t("action.working") : primary.label}
            </Text>
          </Touchable>
        </View>
      ) : next.stage === "returning" ? (
        <View
          style={{
            paddingHorizontal: theme.spacing[4],
            paddingTop: theme.spacing[3],
            paddingBottom: insets.bottom + theme.spacing[3],
            backgroundColor: theme.color.surface,
            borderTopWidth: 1,
            borderTopColor: theme.color.border,
          }}
        >
          <Text variant="footnote" color="textSecondary" align="center">
            {t("return.waitShop")}
          </Text>
        </View>
      ) : null}

      <HandoverSheet
        visible={handover}
        cash={cash}
        busy={step.isPending}
        error={handover ? error : null}
        onClose={() => {
          setHandover(false);
          setError(null);
        }}
        onSubmit={({ podNote, codCollected }) =>
          void move({ status: "DELIVERED", podNote, codCollected }, () => {
            setHandover(false);
            setOutcome({ kind: "delivered", cash: codCollected ? cash : 0, code: job.order.code });
          })
        }
      />

      <ProblemSheet
        visible={problem}
        pickedUp={pickedUp}
        onClose={() => setProblem(false)}
        onSubmit={(reason) => {
          setProblem(false);
          setFailReason(reason);
        }}
      />

      <Confirm
        visible={failReason != null}
        title={t("problem.confirm.title")}
        message={pickedUp ? t("problem.confirm.carrying") : t("problem.confirm.before")}
        confirmLabel={t("problem.confirm.go")}
        cancelLabel={t("common.notNow")}
        destructive
        busy={step.isPending}
        onCancel={() => setFailReason(null)}
        onConfirm={() => {
          const reason = failReason ?? "";
          void move({ status: "FAILED", failReason: reason }, () => {
            setFailReason(null);
            if (!pickedUp) setOutcome({ kind: "ended", code: job.order.code });
          });
        }}
      />

      <Confirm
        visible={confirmReturn}
        title={t("return.confirm.title")}
        message={t("return.confirm.detail", { shop: job.order.shop.name })}
        confirmLabel={t("return.confirm.go")}
        cancelLabel={t("common.notNow")}
        busy={step.isPending}
        onCancel={() => setConfirmReturn(false)}
        onConfirm={() => void move({ status: "RETURNING_TO_SHOP" }, () => setConfirmReturn(false))}
      />
    </View>
  );
}

function Stop({
  icon,
  title,
  detail,
  done,
  doneLabel,
}: {
  icon: "storefront" | "home";
  title: string;
  detail: string;
  done: boolean;
  doneLabel: string | null;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: done ? theme.color.successSoft : theme.color.surfaceSunken,
        }}
      >
        <Ionicons
          name={done ? "checkmark" : icon}
          size={16}
          color={done ? theme.color.success : palette.ink[700]}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text variant="caption" color="textMuted" numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
        {doneLabel ? (
          <Text variant="caption" color="success">
            {doneLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** What just happened, once the job has left the list. */
function Finished({ outcome, onBack }: { outcome: Outcome; onBack: () => void }) {
  const t = useT();
  const delivered = outcome.kind === "delivered";
  return (
    <Animated.View
      entering={FadeInDown.duration(300)}
      style={{ flex: 1, padding: theme.spacing[5], alignItems: "center", justifyContent: "center", gap: theme.spacing[3] }}
    >
      <View
        style={{
          width: 84,
          height: 84,
          borderRadius: 42,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: delivered ? theme.color.successSoft : theme.color.surfaceSunken,
        }}
      >
        <Ionicons
          name={delivered ? "checkmark-circle" : "close-circle-outline"}
          size={52}
          color={delivered ? theme.color.success : theme.color.textMuted}
        />
      </View>
      <Text variant="title2" align="center">
        {delivered ? t("done.delivered.title") : t("done.ended.title")}
      </Text>
      <Text variant="callout" color="textSecondary" align="center">
        {delivered
          ? outcome.cash > 0
            ? t("done.delivered.cash")
            : t("done.delivered.prepaid")
          : t("done.ended.detail")}
      </Text>
      {delivered && outcome.cash > 0 ? <Price value={outcome.cash} variant="title1" /> : null}
      <View style={{ height: theme.spacing[4] }} />
      <Button label={t("job.backToJobs")} size="lg" onPress={onBack} style={{ alignSelf: "stretch" }} />
    </Animated.View>
  );
}

function clock(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
