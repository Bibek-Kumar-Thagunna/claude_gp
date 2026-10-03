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
} from "@gopasal/native-data/seller-onboarding";
import { Skeleton, Sunken, Text, theme, useT } from "@gopasal/native-ui";
import { RegisterShell } from "../../components/RegisterShell";
import { RegisterField } from "../../components/RegisterField";
import { problemText } from "../../lib/register-problem";

/**
 * Who is behind the shop, and the numbers that make it a business.
 *
 * This step asks for a citizenship number, a PAN, sometimes a VAT number — the
 * things people are rightly careful about typing into an app. So it opens by
 * saying who sees them and why, before asking for the first one. A form that
 * demands a citizenship number with no explanation gets abandoned, and a
 * shopkeeper who abandons it here has already told us their shop's name.
 *
 * The numbers are `autoCapitalize: "characters"` and never autocorrected: a
 * PAN is read off a certificate, and an autocorrect that helpfully lowercases
 * it produces a mismatch nobody can see.
 */
export default function RegisterOwnerStep() {
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
        <Skeleton width="55%" height={22} />
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
    <RegisterShell title={t("register.step.owner")} subtitle={application.reference} draft={draft}>
      <Sunken style={{ flexDirection: "row", gap: theme.spacing[3] }}>
        <Ionicons name="lock-closed-outline" size={16} color={theme.color.textMuted} />
        <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
          {t("register.owner.privacy")}
        </Text>
      </Sunken>

      {field("ownerName", t("register.ownerName"), {
        placeholder: "Bibek Shrestha",
        autoCapitalize: "words",
      })}

      {field("ownerNameNp", t("register.ownerNameNp"), {
        placeholder: "विबेक श्रेष्ठ",
        hint: t("register.optional"),
      })}

      {field("citizenshipNo", t("register.citizenshipNo"), {
        autoCapitalize: "characters",
        hint: t("register.citizenshipNo.hint"),
      })}

      {field("registrationNo", t("register.registrationNo"), {
        autoCapitalize: "characters",
      })}

      {field("panNo", t("register.panNo"), {
        autoCapitalize: "characters",
        keyboardType: "number-pad",
      })}

      {field("vatNo", t("register.vatNo"), {
        autoCapitalize: "characters",
        keyboardType: "number-pad",
        hint: t("register.vatNo.hint"),
      })}
    </RegisterShell>
  );
}
