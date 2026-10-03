import * as React from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  applicationStanding,
  fieldProblem,
  useApplication,
  useApplicationDraft,
  type ApplicationField,
  type FieldProblem,
  type PayoutMethod,
} from "@gopasal/native-data/seller-onboarding";
import { Skeleton, Sunken, Text, Touchable, theme, useT } from "@gopasal/native-ui";
import { RegisterShell } from "../../components/RegisterShell";
import { RegisterField } from "../../components/RegisterField";
import { problemText } from "../../lib/register-problem";

/**
 * Where the money goes.
 *
 * The shortest step and the one with the highest cost of a typo: a wrong digit
 * in an account number is money that leaves GoPasal and does not arrive. Two
 * things follow from that.
 *
 * **The method chooses the questions.** Asking for a bank branch from somebody
 * being paid into eSewa is three empty boxes they have to work out are not for
 * them. Picking the method first and showing only its fields makes the form
 * shorter and the answer unambiguous.
 *
 * **It says that this is hard to change later.** After approval a seller
 * cannot edit their payout destination themselves — it is an admin change, by
 * design, because an account number that can be swapped silently is how payouts
 * get stolen. Telling somebody that *before* they type is the difference
 * between care and a support ticket.
 */

const METHODS: {
  value: PayoutMethod;
  labelKey: string;
  labelEn: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    value: "BANK",
    labelKey: "register.payout.bank",
    labelEn: "Bank account",
    icon: "business-outline",
  },
  {
    value: "ESEWA",
    labelKey: "register.payout.esewa",
    labelEn: "eSewa",
    icon: "phone-portrait-outline",
  },
  {
    value: "KHALTI",
    labelKey: "register.payout.khalti",
    labelEn: "Khalti",
    icon: "phone-portrait-outline",
  },
];

export default function RegisterPayoutStep() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const application = useApplication(id ?? null).data ?? null;
  const draft = useApplicationDraft(application);

  const standing = application ? applicationStanding(application) : null;
  const mark = (field: ApplicationField): FieldProblem | null =>
    standing ? fieldProblem(standing, field, draft.problems) : null;

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
        <Skeleton width="50%" height={22} />
        <Skeleton width="100%" height={54} radius={theme.radii.lg} delay={60} />
      </View>
    );
  }

  const method = draft.values.payoutMethod;

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
    <RegisterShell title={t("register.step.payout")} subtitle={application.reference} draft={draft}>
      <Sunken
        style={{
          flexDirection: "row",
          gap: theme.spacing[3],
          backgroundColor: theme.color.warningSoft,
        }}
      >
        <Ionicons name="alert-circle-outline" size={16} color={theme.palette.marigold[600]} />
        <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
          {t("register.payout.warning")}
        </Text>
      </Sunken>

      <View style={{ gap: theme.spacing[2] }}>
        <Text variant="footnote" color="textSecondary">
          {t("register.payout.how")}
        </Text>
        <View style={{ gap: theme.spacing[2] }}>
          {METHODS.map((option) => {
            const on = method === option.value;
            return (
              <Touchable
                key={option.value}
                haptic="selection"
                disabled={draft.readOnly}
                onPress={() => draft.set({ payoutMethod: option.value })}
                accessibilityRole="button"
                accessibilityLabel={t(option.labelKey, undefined, option.labelEn)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: theme.spacing[3],
                  padding: theme.spacing[4],
                  borderRadius: theme.radii.lg,
                  borderWidth: 1,
                  borderColor: on ? theme.color.brand : theme.color.border,
                  backgroundColor: on ? theme.color.brandSoft : theme.color.surface,
                }}
              >
                <Ionicons
                  name={on ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={on ? theme.color.brand : theme.color.borderStrong}
                />
                <Ionicons name={option.icon} size={17} color={theme.color.textMuted} />
                <Text variant="callout" style={{ flex: 1, minWidth: 0 }}>
                  {t(option.labelKey, undefined, option.labelEn)}
                </Text>
              </Touchable>
            );
          })}
        </View>
        {problemText(mark("payoutMethod"), t) ? (
          <Text variant="caption" style={{ color: theme.color.danger }}>
            {problemText(mark("payoutMethod"), t)}
          </Text>
        ) : null}
      </View>

      {method === "BANK" ? (
        <>
          {field("bankName", t("register.bankName"), {
            placeholder: "Nabil Bank",
            autoCapitalize: "words",
          })}
          {field("bankBranch", t("register.bankBranch"), {
            placeholder: "Baneshwor",
            autoCapitalize: "words",
          })}
          {field("bankAccountName", t("register.bankAccountName"), {
            autoCapitalize: "words",
            hint: t("register.bankAccountName.hint"),
          })}
          {field("bankAccountNo", t("register.bankAccountNo"), {
            keyboardType: "number-pad",
            autoCapitalize: "none",
          })}
        </>
      ) : method ? (
        field(
          "walletNumber",
          method === "ESEWA" ? t("register.walletNumber.esewa") : t("register.walletNumber.khalti"),
          {
            placeholder: "98XXXXXXXX",
            keyboardType: "phone-pad",
            autoCapitalize: "none",
            hint: t("register.walletNumber.hint"),
          },
        )
      ) : null}
    </RegisterShell>
  );
}
