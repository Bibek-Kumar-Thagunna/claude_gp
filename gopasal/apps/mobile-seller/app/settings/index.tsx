import * as React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useNavigation, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useSelectedShop, useShopFinance } from "@gopasal/native-data/seller";
import { useCategories } from "@gopasal/native-data/seller-catalog";
import {
  isEmptyPatch,
  shopPaymentMethods,
  shopSettingsDiff,
  shopSettingsIssues,
  useShopDetail,
  useShopSettingsForm,
  type ShopRow as ShopRecord,
  type ShopSettingIssue,
} from "@gopasal/native-data/seller-settings";
import type { ShopSettingsPatch } from "@gopasal/native-data/seller-settings";
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
  useI18n,
} from "@gopasal/native-ui";
import { RegisterField } from "../../components/RegisterField";
import { ShopRow, ShopRowDivider } from "../../components/ShopRow";
import { apiProblemText, settingIssueText } from "../../components/SettingsCopy";
import { SettingsHeader } from "../../components/SettingsHeader";
import { SettingsNoAccess } from "../../components/SettingsNoAccess";
import { SettingsNotice } from "../../components/SettingsNotice";
import { SettingsRadius } from "../../components/SettingsRadius";

/**
 * The shop's whole profile, editable from the phone.
 *
 * ## What is on it, and what is not
 *
 * Exactly `UpdateShopDto`, less the shutter: name (English and Nepali),
 * description, category, emoji, hours, customer phone, area, address, delivery
 * radius, minimum order and solo mode. `isOpen` stays on the Shop tab, where
 * `useShopSettings` flips it optimistically — a second, non-optimistic copy of
 * the shutter here would disagree with that one for a second after every tap.
 *
 * Everything else a shopkeeper would look for is shown and *said to be*
 * someone else's: payment methods (no request body in any scope accepts them),
 * the payout account (lives on the approved application, which nothing can
 * edit), the web address (minted at approval, does not follow a rename), and
 * the logo and cover (columns with no upload route anywhere yet). A disabled
 * input would imply a permission somebody could be granted; a sentence does not.
 *
 * ## How a save works
 *
 *  - **Only what changed is sent.** `shopSettingsDiff` against the values the
 *    form was seeded from, not against the latest fetch — so a field this person
 *    never touched is never sent, and a colleague's edit to it survives.
 *  - **A refetch while editing** moves the untouched fields to the new server
 *    values and leaves the touched ones alone, and says when the two collided.
 *  - **After a save the form is re-seeded from the row the server answered
 *    with**, so what is on screen is what the shop now carries — trimmed,
 *    clamped, whatever the API did to it — and "Saved" means that, not "sent".
 *  - **Validation is the API's rules**, run on the diff only, and shown under
 *    each field.
 *
 * ## Permissions
 *
 * Reading is `dashboard.view` (the manage read), saving is `settings.manage`.
 * Someone with only the first sees the profile as text and no Save bar;
 * someone with neither gets the calm no-access state. The payout card needs
 * `finance.view` and is left out without it rather than shown empty.
 */

const PERM = {
  read: "dashboard.view",
  edit: "settings.manage",
  finance: "finance.view",
} as const;

/** Above this the minimum is almost always a typo — the Shop tab's sheet uses the same figure. */
const MIN_ORDER_SENSIBLE_MAX = 5_000;

type Form = {
  name: string;
  nameNp: string;
  description: string;
  categoryId: string | null;
  emoji: string;
  hours: string;
  phone: string;
  area: string;
  fullAddress: string;
  deliveryRadiusKm: number;
  /** Text, because it is typed; parsed only when diffed. */
  minOrder: string;
  soloMode: boolean;
};

const FORM_KEYS: ReadonlyArray<keyof Form> = [
  "name",
  "nameNp",
  "description",
  "categoryId",
  "emoji",
  "hours",
  "phone",
  "area",
  "fullAddress",
  "deliveryRadiusKm",
  "minOrder",
  "soloMode",
];

function formFrom(row: ShopRecord): Form {
  return {
    name: row.name,
    nameNp: row.nameNp ?? "",
    description: row.description ?? "",
    categoryId: row.categoryId,
    emoji: row.emoji ?? "",
    hours: row.hours ?? "",
    phone: row.phone ?? "",
    area: row.area ?? "",
    fullAddress: row.fullAddress ?? "",
    deliveryRadiusKm: row.deliveryRadiusKm,
    minOrder: String(row.minOrder),
    soloMode: row.soloMode,
  };
}

/**
 * The form as a patch *candidate* — every field, for `shopSettingsDiff` to
 * reduce to what changed.
 *
 * An empty minimum is `NaN`, not 0: a cleared box is not a decision to drop the
 * minimum, and `NaN` makes the validator say so instead of quietly sending 0.
 */
function candidateFrom(form: Form): ShopSettingsPatch {
  const minOrder = form.minOrder.trim() === "" ? Number.NaN : Number(form.minOrder);
  const patch: ShopSettingsPatch = {
    name: form.name,
    nameNp: form.nameNp,
    description: form.description,
    emoji: form.emoji,
    hours: form.hours,
    phone: form.phone,
    area: form.area,
    fullAddress: form.fullAddress,
    deliveryRadiusKm: form.deliveryRadiusKm,
    minOrder,
    soloMode: form.soloMode,
  };
  if (form.categoryId !== null) patch.categoryId = form.categoryId;
  return patch;
}

export default function ShopSettingsScreen() {
  const { t, language } = useI18n();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const { shopId, shop, ready } = useSelectedShop();
  const perms = useShopPermissions(shopId);
  const canRead = perms.has(PERM.read);
  const canEdit = perms.has(PERM.edit);
  const canFinance = perms.has(PERM.finance);

  const detail = useShopDetail(canRead ? shopId : null);
  const finance = useShopFinance(canFinance ? shopId : null);
  const categories = useCategories();
  const saveMutation = useShopSettingsForm(shopId);

  // The manage read when this person may make it; otherwise the row from the
  // shop list, which carries every column the form needs. Someone with only
  // `settings.manage` can then still edit, rather than being shown nothing
  // because a different grant guards a different read.
  const source: ShopRecord | null = detail.data ?? shop ?? null;

  const [base, setBase] = React.useState<ShopRecord | null>(null);
  const [form, setForm] = React.useState<Form | null>(null);
  const [collided, setCollided] = React.useState<Array<keyof Form>>([]);
  const [saved, setSaved] = React.useState<{ count: number } | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [pickingCategory, setPickingCategory] = React.useState(false);

  // Seed on first arrival; afterwards, reconcile. `updatedAt` is the server's
  // own statement that the row moved, which is cheaper and more exact than
  // comparing every column on every render.
  React.useEffect(() => {
    if (!source) return;
    // A different shop (the seller switched) is a fresh form, never a merge:
    // carrying one shop's half-typed hours onto another would be a real edit
    // to the wrong shop.
    if (!base || !form || base.id !== source.id) {
      setBase(source);
      setForm(formFrom(source));
      setCollided([]);
      setSaved(null);
      return;
    }
    if (source.updatedAt === base.updatedAt) return;
    const was = formFrom(base);
    const now = formFrom(source);
    const next: Form = { ...form };
    const clashes: Array<keyof Form> = [];
    for (const key of FORM_KEYS) {
      const touched = form[key] !== was[key];
      const moved = now[key] !== was[key];
      if (!touched) {
        (next as Record<keyof Form, Form[keyof Form]>)[key] = now[key];
      } else if (moved && now[key] !== form[key]) {
        clashes.push(key);
      }
    }
    setBase(source);
    setForm(next);
    setCollided(clashes);
    // Only the source's identity matters here; `base` and `form` are read as
    // they are at that moment on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.id, source?.updatedAt]);

  React.useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(null), 6_000);
    return () => clearTimeout(timer);
  }, [saved]);

  const diff: ShopSettingsPatch = React.useMemo(
    () => (base && form ? shopSettingsDiff(base, candidateFrom(form)) : {}),
    [base, form],
  );
  const issues = React.useMemo(() => shopSettingsIssues(diff), [diff]);
  const dirty = !isEmptyPatch(diff);

  // ── leaving with unsaved edits ─────────────────────────────────────────
  const dirtyRef = React.useRef(dirty);
  dirtyRef.current = dirty && canEdit;
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

  if (!ready || !perms.ready) return <Loading />;

  const title = t("settings.title");

  if (!shop) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.background }}>
        <SettingsHeader title={title} />
        <SettingsNoAccess title={t("shop.choose.title")} detail={t("shop.choose.detail")} />
      </View>
    );
  }

  if (!canRead && !canEdit) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.background }}>
        <SettingsHeader title={title} subtitle={shop.name} />
        <SettingsNoAccess
          title={t("settings.noAccess.title")}
          detail={t("settings.noAccess.detail")}
          restrictionReason={perms.restricted ? perms.restrictionReason : null}
        />
      </View>
    );
  }

  if (!form || !base) return <Loading />;

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setSaved(null);
    setSaveError(null);
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const problemFor = (field: ShopSettingIssue["field"]): string | null => {
    const issue = issues.find((i) => i.field === field);
    if (!issue) return null;
    const value = diff[field];
    return settingIssueText(issue, typeof value === "boolean" ? undefined : value, t);
  };

  const changedCount = Object.keys(diff).length;

  const save = async () => {
    setSaveError(null);
    if (!dirty || issues.length > 0) return;
    try {
      const row = await saveMutation.mutateAsync(diff);
      haptic("success");
      // The row the server answered with — not the form — is what the screen
      // shows from here on.
      setBase(row);
      setForm(formFrom(row));
      setCollided([]);
      setSaved({ count: changedCount });
    } catch (cause) {
      haptic("error");
      setSaveError(apiProblemText(cause, t));
    }
  };

  const view = detail.data ?? shop;
  // The manage read's block when it was fetched, else the shop list's — both
  // are the API's `storefrontReadiness`, so either is the real answer.
  const storefront = detail.data?.storefront ?? shop.storefront;
  const payment = shopPaymentMethods(view);
  const categoryList = categories.data ?? [];
  const categoryName = (id: string | null): string | null => {
    if (id === null) return null;
    const hit =
      categoryList.find((c) => c.id === id) ??
      (detail.data?.category && detail.data.category.id === id ? detail.data.category : null);
    if (!hit) return null;
    return language === "np" ? hit.np : hit.en;
  };

  const radiusChanged = form.deliveryRadiusKm !== base.deliveryRadiusKm;
  const minOrderNumber = Number(form.minOrder);
  const minOrderHigh =
    form.minOrder.trim() !== "" &&
    Number.isFinite(minOrderNumber) &&
    minOrderNumber > MIN_ORDER_SENSIBLE_MAX;

  const payout = (finance.data?.settlements ?? [])
    .filter((s) => s.payoutDestinationMasked)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  const blockerText = (blocker: "APPROVAL" | "VERIFIED_LOCATION" | "DELIVERABLE_PRODUCT") => {
    if (blocker === "APPROVAL") return t("shop.blocker.approval");
    if (blocker === "DELIVERABLE_PRODUCT") return t("shop.blocker.stock");
    return t("settings.blocker.location");
  };

  const hasPin = view.lat !== null && view.lng !== null && view.locationCapturedAt !== null;
  const pinDetail = hasPin
    ? t("settings.location.summary", {
        metres: view.locationAccuracyM ?? "?",
        date: new Date(view.locationCapturedAt!).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
      })
    : t("settings.location.none");

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
      <SettingsHeader
        title={title}
        subtitle={shop.name}
        trailing={
          canEdit && dirty ? (
            <Text variant="caption" color="textMuted">
              {t("settings.unsaved")}
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
            paddingBottom: theme.spacing[8],
            gap: theme.spacing[4],
          }}
          keyboardShouldPersistTaps="handled"
        >
          {!canEdit ? (
            <SettingsNotice tone="quiet">
              {perms.restricted && perms.restrictionReason
                ? perms.restrictionReason
                : t("settings.readOnly")}
            </SettingsNotice>
          ) : null}

          {saved ? (
            <Animated.View entering={FadeIn.duration(160)}>
              <SettingsNotice tone="success">
                {t("settings.saved", { count: saved.count })}
              </SettingsNotice>
            </Animated.View>
          ) : null}

          {collided.length > 0 ? (
            <SettingsNotice tone="warning">{t("settings.collided")}</SettingsNotice>
          ) : null}

          {saveError ? <SettingsNotice tone="danger">{saveError}</SettingsNotice> : null}

          {/* ── visibility ─────────────────────────────────────────── */}
          {storefront.visible ? (
            <SettingsNotice tone="success" icon="eye-outline">
              {t("settings.visible")}
            </SettingsNotice>
          ) : (
            <SettingsNotice tone="warning" icon="eye-off-outline" title={t("shop.hidden.title")}>
              {storefront.blockers.map((blocker) => (
                <Text key={blocker} variant="caption" color="textSecondary">
                  {blockerText(blocker)}
                </Text>
              ))}
              {/* GoPasal's own words to the owner, not a string of ours. */}
              {view.statusReason ? (
                <Text variant="caption" color="textMuted">
                  {view.statusReason}
                </Text>
              ) : null}
            </SettingsNotice>
          )}

          {/* ── what the shop is ───────────────────────────────────── */}
          <Section title={t("settings.section.profile")}>
            {canEdit ? (
              <>
                <RegisterField
                  label={t("settings.name")}
                  value={form.name}
                  onChangeText={(v) => set("name", v)}
                  autoCapitalize="words"
                  problem={problemFor("name")}
                  hint={
                    diff.name !== undefined
                      ? t("settings.nameSlug", { slug: view.slug })
                      : undefined
                  }
                />
                <RegisterField
                  label={t("settings.nameNp")}
                  value={form.nameNp}
                  onChangeText={(v) => set("nameNp", v)}
                  problem={problemFor("nameNp")}
                  hint={t("settings.optional")}
                />
                <RegisterField
                  label={t("settings.description")}
                  value={form.description}
                  onChangeText={(v) => set("description", v)}
                  multiline
                  problem={problemFor("description")}
                  hint={t("settings.descriptionHint", { count: form.description.length })}
                />
                <CategoryField
                  current={categoryName(form.categoryId)}
                  open={pickingCategory}
                  onToggle={() => setPickingCategory((v) => !v)}
                  options={categoryList.map((c) => ({
                    id: c.id,
                    label: language === "np" ? c.np : c.en,
                  }))}
                  loading={categories.isPending}
                  selected={form.categoryId}
                  onPick={(id) => {
                    set("categoryId", id);
                    setPickingCategory(false);
                  }}
                  problem={problemFor("categoryId")}
                />
                <RegisterField
                  label={t("settings.emoji")}
                  value={form.emoji}
                  onChangeText={(v) => set("emoji", v)}
                  autoCapitalize="none"
                  problem={problemFor("emoji")}
                  hint={t("settings.emojiHint")}
                />
                <RegisterField
                  label={t("settings.hours")}
                  value={form.hours}
                  onChangeText={(v) => set("hours", v)}
                  placeholder={t("settings.hoursPlaceholder")}
                  problem={problemFor("hours")}
                  hint={t("settings.hoursHint")}
                />
              </>
            ) : (
              <>
                <ReadRow label={t("settings.name")} value={form.name} />
                <ReadRow label={t("settings.nameNp")} value={form.nameNp} />
                <ReadRow label={t("settings.description")} value={form.description} />
                <ReadRow
                  label={t("settings.category")}
                  value={categoryName(form.categoryId) ?? ""}
                />
                <ReadRow label={t("settings.emoji")} value={form.emoji} />
                <ReadRow label={t("settings.hours")} value={form.hours} />
              </>
            )}
          </Section>

          {/* ── how customers reach it ─────────────────────────────── */}
          <Section title={t("settings.section.contact")}>
            {canEdit ? (
              <>
                <RegisterField
                  label={t("settings.phone")}
                  value={form.phone}
                  onChangeText={(v) => set("phone", v)}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  problem={problemFor("phone")}
                  hint={t("settings.phoneHint")}
                />
                <RegisterField
                  label={t("settings.area")}
                  value={form.area}
                  onChangeText={(v) => set("area", v)}
                  autoCapitalize="words"
                  problem={problemFor("area")}
                  hint={t("settings.areaHint")}
                />
                <RegisterField
                  label={t("settings.address")}
                  value={form.fullAddress}
                  onChangeText={(v) => set("fullAddress", v)}
                  multiline
                  problem={problemFor("fullAddress")}
                  hint={t("settings.addressHint")}
                />
              </>
            ) : (
              <>
                <ReadRow label={t("settings.phone")} value={form.phone} />
                <ReadRow label={t("settings.area")} value={form.area} />
                <ReadRow label={t("settings.address")} value={form.fullAddress} />
              </>
            )}

            <View style={{ gap: theme.spacing[2] }}>
              <Text variant="footnote" color="textSecondary">
                {t("settings.location")}
              </Text>
              {canEdit ? (
                <View
                  style={{
                    borderRadius: theme.radii.lg,
                    borderWidth: 1,
                    borderColor: hasPin ? theme.color.border : theme.color.warning,
                    paddingHorizontal: theme.spacing[3],
                  }}
                >
                  <ShopRow
                    icon={hasPin ? "location" : "location-outline"}
                    label={hasPin ? t("settings.location.recorded") : t("settings.location.record")}
                    detail={pinDetail}
                    onPress={() => router.push("/settings/location")}
                  />
                </View>
              ) : (
                <Text variant="callout">{pinDetail}</Text>
              )}
            </View>
          </Section>

          {/* ── delivery ───────────────────────────────────────────── */}
          <Section title={t("settings.section.delivery")}>
            <View style={{ gap: theme.spacing[2] }}>
              <Text variant="footnote" color="textSecondary">
                {t("settings.radius")}
              </Text>
              {canEdit ? (
                <SettingsRadius
                  value={form.deliveryRadiusKm}
                  was={base.deliveryRadiusKm}
                  onChange={(v) => set("deliveryRadiusKm", v)}
                />
              ) : (
                <Text variant="callout">
                  {t("settings.radius.value", { km: form.deliveryRadiusKm })}
                </Text>
              )}
              <Text variant="caption" color={radiusChanged ? "textSecondary" : "textFaint"}>
                {radiusChanged
                  ? form.deliveryRadiusKm > base.deliveryRadiusKm
                    ? t("settings.radius.wider", {
                        from: base.deliveryRadiusKm,
                        to: form.deliveryRadiusKm,
                      })
                    : t("settings.radius.narrower", {
                        from: form.deliveryRadiusKm,
                        to: base.deliveryRadiusKm,
                      })
                  : t("settings.radius.hint")}
              </Text>
              {problemFor("deliveryRadiusKm") ? (
                <Text variant="caption" style={{ color: theme.color.danger }}>
                  {problemFor("deliveryRadiusKm")}
                </Text>
              ) : null}
            </View>

            {canEdit ? (
              <View style={{ gap: theme.spacing[1] }}>
                <RegisterField
                  label={t("shop.minOrder")}
                  value={form.minOrder}
                  onChangeText={(v) => set("minOrder", v.replace(/\D/g, ""))}
                  keyboardType="number-pad"
                  maxLength={7}
                  problem={problemFor("minOrder")}
                  hint={
                    minOrderHigh
                      ? undefined
                      : form.minOrder === "0"
                        ? t("shop.minOrder.none")
                        : t("settings.minOrderHint")
                  }
                />
                {minOrderHigh && !problemFor("minOrder") ? (
                  <Text variant="caption" style={{ color: theme.palette.marigold[600] }}>
                    {t("shop.minOrder.tooHigh", { amount: MIN_ORDER_SENSIBLE_MAX })}
                  </Text>
                ) : null}
              </View>
            ) : (
              <ReadRow label={t("shop.minOrder")} value={`रु ${form.minOrder}`} />
            )}

            <View style={{ gap: theme.spacing[2] }}>
              <Text variant="footnote" color="textSecondary">
                {t("settings.solo")}
              </Text>
              {canEdit ? (
                <View style={{ flexDirection: "row", gap: theme.spacing[2] }}>
                  <Choice
                    label={t("settings.solo.off")}
                    on={!form.soloMode}
                    onPress={() => set("soloMode", false)}
                  />
                  <Choice
                    label={t("settings.solo.on")}
                    on={form.soloMode}
                    onPress={() => set("soloMode", true)}
                  />
                </View>
              ) : (
                <Text variant="callout">
                  {form.soloMode ? t("settings.solo.on") : t("settings.solo.off")}
                </Text>
              )}
              <Text variant="caption" color="textFaint">
                {t("settings.solo.hint")}
              </Text>
            </View>
          </Section>

          {/* ── decided by GoPasal ─────────────────────────────────── */}
          <Section title={t("settings.section.payments")}>
            <View style={{ gap: theme.spacing[2] }}>
              <PaymentLine on={payment.codEnabled} label={t("settings.pay.cod")} />
              <PaymentLine on={payment.onlinePaymentEnabled} label={t("settings.pay.online")} />
            </View>
            <SettingsNotice tone="quiet">{t("settings.pay.note")}</SettingsNotice>

            {canFinance ? (
              <>
                <ShopRowDivider />
                <View style={{ gap: theme.spacing[1] }}>
                  <Text variant="footnote" color="textSecondary">
                    {t("settings.payout")}
                  </Text>
                  {finance.isPending ? (
                    <Skeleton width="60%" height={18} />
                  ) : payout ? (
                    <Text variant="callout" tabular>
                      {`${payoutMethodLabel(payout.payoutMethod, t)} · ${payout.payoutDestinationMasked ?? ""}`}
                    </Text>
                  ) : (
                    <Text variant="callout" color="textMuted">
                      {finance.isError ? t("money.unavailable") : t("settings.payout.none")}
                    </Text>
                  )}
                </View>
                <SettingsNotice tone="quiet">{t("settings.payout.note")}</SettingsNotice>
              </>
            ) : null}
          </Section>

          <Section title={t("settings.section.elsewhere")}>
            <Text variant="caption" color="textSecondary">
              {t("settings.elsewhere.address", { slug: view.slug })}
            </Text>
            <Text variant="caption" color="textSecondary">
              {t("settings.elsewhere.photos")}
            </Text>
          </Section>
        </ScrollView>

        {canEdit ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.spacing[3],
              paddingHorizontal: theme.spacing[4],
              paddingTop: theme.spacing[3],
              paddingBottom: insets.bottom + theme.spacing[3],
              backgroundColor: theme.color.surface,
              borderTopWidth: 1,
              borderTopColor: theme.color.border,
            }}
          >
            <Text
              variant="caption"
              color={issues.length > 0 ? "danger" : "textMuted"}
              style={{ flex: 1 }}
            >
              {issues.length > 0
                ? t("settings.fixFirst", { count: issues.length })
                : dirty
                  ? t("settings.changes", { count: changedCount })
                  : t("settings.noChanges")}
            </Text>
            <View style={{ flex: 1 }}>
              <Button
                label={saveMutation.isPending ? t("common.saving") : t("common.save")}
                loading={saveMutation.isPending}
                disabled={!dirty || issues.length > 0}
                onPress={() => void save()}
              />
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <Confirm
        visible={confirmDiscard}
        title={t("settings.discardTitle")}
        message={t("settings.discardDetail", { count: changedCount })}
        confirmLabel={t("settings.discard")}
        cancelLabel={t("settings.stay")}
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
    </View>
  );
}

function payoutMethodLabel(
  method: "BANK" | "ESEWA" | "KHALTI" | null,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (method === "BANK") return t("settings.payout.bank");
  if (method === "ESEWA") return t("settings.payout.esewa");
  if (method === "KHALTI") return t("settings.payout.khalti");
  return t("settings.payout.account");
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <Text variant="title3">{title}</Text>
      <View style={{ gap: theme.spacing[4], marginTop: theme.spacing[4] }}>{children}</View>
    </Card>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  const { t } = useI18n();
  return (
    <View style={{ gap: 2 }}>
      <Text variant="footnote" color="textSecondary">
        {label}
      </Text>
      <Text variant="callout" color={value.trim() ? "text" : "textFaint"}>
        {value.trim() ? value : t("settings.empty")}
      </Text>
    </View>
  );
}

function PaymentLine({ on, label }: { on: boolean; label: string }) {
  const { t } = useI18n();
  return (
    <View
      accessible
      accessibilityLabel={
        on
          ? t("settings.pay.onA11y", { method: label })
          : t("settings.pay.offA11y", { method: label })
      }
      style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}
    >
      <Ionicons
        name={on ? "checkmark-circle" : "close-circle-outline"}
        size={18}
        color={on ? theme.color.success : theme.color.textFaint}
      />
      <Text variant="callout" color={on ? "text" : "textMuted"} style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="caption" color="textMuted">
        {on ? t("settings.pay.on") : t("settings.pay.off")}
      </Text>
    </View>
  );
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

/**
 * The category, picked from GoPasal's list.
 *
 * A picker rather than a field because `categoryId` must be a real id — `""`
 * would pass validation and leave the shop pointing at nothing, and no seller
 * route can set it back to null. So there is no "none" option: a shop without
 * a category can be given one, and one with a category can only change it.
 */
function CategoryField({
  current,
  open,
  onToggle,
  options,
  loading,
  selected,
  onPick,
  problem,
}: {
  current: string | null;
  open: boolean;
  onToggle: () => void;
  options: Array<{ id: string; label: string }>;
  loading: boolean;
  selected: string | null;
  onPick: (id: string) => void;
  problem: string | null;
}) {
  const { t } = useI18n();
  return (
    <View style={{ gap: theme.spacing[2] }}>
      <Text variant="footnote" color="textSecondary">
        {t("settings.category")}
      </Text>
      <Touchable
        haptic="light"
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t("settings.categoryA11y", {
          category: current ?? t("settings.empty"),
        })}
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: 50,
          paddingHorizontal: theme.spacing[4],
          borderRadius: theme.radii.lg,
          borderWidth: 1,
          borderColor: problem ? theme.color.danger : theme.color.border,
          backgroundColor: theme.color.surfaceSunken,
        }}
      >
        <Text variant="callout" color={current ? "text" : "textFaint"} style={{ flex: 1 }}>
          {current ?? t("settings.category.choose")}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={theme.color.textMuted}
        />
      </Touchable>
      {open ? (
        loading ? (
          <Skeleton width="100%" height={40} />
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] }}>
            {options.map((option) => {
              const on = option.id === selected;
              return (
                <Touchable
                  key={option.id}
                  haptic="selection"
                  onPress={() => onPick(option.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={option.label}
                  style={{
                    paddingHorizontal: theme.spacing[3],
                    paddingVertical: theme.spacing[2],
                    borderRadius: theme.radii.full,
                    borderWidth: 1,
                    borderColor: on ? theme.color.brand : theme.color.border,
                    backgroundColor: on ? theme.color.brandSoft : theme.color.surface,
                  }}
                >
                  <Text variant="footnote" color={on ? "brand" : "textSecondary"}>
                    {option.label}
                  </Text>
                </Touchable>
              );
            })}
          </View>
        )
      ) : null}
      {problem ? (
        <Text variant="caption" style={{ color: theme.color.danger }}>
          {problem}
        </Text>
      ) : null}
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
      <Skeleton width="45%" height={24} />
      <Skeleton width="100%" height={260} radius={theme.radii.lg} delay={60} />
      <Skeleton width="100%" height={200} radius={theme.radii.lg} delay={120} />
    </View>
  );
}
