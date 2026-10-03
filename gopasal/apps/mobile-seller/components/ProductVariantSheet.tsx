import * as React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ProductVariant } from "@gopasal/native-data/seller";
import {
  variantDraftIssues,
  type VariantCreateInput,
  type VariantIssue,
  type VariantPatch,
} from "@gopasal/native-data/seller-catalog";
import { Button, Sunken, Text, theme, useT } from "@gopasal/native-ui";
import { ProductField, Toggle } from "./ProductFields";
import { digitsOnly, variantProblems, wholeOrNaN } from "./ProductFormModel";

/**
 * One option of a product — "500 g", "1 kg" — created or edited in a sheet.
 *
 * ## The count here is a total, and the sheet says so three ways
 *
 * The product's own count is changed through `StockSheet`, which sends a
 * *signed delta* and narrates it as "Adding 3 to 12". An option's count is the
 * opposite: `PATCH …/variants/:id` stores exactly the number sent. A shopkeeper
 * who has just learned the first sheet and types "3" here meaning "three more"
 * will set the shelf to three.
 *
 * So the box is labelled as a total, it carries an "=" rather than a "±", and
 * the line under it does the arithmetic in the shopkeeper's own numbers — "to
 * add 5 to 12, type 17" — before they have typed anything, and "was 12, will be
 * exactly 7" after. The submission then carries the value as `absoluteStock`,
 * which is what `useVariantWrites.setStock` names its argument, so the word
 * travels all the way to the request.
 *
 * ## Delete is not in this sheet's power
 *
 * The delete button hands the variant back to the screen rather than asking
 * here, because the question is a `Confirm` dialog and two stacked modals are
 * unreliable on iOS. The screen closes this sheet and asks.
 */

export type VariantSubmission =
  | { kind: "create"; input: VariantCreateInput; isActive: boolean }
  | {
      kind: "edit";
      variantId: string;
      patch: VariantPatch;
      /** The count to store, or null when it did not change. Never a delta. */
      absoluteStock: number | null;
    };

type Draft = {
  name: string;
  sku: string;
  price: string;
  mrp: string;
  stock: string;
  isActive: boolean;
};

const EMPTY: Draft = { name: "", sku: "", price: "", mrp: "", stock: "", isActive: true };

function draftOf(variant: ProductVariant): Draft {
  return {
    name: variant.name,
    sku: variant.sku ?? "",
    price: String(variant.price),
    mrp: variant.mrp == null ? "" : String(variant.mrp),
    stock: String(variant.stock),
    isActive: variant.isActive,
  };
}

/** Built from the snapshot taken at open, never from a refetched variant. */
function submissionOf(draft: Draft, original: ProductVariant | null): VariantSubmission {
  if (!original) {
    const input: VariantCreateInput = { name: draft.name.trim(), price: wholeOrNaN(draft.price) };
    const sku = draft.sku.trim();
    if (sku) input.sku = sku;
    if (draft.mrp !== "") input.mrp = wholeOrNaN(draft.mrp);
    if (draft.stock !== "") input.stock = wholeOrNaN(draft.stock);
    return { kind: "create", input, isActive: draft.isActive };
  }
  const patch: VariantPatch = {};
  const name = draft.name.trim();
  if (name !== original.name) patch.name = name;
  const sku = draft.sku.trim() || null;
  if (sku !== (original.sku ?? null)) patch.sku = sku;
  const price = wholeOrNaN(draft.price);
  if (price !== original.price) patch.price = price;
  const mrp = draft.mrp === "" ? null : wholeOrNaN(draft.mrp);
  if (mrp !== (original.mrp ?? null)) patch.mrp = mrp;
  if (draft.isActive !== original.isActive) patch.isActive = draft.isActive;
  const stock = wholeOrNaN(draft.stock);
  return {
    kind: "edit",
    variantId: original.id,
    patch,
    absoluteStock: stock === original.stock ? null : stock,
  };
}

export function ProductVariantSheet({
  open,
  variant,
  productName,
  busy = false,
  error,
  canDelete,
  onSubmit,
  onDelete,
  onClose,
}: {
  open: boolean;
  /** Null with `open` means a new option. Read once, on the way in. */
  variant: ProductVariant | null;
  productName: string;
  busy?: boolean;
  error?: string | null;
  canDelete: boolean;
  onSubmit: (submission: VariantSubmission) => void;
  onDelete: (variant: ProductVariant) => void;
  onClose: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [original, setOriginal] = React.useState<ProductVariant | null>(null);
  const [draft, setDraft] = React.useState<Draft>(EMPTY);
  const [attempted, setAttempted] = React.useState(false);

  // Keyed on the variant's id, as `StockSheet` is on the product's: the product
  // refetches while this is open, and a new object for the same option must not
  // reset a half-typed price or move "was" out from under the shopkeeper.
  const opened = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!open) {
      opened.current = null;
      return;
    }
    const key = variant?.id ?? "new";
    if (opened.current === key) return;
    opened.current = key;
    setOriginal(variant);
    setDraft(variant ? draftOf(variant) : EMPTY);
    setAttempted(false);
  }, [open, variant]);

  const submission = submissionOf(draft, original);
  const issues: VariantIssue[] =
    submission.kind === "create"
      ? variantDraftIssues(submission.input, "create")
      : variantDraftIssues({ ...submission.patch, stock: wholeOrNaN(draft.stock) }, "patch");
  const problems = variantProblems(t, issues);
  const sentPrice = submission.kind === "create" ? submission.input.price : submission.patch.price;
  if (!problems.price && sentPrice === 0) {
    // The API takes zero, and the shop would then give the option away. Refused
    // here for the same reason the product's own price is.
    problems.price = t("product.priceRequired");
  }
  const shown = attempted ? problems : {};
  const nothingChanged =
    submission.kind === "edit" &&
    Object.keys(submission.patch).length === 0 &&
    submission.absoluteStock === null;

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const save = () => {
    setAttempted(true);
    if (Object.keys(problems).length > 0) return;
    onSubmit(submission);
  };

  const from = original?.stock ?? 0;
  const typed = wholeOrNaN(draft.stock);
  const stockLine = !original
    ? t("product.variant.stockHintNew")
    : Number.isFinite(typed) && typed !== from
      ? t("product.variant.stockWillBe", { from, to: typed })
      : t("product.variant.stockExample", { from, sum: from + 5 });

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View entering={FadeIn.duration(140)} style={{ flex: 1 }}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          style={{ flex: 1, backgroundColor: theme.color.scrim }}
        />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Animated.View
            entering={SlideInDown.duration(240)}
            style={{
              maxHeight: "92%",
              backgroundColor: theme.color.surface,
              borderTopLeftRadius: theme.radii["2xl"],
              borderTopRightRadius: theme.radii["2xl"],
              paddingTop: theme.spacing[3],
            }}
          >
            <View
              style={{
                alignSelf: "center",
                width: 38,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.color.border,
                marginBottom: theme.spacing[3],
              }}
            />
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: theme.spacing[4],
                paddingBottom: insets.bottom + theme.spacing[5],
                gap: theme.spacing[4],
              }}
            >
              <View>
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {productName}
                </Text>
                <Text variant="title3">
                  {original ? t("product.variant.editTitle") : t("product.variant.newTitle")}
                </Text>
              </View>

              <ProductField
                label={t("product.variant.name")}
                value={draft.name}
                onChangeText={(name) => set({ name })}
                problem={shown.name}
                placeholder={t("product.variant.namePlaceholder")}
                autoCapitalize="none"
              />
              <View style={{ flexDirection: "row", gap: theme.spacing[3] }}>
                <View style={{ flex: 1 }}>
                  <ProductField
                    label={t("shelf.price")}
                    prefix="रु"
                    value={draft.price}
                    onChangeText={(next) => set({ price: digitsOnly(next) })}
                    problem={shown.price}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ProductField
                    label={t("product.variant.mrp")}
                    prefix="रु"
                    value={draft.mrp}
                    onChangeText={(next) => set({ mrp: digitsOnly(next) })}
                    problem={shown.mrp}
                    hint={t("product.field.optional")}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              <Sunken style={{ gap: theme.spacing[3], padding: theme.spacing[4] }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: theme.color.infoSoft,
                    }}
                  >
                    <Text variant="callout" color="info">
                      =
                    </Text>
                  </View>
                  <Text variant="bodyStrong" style={{ flex: 1 }}>
                    {t("product.variant.stockTitle")}
                  </Text>
                </View>
                <ProductField
                  label={t("product.variant.stock")}
                  value={draft.stock}
                  onChangeText={(next) => set({ stock: digitsOnly(next) })}
                  problem={shown.stock}
                  hint={stockLine}
                  keyboardType="number-pad"
                  accessibilityLabel={t("product.variant.a11yStock")}
                />
              </Sunken>

              <Toggle
                on={draft.isActive}
                label={t("product.variant.active")}
                detail={
                  draft.isActive ? t("product.variant.activeOn") : t("product.variant.activeOff")
                }
                onPress={() => set({ isActive: !draft.isActive })}
              />

              <ProductField
                label={t("product.variant.sku")}
                value={draft.sku}
                onChangeText={(sku) => set({ sku })}
                problem={shown.sku}
                hint={t("product.field.optional")}
                autoCapitalize="characters"
              />

              {error ? (
                <Sunken
                  style={{
                    flexDirection: "row",
                    gap: theme.spacing[2],
                    backgroundColor: theme.color.dangerSoft,
                  }}
                >
                  <Ionicons name="alert-circle" size={15} color={theme.color.danger} />
                  <Text variant="caption" color="danger" style={{ flex: 1 }}>
                    {error}
                  </Text>
                </Sunken>
              ) : null}

              <View style={{ flexDirection: "row", gap: theme.spacing[3] }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label={t("common.cancel")}
                    variant="secondary"
                    onPress={onClose}
                    disabled={busy}
                  />
                </View>
                <View style={{ flex: 1.4 }}>
                  <Button
                    label={busy ? t("common.saving") : t("common.save")}
                    onPress={save}
                    loading={busy}
                    disabled={nothingChanged}
                  />
                </View>
              </View>

              {original && canDelete ? (
                <Button
                  label={t("product.variant.delete")}
                  variant="danger"
                  haptic="warning"
                  disabled={busy}
                  leading={<Ionicons name="trash-outline" size={16} color={theme.color.danger} />}
                  onPress={() => onDelete(original)}
                />
              ) : null}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}
