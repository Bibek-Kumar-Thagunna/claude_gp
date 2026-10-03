import * as React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSelectedShop } from "@gopasal/native-data/seller";
import { useShopPermissions } from "@gopasal/native-data/seller-team";
import {
  COUPON_LIMITS,
  couponDraftIssues,
  couponPatchIssues,
  couponState,
  normaliseCouponCode,
  previewDiscount,
  promotionQk,
  useCouponActions,
  useShopCoupons,
  type Coupon,
  type CouponCreateInput,
  type CouponDraft,
  type CouponIssue,
  type CouponPage,
  type CouponPatch,
  type CouponType,
} from "@gopasal/native-data/seller-promotions";
import {
  Button,
  Card,
  Confirm,
  ConnectionBanner,
  Sunken,
  Text,
  haptic,
  theme,
  useT,
} from "@gopasal/native-ui";
import { RegisterField } from "../../components/RegisterField";
import {
  PROMO_PERMISSIONS,
  dateLabel,
  describeCoupon,
  fieldIssue,
  issueText,
  parseWhole,
  rupees,
  stateLabel,
  stateTone,
} from "../../components/PromoCopy";
import {
  PromoEndPicker,
  PromoStartPicker,
  resolveEnd,
  resolveStart,
  type PromoEnd,
  type PromoStart,
} from "../../components/PromoDates";
import {
  PROMO_EXAMPLE_ORDER,
  PromoAmountField,
  PromoExample,
  PromoLockedRow,
  PromoTypePicker,
} from "../../components/PromoFields";
import {
  PromoError,
  PromoHeader,
  PromoLoading,
  PromoNoAccess,
  PromoNotice,
} from "../../components/PromoFrame";

/**
 * Writing one coupon, or changing the little about one that can change.
 *
 * ## Creating
 *
 * Six things about a coupon are fixed forever the moment it is saved — the
 * code, whether it is a percentage or a fixed amount, the amount, the most a
 * percentage can take off, how often each customer may use it, and when it
 * starts. A wrong one is not an error the API catches: `FLAT 50` where
 * `PERCENT 50` was meant is a perfectly valid coupon that quietly costs the
 * shop money until somebody notices. So the form spends its effort there:
 * the two kinds are two large cards, the amount wears its unit, a worked
 * example in rupees recomputes as it is typed, and Create opens a
 * confirmation that reads the whole coupon back — arithmetic included —
 * before anything is sent.
 *
 * ## Editing
 *
 * Only the smallest order, the total limit and the end date can change, and
 * the end and the limit can be moved but never removed. Everything else is
 * drawn locked, with the one sentence that matters: a wrong one is fixed by
 * turning this coupon off and making another under a new word, because this
 * code stays taken.
 *
 * Turning a coupon off is not deleting it. The API keeps the row and its
 * history, and it can be turned back on, so nothing here says "permanently".
 *
 * Problems are the package's rules (`couponDraftIssues`, `couponPatchIssues`),
 * shown under the field they are about. Errors stop Save; warnings — legal
 * but probably not meant, like 100% off — are read back in the confirmation
 * and may be overridden.
 */
export default function CouponEditor() {
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; code?: string }>();
  const { shopId, shop, ready } = useSelectedShop();
  const permissions = useShopPermissions(shopId);
  const canView = permissions.has(PROMO_PERMISSIONS.view);
  const canManage = permissions.has(PROMO_PERMISSIONS.manage);
  const editingId = params.id ?? null;
  const qc = useQueryClient();

  // The row as the list last saw it, so the screen opens drawn rather than on
  // a skeleton. There is no single-coupon route, so the fresh copy comes from
  // the list itself, searched by the code the row was opened with.
  const cached = React.useMemo<Coupon | null>(() => {
    if (!editingId || !shopId) return null;
    for (const [, page] of qc.getQueriesData<CouponPage>({
      queryKey: promotionQk.couponsRoot(shopId),
    })) {
      const hit = page?.data.find((coupon) => coupon.id === editingId);
      if (hit) return hit;
    }
    return null;
  }, [qc, shopId, editingId]);

  const live = useShopCoupons(
    editingId && params.code && permissions.ready && canView ? shopId : null,
    { q: params.code, limit: 20 },
  );
  const coupon = live.data?.data.find((row) => row.id === editingId) ?? cached;
  const asOf = live.data ? Date.parse(live.data.summary.asOf) : Date.now();

  const title = editingId ? (coupon?.code ?? t("promo.edit.title")) : t("promo.create.title");

  const body = (() => {
    if (!ready || !permissions.ready) return <PromoLoading />;
    if (!shop) {
      return (
        <PromoNotice
          icon="storefront-outline"
          title={t("shop.choose.title")}
          detail={t("shop.choose.detail")}
        />
      );
    }
    if (!canView || (!editingId && !canManage)) {
      return (
        <PromoNoAccess
          restricted={permissions.restricted}
          restrictionReason={permissions.restrictionReason}
          what={editingId ? t("promo.what.list") : t("promo.what.create")}
        />
      );
    }
    if (!editingId) return <CreateForm shopId={shopId} onDone={() => router.back()} />;
    if (!coupon) {
      if (live.isLoading) return <PromoLoading />;
      return (
        <PromoNotice
          icon="help-circle-outline"
          title={t("promo.edit.gone")}
          detail={t("promo.edit.goneDetail")}
          actionLabel={t("common.back")}
          onAction={() => router.back()}
        />
      );
    }
    return (
      <EditForm
        key={coupon.id}
        coupon={coupon}
        shopId={shopId}
        asOf={asOf}
        canManage={canManage}
        onDone={() => router.back()}
      />
    );
  })();

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
      <PromoHeader title={title} subtitle={shop?.name ?? null} />
      {body}
    </View>
  );
}

function FormScroll({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing[4],
          paddingBottom: insets.bottom + theme.spacing[12],
          gap: theme.spacing[5],
        }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ── creating ─────────────────────────────────────────────────────────────── */

function CreateForm({ shopId, onDone }: { shopId: string | null; onDone: () => void }) {
  const t = useT();
  const { create } = useCouponActions(shopId);

  const [code, setCode] = React.useState("");
  const [type, setType] = React.useState<CouponType | null>(null);
  const [valueText, setValueText] = React.useState("");
  const [capText, setCapText] = React.useState("");
  const [minText, setMinText] = React.useState("");
  const [usageText, setUsageText] = React.useState("");
  const [perUserText, setPerUserText] = React.useState("1");
  const [start, setStart] = React.useState<PromoStart>({ kind: "now" });
  const [startTyped, setStartTyped] = React.useState("");
  // Thirty days rather than "no end": an end can be moved later but never
  // taken away, and a forgotten coupon with no end keeps costing money.
  const [end, setEnd] = React.useState<PromoEnd>({ kind: "days", days: 30 });
  const [endTyped, setEndTyped] = React.useState("");

  const [tried, setTried] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [taken, setTaken] = React.useState<string | null>(null);

  const startAt = resolveStart(start, startTyped);
  const endAt = resolveEnd(end, endTyped);
  const value = parseWhole(valueText);
  const cap = type === "PERCENT" ? parseWhole(capText) : undefined;
  const minOrder = parseWhole(minText);

  const draft: CouponDraft = {
    code,
    type: type ?? undefined,
    value,
    minOrder,
    maxDiscount: cap,
    usageLimit: parseWhole(usageText),
    perUserLimit: parseWhole(perUserText),
    validFrom: startAt.iso,
    validTo: endAt.iso,
  };
  const issues = couponDraftIssues(draft);
  const dateBad = t("promo.date.bad");
  const blocked = issues.some((i) => i.severity === "error") || startAt.bad || endAt.bad;
  const warnings = issues.filter((i) => i.severity === "warning");

  /**
   * An error shows once Save has been tried or the field has something in it —
   * "enter a number" under a box nobody has reached yet is nagging — while a
   * warning shows as soon as it is true, because it is about what was typed.
   */
  const show = (field: CouponIssue["field"], text: string) => {
    const hit = fieldIssue(issues, field, t);
    if (!hit) return { problem: null, warning: null };
    if (hit.severity === "warning") return { problem: null, warning: hit.text };
    const shown = tried || (field !== "code" && text.trim() !== "");
    return { problem: shown ? hit.text : null, warning: null };
  };

  const codeShown = normaliseCouponCode(code);
  const codeIssue = show("code", code);
  const valueIssue = show("value", valueText);
  const capIssue = show("maxDiscount", capText);
  const minIssue = show("minOrder", minText);
  const usageIssue = show("usageLimit", usageText);
  const perUserIssue = show("perUserLimit", perUserText);
  const typeProblem = tried ? (fieldIssue(issues, "type", t)?.text ?? null) : null;
  const startProblem =
    startAt.bad && (tried || startTyped.length >= 10)
      ? dateBad
      : tried
        ? (fieldIssue(issues, "validFrom", t)?.text ?? null)
        : null;
  const endIssue = fieldIssue(issues, "validTo", t);
  const endProblem =
    endAt.bad && (tried || endTyped.length >= 10)
      ? dateBad
      : endIssue?.severity === "error" && (tried || end.kind !== "typed" || endTyped.length >= 10)
        ? endIssue.text
        : null;

  const review = () => {
    setTried(true);
    setError(null);
    if (blocked) return;
    setConfirming(true);
  };

  const send = async () => {
    if (!type || value === undefined) return;
    setError(null);
    setTaken(null);
    const input: CouponCreateInput = {
      code: codeShown,
      type,
      value,
      // Omitted, never `null`: the API's optional validators skip a null and
      // hand it to the database.
      ...(minOrder !== undefined ? { minOrder } : null),
      ...(cap !== undefined ? { maxDiscount: cap } : null),
      ...(draft.usageLimit !== undefined ? { usageLimit: draft.usageLimit } : null),
      ...(draft.perUserLimit !== undefined ? { perUserLimit: draft.perUserLimit } : null),
      ...(startAt.iso ? { validFrom: startAt.iso } : null),
      ...(endAt.iso ? { validTo: endAt.iso } : null),
    };
    try {
      await create.mutateAsync(input);
      haptic("success");
      setConfirming(false);
      onDone();
    } catch (cause) {
      setConfirming(false);
      const message = cause instanceof Error ? cause.message : "";
      // Codes are unique across all of GoPasal, and the API will not say which
      // shop holds one. The only useful answer is "pick another word", said
      // under the field that needs it.
      if (/already exists/i.test(message)) setTaken(codeShown);
      else setError(message.trim() !== "" ? message : t("common.somethingWrong"));
    }
  };

  const example =
    type && value !== undefined && Number.isInteger(value)
      ? previewDiscount(
          { type, value, maxDiscount: cap ?? null },
          Math.max(PROMO_EXAMPLE_ORDER, minOrder ?? 0),
        )
      : null;

  const confirmMessage =
    type && value !== undefined
      ? [
          describeCoupon({ type, value, maxDiscount: cap ?? null }, t),
          example !== null
            ? t("promo.confirm.example", {
                order: rupees(Math.max(PROMO_EXAMPLE_ORDER, minOrder ?? 0)),
                off: rupees(example),
              })
            : null,
          endAt.iso
            ? t("promo.confirm.until", { date: dateLabel(endAt.iso) })
            : t("promo.confirm.noEnd"),
          ...warnings.map((w) => issueText(w, t)),
          t("promo.confirm.fixed"),
        ]
          .filter(Boolean)
          .join("\n\n")
      : "";

  return (
    <FormScroll>
      <RegisterField
        label={t("promo.field.code")}
        value={code}
        onChangeText={(next) => {
          setCode(next);
          setTaken(null);
        }}
        placeholder={t("promo.field.codePlaceholder")}
        autoCapitalize="characters"
        maxLength={40}
        problem={
          taken ? t("promo.codeTaken", { code: taken }) : (codeIssue.problem ?? codeIssue.warning)
        }
        hint={
          codeShown
            ? t("promo.field.codeAs", { code: codeShown })
            : t("promo.field.codeHint", { min: COUPON_LIMITS.codeMin })
        }
      />

      <PromoTypePicker
        value={type}
        onChange={(next) => {
          setType(next);
          if (next === "FLAT") setCapText("");
        }}
        problem={typeProblem}
      />

      {type ? (
        <PromoAmountField
          label={type === "PERCENT" ? t("promo.field.percent") : t("promo.field.flat")}
          unit={type === "PERCENT" ? "percent" : "rupees"}
          value={valueText}
          onChangeText={setValueText}
          placeholder={
            type === "PERCENT"
              ? t("promo.field.percentPlaceholder")
              : t("promo.field.flatPlaceholder")
          }
          problem={valueIssue.problem}
          warning={valueIssue.warning}
        />
      ) : null}

      {type === "PERCENT" ? (
        <PromoAmountField
          label={t("promo.field.cap")}
          unit="rupees"
          value={capText}
          onChangeText={setCapText}
          problem={capIssue.problem}
          warning={capIssue.warning}
          hint={t("promo.field.capHint")}
        />
      ) : null}

      <PromoAmountField
        label={t("promo.field.minOrder")}
        unit="rupees"
        value={minText}
        onChangeText={setMinText}
        problem={minIssue.problem}
        warning={minIssue.warning}
        hint={t("promo.field.minOrderHint")}
      />

      <PromoExample type={type} value={value} maxDiscount={cap} minOrder={minOrder} />

      <PromoAmountField
        label={t("promo.field.usage")}
        unit="times"
        value={usageText}
        onChangeText={setUsageText}
        problem={usageIssue.problem}
        warning={usageIssue.warning}
        hint={t("promo.field.usageHint")}
      />

      <PromoAmountField
        label={t("promo.field.perUser")}
        unit="times"
        value={perUserText}
        onChangeText={setPerUserText}
        problem={perUserIssue.problem}
        warning={perUserIssue.warning}
        hint={t("promo.field.perUserHint")}
      />

      <PromoStartPicker
        choice={start}
        typed={startTyped}
        onChoice={setStart}
        onTyped={setStartTyped}
        problem={startProblem}
      />

      <PromoEndPicker
        choice={end}
        typed={endTyped}
        onChoice={setEnd}
        onTyped={setEndTyped}
        problem={endProblem}
        warning={endIssue?.severity === "warning" ? endIssue.text : null}
      />

      <PromoError message={error} />

      <Button label={t("promo.create.review")} size="lg" onPress={review} />

      <Confirm
        visible={confirming}
        title={t("promo.confirm.title", { code: codeShown })}
        message={confirmMessage}
        confirmLabel={t("promo.confirm.yes")}
        cancelLabel={t("promo.confirm.back")}
        busy={create.isPending}
        onConfirm={() => void send()}
        onCancel={() => setConfirming(false)}
      />
    </FormScroll>
  );
}

/* ── editing ──────────────────────────────────────────────────────────────── */

function EditForm({
  coupon,
  shopId,
  asOf,
  canManage,
  onDone,
}: {
  coupon: Coupon;
  shopId: string | null;
  asOf: number;
  canManage: boolean;
  onDone: () => void;
}) {
  const t = useT();
  const actions = useCouponActions(shopId);

  const [minText, setMinText] = React.useState(String(coupon.minOrder));
  const [usageText, setUsageText] = React.useState(
    coupon.usageLimit != null ? String(coupon.usageLimit) : "",
  );
  const [end, setEnd] = React.useState<PromoEnd>(
    coupon.validTo ? { kind: "keep" } : { kind: "none" },
  );
  const [endTyped, setEndTyped] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [confirmSave, setConfirmSave] = React.useState(false);
  const [confirmOff, setConfirmOff] = React.useState(false);

  const state = couponState(coupon, asOf);
  const minParsed = parseWhole(minText);
  // Empty is "no minimum" — which is 0 on this column, not an absent value.
  const minOrder = minParsed === undefined ? 0 : minParsed;
  const usageParsed = parseWhole(usageText);
  const usageCleared = usageParsed === undefined && coupon.usageLimit != null;
  const endAt = resolveEnd(end, endTyped);

  const patch: CouponPatch = {
    ...(minOrder !== coupon.minOrder ? { minOrder } : null),
    ...(usageParsed !== undefined && usageParsed !== coupon.usageLimit
      ? { usageLimit: usageParsed }
      : null),
    ...(endAt.iso ? { validTo: endAt.iso } : null),
  };
  const issues = couponPatchIssues(patch, coupon);
  const minIssue = fieldIssue(issues, "minOrder", t);
  const usageIssue = fieldIssue(issues, "usageLimit", t);
  const endIssue = fieldIssue(issues, "validTo", t);
  const warnings = issues.filter((i) => i.severity === "warning");
  const blocked = issues.some((i) => i.severity === "error") || usageCleared || endAt.bad;
  const changed = Object.keys(patch).length > 0;

  const save = async () => {
    setError(null);
    try {
      await actions.update.mutateAsync({ couponId: coupon.id, patch });
      haptic("success");
      setConfirmSave(false);
      onDone();
    } catch (cause) {
      setConfirmSave(false);
      setError(
        cause instanceof Error && cause.message.trim() !== ""
          ? cause.message
          : t("common.somethingWrong"),
      );
    }
  };

  const turnOff = async () => {
    setError(null);
    try {
      await actions.deactivate.mutateAsync(coupon.id);
      haptic("success");
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message.trim() !== ""
          ? cause.message
          : t("common.somethingWrong"),
      );
    } finally {
      setConfirmOff(false);
    }
  };

  const turnOn = async () => {
    setError(null);
    try {
      await actions.reactivate.mutateAsync(coupon.id);
      haptic("success");
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message.trim() !== ""
          ? cause.message
          : t("common.somethingWrong"),
      );
    }
  };

  // What the code would be if it were switched back on, so the button can say
  // up front when that alone will not make it work.
  const ifOn = couponState({ ...coupon, isActive: true }, asOf);

  const usage =
    coupon.usageLimit != null
      ? t("promo.row.usedOf", { used: coupon.usedCount, limit: coupon.usageLimit })
      : coupon.usedCount === 1
        ? t("promo.row.usedOnce")
        : t("promo.row.used", { used: coupon.usedCount });

  const tone = stateTone(state);
  const toneColor = {
    success: theme.color.success,
    muted: theme.color.textMuted,
    warning: theme.palette.marigold[600],
    brand: theme.color.brand,
  }[tone];

  const started = Date.parse(coupon.validFrom) <= asOf;

  return (
    <FormScroll>
      <Card style={{ gap: theme.spacing[2] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: toneColor }} />
          <Text variant="callout" style={{ color: toneColor }}>
            {stateLabel(state, coupon, t)}
          </Text>
        </View>
        <Text variant="title2" style={{ letterSpacing: 1 }} selectable>
          {coupon.code}
        </Text>
        <Text variant="callout" color="textSecondary">
          {describeCoupon(coupon, t)}
        </Text>
        <Text variant="caption" color="textMuted" tabular>
          {usage}
        </Text>

        {canManage ? (
          coupon.isActive ? (
            <Button
              label={t("promo.off")}
              variant="danger"
              size="sm"
              full={false}
              align="start"
              accessibilityLabel={t("promo.a11yOff", { code: coupon.code })}
              onPress={() => setConfirmOff(true)}
              style={{ marginTop: theme.spacing[2] }}
            />
          ) : (
            <View style={{ gap: theme.spacing[2], marginTop: theme.spacing[2] }}>
              <Button
                label={t("promo.on")}
                variant="secondary"
                size="sm"
                full={false}
                align="start"
                loading={actions.reactivate.isPending}
                accessibilityLabel={t("promo.a11yOn", { code: coupon.code })}
                onPress={() => void turnOn()}
              />
              {ifOn === "EXPIRED" && coupon.validTo ? (
                <Text variant="caption" style={{ color: theme.palette.marigold[600] }}>
                  {t("promo.on.expired", { date: dateLabel(coupon.validTo) })}
                </Text>
              ) : ifOn === "USED_UP" ? (
                <Text variant="caption" style={{ color: theme.palette.marigold[600] }}>
                  {t("promo.on.usedUp")}
                </Text>
              ) : null}
            </View>
          )
        ) : null}
      </Card>

      <PromoError message={error} />

      {/* What can never change, drawn as fact rather than as greyed-out inputs
          that look like they might wake up. */}
      <View style={{ gap: theme.spacing[1] }}>
        <Text variant="overline" color="textMuted">
          {t("promo.fixed.heading")}
        </Text>
        <PromoLockedRow
          label={t("promo.fixed.kind")}
          value={coupon.type === "PERCENT" ? t("promo.type.percent") : t("promo.type.flat")}
        />
        <PromoLockedRow
          label={t("promo.fixed.amount")}
          value={
            coupon.type === "PERCENT"
              ? t("promo.fixed.percentValue", { value: coupon.value })
              : rupees(coupon.value)
          }
        />
        {coupon.type === "PERCENT" ? (
          <PromoLockedRow
            label={t("promo.fixed.cap")}
            value={coupon.maxDiscount != null ? rupees(coupon.maxDiscount) : t("promo.fixed.noCap")}
          />
        ) : null}
        <PromoLockedRow
          label={t("promo.fixed.perUser")}
          value={
            coupon.perUserLimit === 1
              ? t("promo.fixed.once")
              : t("promo.fixed.times", { count: coupon.perUserLimit })
          }
        />
        <PromoLockedRow
          label={started ? t("promo.fixed.started") : t("promo.fixed.starts")}
          value={dateLabel(coupon.validFrom)}
        />
        <Sunken
          style={{ marginTop: theme.spacing[2], flexDirection: "row", gap: theme.spacing[3] }}
        >
          <Ionicons name="information-circle-outline" size={16} color={theme.color.textMuted} />
          <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
            {t("promo.fixed.why")}
          </Text>
        </Sunken>
      </View>

      <PromoExample
        type={coupon.type}
        value={coupon.value}
        maxDiscount={coupon.maxDiscount ?? undefined}
        minOrder={minOrder}
      />

      {canManage ? (
        <>
          <PromoAmountField
            label={t("promo.field.minOrder")}
            unit="rupees"
            value={minText}
            onChangeText={setMinText}
            problem={minIssue?.severity === "error" ? minIssue.text : null}
            warning={minIssue?.severity === "warning" ? minIssue.text : null}
            hint={t("promo.field.minOrderEditHint")}
          />

          <PromoAmountField
            label={t("promo.field.usageEdit")}
            unit="times"
            value={usageText}
            onChangeText={setUsageText}
            problem={
              usageCleared
                ? t("promo.field.usageCantRemove", { limit: coupon.usageLimit ?? 0 })
                : usageIssue?.severity === "error"
                  ? usageIssue.text
                  : null
            }
            warning={usageIssue?.severity === "warning" ? usageIssue.text : null}
            hint={
              coupon.usageLimit == null
                ? t("promo.field.usageNone")
                : t("promo.field.usageUsed", { used: coupon.usedCount })
            }
          />

          <PromoEndPicker
            choice={end}
            typed={endTyped}
            onChoice={setEnd}
            onTyped={setEndTyped}
            current={coupon.validTo}
            problem={
              endAt.bad && endTyped.length >= 10
                ? t("promo.date.bad")
                : endIssue?.severity === "error"
                  ? endIssue.text
                  : null
            }
            warning={endIssue?.severity === "warning" ? endIssue.text : null}
          />

          <Button
            label={t("common.save")}
            size="lg"
            disabled={blocked || !changed}
            loading={actions.update.isPending && !confirmSave}
            onPress={() => {
              if (warnings.length > 0) setConfirmSave(true);
              else void save();
            }}
          />
        </>
      ) : (
        <View style={{ gap: theme.spacing[1] }}>
          <PromoLockedRow
            label={t("promo.field.minOrderShort")}
            value={coupon.minOrder > 0 ? rupees(coupon.minOrder) : t("promo.fixed.anyOrder")}
          />
          <PromoLockedRow
            label={t("promo.field.endShort")}
            value={coupon.validTo ? dateLabel(coupon.validTo) : t("promo.row.noEnd")}
          />
          <Text variant="caption" color="textMuted" style={{ marginTop: theme.spacing[2] }}>
            {t("promo.readOnly")}
          </Text>
        </View>
      )}

      <Confirm
        visible={confirmSave}
        title={t("promo.confirmSave.title", { code: coupon.code })}
        message={warnings.map((w) => issueText(w, t)).join("\n\n")}
        confirmLabel={t("promo.confirmSave.yes")}
        cancelLabel={t("promo.confirm.back")}
        busy={actions.update.isPending}
        onConfirm={() => void save()}
        onCancel={() => setConfirmSave(false)}
      />

      {/* A soft switch, and worded as one: the API keeps the row, its usage
          and the orders that used it, and it can be turned back on. */}
      <Confirm
        visible={confirmOff}
        title={t("promo.confirmOff.title", { code: coupon.code })}
        message={t("promo.confirmOff.detail")}
        confirmLabel={t("promo.off")}
        cancelLabel={t("promo.confirmOff.keep")}
        destructive
        busy={actions.deactivate.isPending}
        onConfirm={() => void turnOff()}
        onCancel={() => setConfirmOff(false)}
      />
    </FormScroll>
  );
}
