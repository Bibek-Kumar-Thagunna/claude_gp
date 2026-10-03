import * as React from "react";
import { TextInput, View, type KeyboardTypeOptions, type ReturnKeyTypeOptions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  PRODUCT_LIMITS,
  useCategories,
  type ProductIssue,
} from "@gopasal/native-data/seller-catalog";
import { Skeleton, Text, Touchable, fontFamily, theme, useI18n, useT } from "@gopasal/native-ui";
import { digitsOnly, type ProductForm } from "./ProductFormModel";

export type ProductProblems = Partial<Record<ProductIssue["field"], string>>;

/**
 * One product field: label, box, and the problem directly under it.
 *
 * `RegisterField` is the same idea and is not reused because this form needs
 * three things that one does not do: a ref, so the create screen can go
 * name → price → Save without the shopkeeper reaching for the next box; a
 * currency prefix, so a price box can never be read as a count; and a read-only
 * state for a teammate who may look but not change.
 */
export function ProductField({
  label,
  value,
  onChangeText,
  problem,
  hint,
  prefix,
  keyboardType,
  autoCapitalize = "sentences",
  multiline = false,
  editable = true,
  script,
  autoFocus,
  returnKeyType,
  onSubmitEditing,
  placeholder,
  accessibilityLabel,
  ref,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  problem?: string | null;
  hint?: string | null;
  prefix?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?: boolean;
  editable?: boolean;
  script?: "np";
  autoFocus?: boolean;
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  placeholder?: string;
  accessibilityLabel?: string;
  ref?: React.Ref<TextInput>;
}) {
  const wrong = Boolean(problem);
  return (
    <View style={{ gap: theme.spacing[2] }}>
      <Text variant="footnote" color="textSecondary">
        {label}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: multiline ? "flex-start" : "center",
          gap: theme.spacing[2],
          borderRadius: theme.radii.lg,
          borderWidth: 1,
          borderColor: wrong ? theme.color.danger : theme.color.border,
          backgroundColor: editable ? theme.color.surfaceSunken : theme.color.surface,
          paddingHorizontal: theme.spacing[4],
          paddingVertical: multiline ? theme.spacing[3] : 0,
          minHeight: multiline ? 88 : 50,
        }}
      >
        {prefix ? (
          <Text variant="bodyStrong" color="textMuted">
            {prefix}
          </Text>
        ) : null}
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          placeholder={placeholder}
          placeholderTextColor={theme.color.textFaint}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          autoFocus={autoFocus}
          multiline={multiline}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          submitBehavior={multiline ? "newline" : onSubmitEditing ? "submit" : "blurAndSubmit"}
          accessibilityLabel={accessibilityLabel ?? label}
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: script === "np" ? fontFamily.devanagari : fontFamily.body,
            fontSize: 16,
            lineHeight: multiline ? 22 : undefined,
            color: editable ? theme.color.text : theme.color.textSecondary,
            textAlignVertical: multiline ? "top" : "center",
            minHeight: multiline ? 60 : 48,
          }}
        />
      </View>
      {wrong ? (
        <Text variant="caption" color="danger">
          {problem}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textFaint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

type FieldsProps = {
  form: ProductForm;
  onChange: (patch: Partial<ProductForm>) => void;
  problems: ProductProblems;
  editable: boolean;
};

/**
 * Name and price — the two things a product cannot exist without, and on the
 * create screen the only two a shopkeeper has to type.
 */
export function ProductEssentials({
  form,
  onChange,
  problems,
  editable,
  autoFocus = false,
  nameRef,
  onPriceDone,
}: FieldsProps & {
  autoFocus?: boolean;
  nameRef?: React.Ref<TextInput>;
  onPriceDone?: () => void;
}) {
  const t = useT();
  const priceRef = React.useRef<TextInput>(null);
  return (
    <View style={{ gap: theme.spacing[4] }}>
      <ProductField
        ref={nameRef}
        label={t("product.name")}
        value={form.name}
        onChangeText={(name) => onChange({ name })}
        problem={problems.name}
        editable={editable}
        autoFocus={autoFocus}
        autoCapitalize="words"
        placeholder={t("product.field.namePlaceholder")}
        returnKeyType="next"
        onSubmitEditing={() => priceRef.current?.focus()}
      />
      <ProductField
        ref={priceRef}
        label={t("shelf.price")}
        prefix="रु"
        value={form.price}
        onChangeText={(next) => onChange({ price: digitsOnly(next) })}
        problem={problems.price}
        hint={t("product.field.priceHint")}
        editable={editable}
        keyboardType="number-pad"
        returnKeyType="done"
        onSubmitEditing={onPriceDone}
      />
    </View>
  );
}

/**
 * Everything else `CreateProductDto` accepts.
 *
 * `stock` is shown only on create, and only once counting is switched on. On an
 * existing product the count belongs to the counting sheet, which sends a delta
 * measured from the number on screen; a second box here that *stated* a count
 * would be the same number reachable two ways with opposite meanings.
 */
export function ProductDetails({
  form,
  onChange,
  problems,
  editable,
  mode,
}: FieldsProps & { mode: "create" | "edit" }) {
  const t = useT();
  const tags = form.tags.split(",").filter((tag) => tag.trim()).length;
  return (
    <View style={{ gap: theme.spacing[4] }}>
      <ProductField
        label={t("product.field.nameNp")}
        value={form.nameNp}
        onChangeText={(nameNp) => onChange({ nameNp })}
        problem={problems.nameNp}
        hint={t("product.field.optional")}
        editable={editable}
        script="np"
      />
      <ProductField
        label={t("product.field.mrp")}
        prefix="रु"
        value={form.mrp}
        onChangeText={(next) => onChange({ mrp: digitsOnly(next) })}
        problem={problems.mrp}
        hint={t("product.field.mrpHint")}
        editable={editable}
        keyboardType="number-pad"
      />
      <ProductField
        label={t("product.field.unit")}
        value={form.unit}
        onChangeText={(unit) => onChange({ unit })}
        problem={problems.unit}
        hint={mode === "create" ? t("product.field.unitHintNew") : t("product.field.unitHint")}
        editable={editable}
        autoCapitalize="none"
      />

      <CategoryChips
        value={form.categoryId}
        onChange={(categoryId) => onChange({ categoryId })}
        problem={problems.categoryId}
        editable={editable}
      />

      <ProductField
        label={t("product.field.description")}
        value={form.description}
        onChangeText={(description) => onChange({ description })}
        problem={problems.description}
        hint={t("product.field.descriptionCount", {
          count: form.description.length,
          max: PRODUCT_LIMITS.descriptionMax,
        })}
        editable={editable}
        multiline
      />
      <ProductField
        label={t("product.field.tags")}
        value={form.tags}
        onChangeText={(next) => onChange({ tags: next })}
        problem={problems.tags}
        hint={t("product.field.tagsHint", { count: tags, max: PRODUCT_LIMITS.tagCount })}
        editable={editable}
        autoCapitalize="none"
      />

      <Toggle
        on={form.trackStock}
        editable={editable}
        label={t("product.field.trackStock")}
        detail={
          form.trackStock ? t("product.field.trackStockOn") : t("product.field.trackStockOff")
        }
        onPress={() => onChange({ trackStock: !form.trackStock })}
      />

      {mode === "create" && form.trackStock ? (
        <ProductField
          label={t("product.field.stock")}
          value={form.stock}
          onChangeText={(next) => onChange({ stock: digitsOnly(next) })}
          problem={problems.stock}
          hint={t("product.field.stockHint")}
          editable={editable}
          keyboardType="number-pad"
        />
      ) : null}
    </View>
  );
}

export function Toggle({
  on,
  label,
  detail,
  editable = true,
  onPress,
}: {
  on: boolean;
  label: string;
  detail?: string;
  editable?: boolean;
  onPress: () => void;
}) {
  return (
    <Touchable
      haptic="selection"
      onPress={onPress}
      disabled={!editable}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: !editable }}
      accessibilityLabel={label}
      accessibilityHint={detail}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[3],
        paddingVertical: theme.spacing[2],
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong">{label}</Text>
        {detail ? (
          <Text variant="caption" color="textMuted">
            {detail}
          </Text>
        ) : null}
      </View>
      <View
        style={{
          width: 48,
          height: 28,
          borderRadius: 14,
          padding: 3,
          backgroundColor: on ? theme.color.success : theme.color.borderStrong,
          alignItems: on ? "flex-end" : "flex-start",
        }}
      >
        <View
          style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: theme.color.surface }}
        />
      </View>
    </Touchable>
  );
}

/**
 * The platform's categories as chips, in the shopkeeper's language.
 *
 * Chips rather than a picker because the list is short, fixed and the same for
 * every shop, and a picker hides the answer behind a tap. Tapping the chosen one
 * again clears it — an uncategorised product is a real state the API accepts.
 */
function CategoryChips({
  value,
  onChange,
  problem,
  editable,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  problem?: string;
  editable: boolean;
}) {
  const t = useT();
  const { language } = useI18n();
  const categories = useCategories();
  const list = categories.data ?? [];

  return (
    <View style={{ gap: theme.spacing[2] }}>
      <Text variant="footnote" color="textSecondary">
        {t("product.field.category")}
      </Text>
      {categories.isPending ? (
        <View style={{ flexDirection: "row", gap: theme.spacing[2] }}>
          {[72, 96, 64].map((w) => (
            <Skeleton key={w} width={w} height={34} radius={theme.radii.full} />
          ))}
        </View>
      ) : categories.isError ? (
        <Touchable
          haptic="light"
          onPress={() => void categories.refetch()}
          accessibilityRole="button"
          accessibilityLabel={t("common.retry")}
          style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
        >
          <Ionicons name="refresh" size={14} color={theme.color.textMuted} />
          <Text variant="caption" color="textMuted">
            {t("product.field.categoryFailed")}
          </Text>
        </Touchable>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] }}>
          {[...list]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((category) => {
              const selected = category.id === value;
              const name = language === "np" ? category.np || category.en : category.en;
              return (
                <Touchable
                  key={category.id}
                  haptic="selection"
                  disabled={!editable}
                  onPress={() => onChange(selected ? null : category.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: !editable }}
                  accessibilityLabel={name}
                  style={{
                    height: 34,
                    paddingHorizontal: theme.spacing[3],
                    justifyContent: "center",
                    borderRadius: theme.radii.full,
                    borderWidth: 1,
                    backgroundColor: selected ? theme.color.brand : theme.color.surface,
                    borderColor: selected ? theme.color.brand : theme.color.border,
                  }}
                >
                  <Text
                    variant="caption"
                    color={selected ? "onBrand" : "textSecondary"}
                    script={language === "np" ? "np" : "latin"}
                  >
                    {name}
                  </Text>
                </Touchable>
              );
            })}
        </View>
      )}
      {problem ? (
        <Text variant="caption" color="danger">
          {problem}
        </Text>
      ) : !value ? (
        <Text variant="caption" color="textFaint">
          {t("product.field.categoryNone")}
        </Text>
      ) : null}
    </View>
  );
}
