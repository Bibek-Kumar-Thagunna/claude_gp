import * as React from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useGopasal } from "@gopasal/native-data";
import {
  useApplicationJourney,
  useStartApplication,
  useSubmitApplication,
  useWithdrawApplication,
  type ApplicationNextStep,
  type DocumentKind,
} from "@gopasal/native-data/seller-onboarding";
import {
  Button,
  Card,
  Confirm,
  ConnectionBanner,
  Logo,
  Skeleton,
  Sunken,
  Text,
  Touchable,
  haptic,
  theme,
  useT,
} from "@gopasal/native-ui";
import { RegisterStatus } from "../../components/RegisterStatus";

/**
 * Registration, from the applicant's side.
 *
 * This screen is a checklist that is also the map. It exists because the form
 * is not filled in in one sitting or in order: the shop's name is known before
 * the shutter opens, the PAN certificate is in a drawer upstairs, and the bank
 * passbook is with somebody else. A wizard would make the applicant walk past
 * the questions they cannot answer yet, every time.
 *
 * So what is shown is: where the application stands, what is still missing, and
 * a door to each part. `applicationStanding` decides all of it — the six states
 * it returns are the six screens this can be, and none of that reasoning is
 * repeated here.
 *
 * The one thing that is *not* a checklist item is Submit. It sits at the
 * bottom, and when it cannot be pressed the reason is written beside it rather
 * than left as a grey rectangle.
 */

/** The groups the form is split into, and the fields each one owns. */
const STEPS = [
  {
    route: "/register/shop" as const,
    icon: "storefront-outline" as const,
    labelKey: "register.step.shop",
    labelEn: "Your shop",
    detailKey: "register.step.shop.detail",
    detailEn: "Name, what you sell, where you are",
    fields: [
      "shopName",
      "shopNameNp",
      "categoryId",
      "description",
      "area",
      "fullAddress",
      "lat",
      "lng",
      "deliveryRadiusKm",
      "hours",
      "contactPhone",
      "contactEmail",
      "soloMode",
    ],
  },
  {
    route: "/register/owner" as const,
    icon: "person-outline" as const,
    labelKey: "register.step.owner",
    labelEn: "About you",
    detailKey: "register.step.owner.detail",
    detailEn: "Your name, citizenship, registration",
    fields: ["ownerName", "ownerNameNp", "citizenshipNo", "registrationNo", "panNo", "vatNo"],
  },
  {
    route: "/register/payout" as const,
    icon: "cash-outline" as const,
    labelKey: "register.step.payout",
    labelEn: "Getting paid",
    detailKey: "register.step.payout.detail",
    detailEn: "Where GoPasal sends your money",
    fields: [
      "payoutMethod",
      "bankName",
      "bankBranch",
      "bankAccountNo",
      "bankAccountName",
      "walletNumber",
    ],
  },
] as const;

export default function RegisterHome() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useGopasal();
  const journey = useApplicationJourney();
  const start = useStartApplication();

  const application = journey.application;
  const standing = journey.standing;
  const submit = useSubmitApplication(application?.id);
  const withdraw = useWithdrawApplication(application?.id);

  const [confirmSubmit, setConfirmSubmit] = React.useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Approved: there is a shop now, and the rest of the app is where it lives.
  // Replaced rather than pushed — nobody should be able to swipe back into a
  // registration they have finished.
  React.useEffect(() => {
    if (standing?.next === "open-shop") router.replace("/");
  }, [standing?.next, router]);

  const begin = async () => {
    setError(null);
    try {
      const created = await start.mutateAsync({});
      haptic("success");
      router.push({ pathname: "/register/shop", params: { id: created.id } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("common.somethingWrong"));
    }
  };

  const send = async () => {
    setError(null);
    try {
      // `acceptTerms` is required by the API, and the confirmation above is
      // where it is actually accepted — a checkbox buried in a form is not
      // consent anybody read. The dialog says so in words before this runs.
      await submit.mutateAsync({ acceptTerms: true });
      haptic("success");
      setConfirmSubmit(false);
    } catch (cause) {
      setConfirmSubmit(false);
      setError(cause instanceof Error ? cause.message : t("common.somethingWrong"));
    }
  };

  const pullOut = async () => {
    setError(null);
    try {
      await withdraw.mutateAsync();
      setConfirmWithdraw(false);
    } catch (cause) {
      setConfirmWithdraw(false);
      setError(cause instanceof Error ? cause.message : t("common.somethingWrong"));
    }
  };

  if (journey.isPending) return <Loading insets={insets.top} />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing[4],
          paddingTop: insets.top + theme.spacing[4],
          paddingBottom: insets.bottom + theme.spacing[12],
          gap: theme.spacing[4],
        }}
      >
        <View
          style={{ alignItems: "center", gap: theme.spacing[3], marginBottom: theme.spacing[2] }}
        >
          <Logo size={34} />
          <Text variant="title1" align="center">
            {t("register.title")}
          </Text>
        </View>

        {/* Never applied: the pitch, and one button. */}
        {journey.neverApplied || !application || !standing ? (
          <Pitch onStart={begin} starting={start.isPending} phone={user?.phone ?? null} />
        ) : (
          <>
            <RegisterStatus standing={standing} reference={application.reference} />

            {standing.editable ? (
              <Card padded={false}>
                <View style={{ paddingHorizontal: theme.spacing[4] }}>
                  {STEPS.map((step, index) => (
                    <StepRow
                      key={step.route}
                      icon={step.icon}
                      label={t(step.labelKey, undefined, step.labelEn)}
                      detail={t(step.detailKey, undefined, step.detailEn)}
                      // What is left in this group, from the server's own list.
                      outstanding={
                        standing.blockers.fields.filter((f) =>
                          (step.fields as readonly string[]).includes(f),
                        ).length
                      }
                      asked={standing.changesRequested.some((f) =>
                        (step.fields as readonly string[]).includes(f),
                      )}
                      divider={index < STEPS.length - 1}
                      onPress={() =>
                        router.push({ pathname: step.route, params: { id: application.id } })
                      }
                    />
                  ))}
                </View>
              </Card>
            ) : null}

            {standing.editable ? (
              <Card padded={false}>
                <View style={{ paddingHorizontal: theme.spacing[4] }}>
                  <StepRow
                    icon="camera-outline"
                    label={t("register.step.documents")}
                    detail={t("register.step.documents.detail")}
                    outstanding={standing.blockers.documents.length}
                    asked={standing.rejectedDocuments.length > 0}
                    divider={false}
                    onPress={() =>
                      router.push({
                        pathname: "/register/documents",
                        params: { id: application.id },
                      })
                    }
                  />
                </View>
              </Card>
            ) : null}

            {error ? (
              <Animated.View entering={FadeIn.duration(180)}>
                <Sunken
                  style={{
                    flexDirection: "row",
                    gap: theme.spacing[3],
                    backgroundColor: theme.color.dangerSoft,
                  }}
                >
                  <Ionicons name="alert-circle" size={16} color={theme.color.danger} />
                  <Text variant="caption" style={{ color: theme.color.danger, flex: 1 }}>
                    {error}
                  </Text>
                </Sunken>
              </Animated.View>
            ) : null}

            <Submit
              next={standing.next}
              canSubmit={standing.canSubmit}
              action={standing.submitAction}
              missingFields={standing.blockers.fields.length}
              missingDocuments={standing.blockers.documents}
              busy={submit.isPending}
              onPress={() => setConfirmSubmit(true)}
              onStartAgain={begin}
              starting={start.isPending}
            />

            {standing.withdrawable ? (
              <Touchable
                haptic="warning"
                onPress={() => setConfirmWithdraw(true)}
                accessibilityLabel={t("register.withdraw")}
                style={{ alignSelf: "center", padding: theme.spacing[3] }}
              >
                <Text variant="caption" style={{ color: theme.color.danger }}>
                  {t("register.withdraw")}
                </Text>
              </Touchable>
            ) : null}
          </>
        )}
      </ScrollView>

      <Confirm
        visible={confirmSubmit}
        title={
          standing?.submitAction === "resubmit"
            ? t("register.resubmit.title")
            : t("register.submit.title")
        }
        message={t("register.submit.detail")}
        confirmLabel={t("register.submit.yes")}
        cancelLabel={t("common.notNow")}
        busy={submit.isPending}
        onConfirm={send}
        onCancel={() => setConfirmSubmit(false)}
      />

      <Confirm
        visible={confirmWithdraw}
        title={t("register.withdraw.title")}
        message={t("register.withdraw.detail")}
        confirmLabel={t("register.withdraw.yes")}
        cancelLabel={t("common.notNow")}
        destructive
        busy={withdraw.isPending}
        onConfirm={pullOut}
        onCancel={() => setConfirmWithdraw(false)}
      />
    </View>
  );
}

/**
 * The bottom of the screen, which is a different thing in each state.
 *
 * A disabled Submit with nothing beside it is the worst version of this: the
 * applicant can see the button, cannot press it, and has to go hunting for the
 * reason. So when it cannot be pressed, the count of what is missing takes its
 * place, and the button appears only once it would work.
 */
function Submit({
  next,
  canSubmit,
  action,
  missingFields,
  missingDocuments,
  busy,
  onPress,
  onStartAgain,
  starting,
}: {
  next: ApplicationNextStep;
  canSubmit: boolean;
  action: "submit" | "resubmit" | null;
  missingFields: number;
  missingDocuments: readonly DocumentKind[];
  busy: boolean;
  onPress: () => void;
  onStartAgain: () => void;
  starting: boolean;
}) {
  const t = useT();

  if (next === "wait") return null;

  if (next === "start-again") {
    return (
      <Button
        label={t("register.startAgain")}
        size="lg"
        loading={starting}
        onPress={onStartAgain}
      />
    );
  }

  if (!canSubmit) {
    const remaining = missingFields + missingDocuments.length;
    return (
      <Sunken style={{ gap: theme.spacing[2] }}>
        <Text variant="callout">
          {remaining === 1
            ? t("register.remaining.one")
            : t("register.remaining.many", { count: remaining })}
        </Text>
        <Text variant="caption" color="textSecondary">
          {t("register.remaining.detail")}
        </Text>
      </Sunken>
    );
  }

  return (
    <Button
      label={action === "resubmit" ? t("register.resubmit") : t("register.submit")}
      size="lg"
      loading={busy}
      onPress={onPress}
    />
  );
}

function StepRow({
  icon,
  label,
  detail,
  outstanding,
  asked,
  divider,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  outstanding: number;
  asked: boolean;
  divider: boolean;
  onPress: () => void;
}) {
  const t = useT();
  // Done is a state worth showing: on a form this long, the tick is most of
  // the reward for having filled a section in.
  const done = outstanding === 0 && !asked;

  return (
    <View>
      <Touchable
        haptic="light"
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          asked
            ? t("register.a11y.stepAsked", { step: label })
            : outstanding > 0
              ? t("register.a11y.stepLeft", { step: label, count: outstanding })
              : t("register.a11y.stepDone", { step: label })
        }
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
          paddingVertical: theme.spacing[4],
        }}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: theme.radii.md,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: asked
              ? theme.color.warningSoft
              : done
                ? theme.color.successSoft
                : theme.color.surfaceSunken,
          }}
        >
          <Ionicons
            name={asked ? "alert-circle-outline" : done ? "checkmark" : icon}
            size={17}
            color={
              asked
                ? theme.palette.marigold[600]
                : done
                  ? theme.color.success
                  : theme.color.textMuted
            }
          />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="callout" numberOfLines={1}>
            {label}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {asked
              ? t("register.step.asked")
              : outstanding > 0
                ? outstanding === 1
                  ? t("register.step.left.one")
                  : t("register.step.left.many", { count: outstanding })
                : detail}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={16} color={theme.color.textFaint} />
      </Touchable>
      {divider ? <View style={{ height: 1, backgroundColor: theme.color.border }} /> : null}
    </View>
  );
}

/** Never applied before. One screen, one button, no form in sight. */
function Pitch({
  onStart,
  starting,
  phone,
}: {
  onStart: () => void;
  starting: boolean;
  phone: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const points = [
    {
      icon: "receipt-outline" as const,
      text: t("register.pitch.orders"),
    },
    {
      icon: "bicycle-outline" as const,
      text: t("register.pitch.delivery"),
    },
    {
      icon: "cash-outline" as const,
      text: t("register.pitch.money"),
    },
  ];

  return (
    <View style={{ gap: theme.spacing[4] }}>
      <Text variant="body" color="textSecondary" align="center">
        {t("register.pitch.detail")}
      </Text>

      <Card style={{ gap: theme.spacing[4] }}>
        {points.map((point) => (
          <View
            key={point.icon}
            style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}
          >
            <Ionicons name={point.icon} size={19} color={theme.color.brand} />
            <Text variant="callout" style={{ flex: 1, minWidth: 0 }}>
              {point.text}
            </Text>
          </View>
        ))}
      </Card>

      <Button label={t("register.start")} size="lg" loading={starting} onPress={onStart} />

      {/* A shop assistant who was sent a code lands here too if they signed
          in before opening the link; this is their way out of registering. */}
      <Touchable
        haptic="light"
        onPress={() => router.push("/join")}
        accessibilityRole="button"
        accessibilityLabel={t("join.invited")}
        style={{ alignSelf: "center", paddingVertical: theme.spacing[2] }}
      >
        <Text variant="callout" color="brand">
          {t("join.invited")}
        </Text>
      </Touchable>

      {phone ? (
        <Text variant="caption" color="textFaint" align="center">
          {t("register.pitch.asPhone", { phone })}
        </Text>
      ) : null}
    </View>
  );
}

function Loading({ insets }: { insets: number }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.color.background,
        padding: theme.spacing[4],
        paddingTop: insets + theme.spacing[6],
        gap: theme.spacing[3],
      }}
    >
      <Skeleton width="62%" height={26} />
      <Skeleton width="100%" height={92} radius={theme.radii.lg} delay={60} />
      <Skeleton width="100%" height={180} radius={theme.radii.lg} delay={120} />
    </View>
  );
}
