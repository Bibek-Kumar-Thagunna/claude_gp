import * as React from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCategories } from "@gopasal/native-data";
import {
  fieldProblem,
  useApplication,
  useApplicationDraft,
  applicationStanding,
  DELIVERY_RADIUS_RANGE,
  type ApplicationField,
  type FieldProblem,
} from "@gopasal/native-data/seller-onboarding";
import { Skeleton, Sunken, Text, Touchable, theme, useT } from "@gopasal/native-ui";
import { RegisterShell } from "../../components/RegisterShell";
import { RegisterField } from "../../components/RegisterField";
import { RegisterPin, type Pin } from "../../components/RegisterPin";
import { problemText } from "../../lib/register-problem";

/**
 * The shop: what it is called, what it sells, where it is, when it is open.
 *
 * The longest step, and the one a shopkeeper can answer entirely from memory
 * standing at their own counter — which is why it is first. Everything here is
 * a fact about the shop; nothing needs a document or a passbook.
 *
 * The pin sits in the middle rather than at the end, because it is the one
 * field that requires being somewhere in particular, and burying it under the
 * fold is how it gets skipped.
 */
export default function RegisterShopStep() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const query = useApplication(id ?? null);
  const application = query.data ?? null;
  const draft = useApplicationDraft(application);
  const categories = useCategories();

  const standing = application ? applicationStanding(application) : null;
  const mark = (field: ApplicationField): FieldProblem | null =>
    standing ? fieldProblem(standing, field, draft.problems) : null;

  const pin: Pin | null =
    draft.values.lat !== undefined &&
    draft.values.lng !== undefined &&
    draft.values.locationAccuracyM !== undefined
      ? {
          lat: draft.values.lat,
          lng: draft.values.lng,
          accuracyM: draft.values.locationAccuracyM,
        }
      : null;

  if (!application) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.color.background,
          padding: theme.spacing[4],
          gap: theme.spacing[3],
        }}
      >
        <Skeleton width="60%" height={22} />
        <Skeleton width="100%" height={54} radius={theme.radii.lg} delay={60} />
        <Skeleton width="100%" height={54} radius={theme.radii.lg} delay={120} />
      </View>
    );
  }

  const field = (
    name: ApplicationField,
    label: string,
    extra: Partial<React.ComponentProps<typeof RegisterField>> = {},
  ) => (
    <RegisterField
      label={label}
      value={(draft.values[name] as string | undefined) ?? ""}
      onChangeText={(next) => draft.set({ [name]: next })}
      problem={problemText(mark(name), t)}
      flagged={mark(name)?.kind === "changes-requested" ? problemText(mark(name), t) : null}
      {...extra}
    />
  );

  return (
    <RegisterShell title={t("register.step.shop")} subtitle={application.reference} draft={draft}>
      {field("shopName", t("register.shopName"), {
        placeholder: "Namaste Kirana Pasal",
        autoCapitalize: "words",
      })}

      {field("shopNameNp", t("register.shopNameNp"), {
        placeholder: "नमस्ते किराना पसल",
        hint: t("register.shopNameNp.hint"),
      })}

      <CategoryPicker
        value={draft.values.categoryId ?? ""}
        options={(categories.data ?? []).map((c) => ({ id: c.id, en: c.en, np: c.np }))}
        loading={categories.isPending}
        problem={problemText(mark("categoryId"), t)}
        onPick={(categoryId) => draft.set({ categoryId })}
      />

      {field("description", t("register.description"), {
        placeholder: t("register.description.placeholder"),
        multiline: true,
        maxLength: 1000,
      })}

      {field("area", t("register.area"), {
        placeholder: "Baneshwor, Kathmandu",
        autoCapitalize: "words",
      })}

      {field("fullAddress", t("register.fullAddress"), {
        placeholder: "Baneshwor Chowk, Kathmandu 44600",
        multiline: true,
        maxLength: 300,
      })}

      <RegisterPin
        pin={pin}
        disabled={draft.readOnly}
        onPin={(next) =>
          // All three together: the API writes them as one fact and refuses a
          // partial pin, so a screen that set them one at a time would 400.
          draft.set({ lat: next.lat, lng: next.lng, locationAccuracyM: next.accuracyM })
        }
      />

      <RadiusPicker
        value={draft.values.deliveryRadiusKm}
        problem={problemText(mark("deliveryRadiusKm"), t)}
        onPick={(deliveryRadiusKm) => draft.set({ deliveryRadiusKm })}
      />

      {field("hours", t("register.hours"), {
        placeholder: "7am – 9pm",
      })}

      {field("contactPhone", t("register.contactPhone"), {
        placeholder: "98XXXXXXXX",
        keyboardType: "phone-pad",
        autoCapitalize: "none",
      })}

      {field("contactEmail", t("register.contactEmail"), {
        placeholder: "you@example.com",
        keyboardType: "email-address",
        autoCapitalize: "none",
        hint: t("register.contactEmail.hint"),
      })}

      <SoloToggle
        value={draft.values.soloMode ?? false}
        disabled={draft.readOnly}
        onChange={(soloMode) => draft.set({ soloMode })}
      />
    </RegisterShell>
  );
}

/**
 * The category, as tiles rather than a dropdown.
 *
 * There are eight of them and a phone has room. A picker that has to be opened
 * to discover its options makes the shopkeeper tap twice to learn what they
 * were allowed to pick.
 */
function CategoryPicker({
  value,
  options,
  loading,
  problem,
  onPick,
}: {
  value: string;
  options: { id: string; en: string; np: string }[];
  loading: boolean;
  problem: string | null;
  onPick: (id: string) => void;
}) {
  const t = useT();
  return (
    <View style={{ gap: theme.spacing[2] }}>
      <Text variant="footnote" color="textSecondary">
        {t("register.category")}
      </Text>

      {loading ? (
        <Skeleton width="100%" height={44} radius={theme.radii.lg} />
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] }}>
          {options.map((option) => {
            const on = value === option.id;
            return (
              <Touchable
                key={option.id}
                haptic="selection"
                onPress={() => onPick(option.id)}
                accessibilityRole="button"
                accessibilityLabel={option.en}
                style={{
                  paddingHorizontal: theme.spacing[4],
                  height: 38,
                  justifyContent: "center",
                  borderRadius: theme.radii.full,
                  borderWidth: 1,
                  borderColor: on ? theme.color.brand : theme.color.border,
                  backgroundColor: on ? theme.color.brandSoft : theme.color.surface,
                }}
              >
                <Text
                  variant="caption"
                  style={{ color: on ? theme.color.brand : theme.color.textSecondary }}
                >
                  {option.en}
                </Text>
              </Touchable>
            );
          })}
        </View>
      )}

      {problem ? (
        <Text variant="caption" style={{ color: theme.color.danger }}>
          {problem}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * How far the shop delivers.
 *
 * A stepper rather than a text field: the range is 0.5–20 km and every value a
 * shopkeeper actually wants is a round number in it. Typing invites `2.75`,
 * which is a number nobody chose and which the DTO then has to argue about.
 */
const RADII = [0.5, 1, 2, 3, 5, 7, 10, 15, 20] as const;

function RadiusPicker({
  value,
  problem,
  onPick,
}: {
  value: number | undefined;
  problem: string | null;
  onPick: (km: number) => void;
}) {
  const t = useT();
  return (
    <View style={{ gap: theme.spacing[2] }}>
      <Text variant="footnote" color="textSecondary">
        {t("register.radius")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] }}>
        {RADII.map((km) => {
          const on = value === km;
          return (
            <Touchable
              key={km}
              haptic="selection"
              onPress={() => onPick(km)}
              accessibilityRole="button"
              accessibilityLabel={t("register.radius.a11y", { km })}
              style={{
                minWidth: 58,
                height: 38,
                paddingHorizontal: theme.spacing[3],
                alignItems: "center",
                justifyContent: "center",
                borderRadius: theme.radii.full,
                borderWidth: 1,
                borderColor: on ? theme.color.brand : theme.color.border,
                backgroundColor: on ? theme.color.brandSoft : theme.color.surface,
              }}
            >
              <Text
                variant="caption"
                style={{ color: on ? theme.color.brand : theme.color.textSecondary }}
                tabular
              >
                {t("register.radius.km", { km })}
              </Text>
            </Touchable>
          );
        })}
      </View>
      <Text variant="caption" color="textFaint">
        {t("register.radius.hint", {
          min: DELIVERY_RADIUS_RANGE.min,
          max: DELIVERY_RADIUS_RANGE.max,
        })}
      </Text>
      {problem ? (
        <Text variant="caption" style={{ color: theme.color.danger }}>
          {problem}
        </Text>
      ) : null}
    </View>
  );
}

/** Whether the owner delivers personally. It changes who the orders go to. */
function SoloToggle({
  value,
  disabled,
  onChange,
}: {
  value: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  const t = useT();
  return (
    <Touchable
      haptic="selection"
      disabled={disabled}
      onPress={() => onChange(!value)}
      accessibilityRole="button"
      accessibilityLabel={t("register.solo")}
      style={{ opacity: disabled ? 0.6 : 1 }}
    >
      <Sunken
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
          borderWidth: 1,
          borderColor: value ? theme.color.brand : theme.color.border,
          backgroundColor: value ? theme.color.brandSoft : theme.color.surfaceSunken,
        }}
      >
        <Ionicons
          name={value ? "checkbox" : "square-outline"}
          size={20}
          color={value ? theme.color.brand : theme.color.textFaint}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="callout">{t("register.solo")}</Text>
          <Text variant="caption" color="textMuted">
            {t("register.solo.detail")}
          </Text>
        </View>
      </Sunken>
    </Touchable>
  );
}
