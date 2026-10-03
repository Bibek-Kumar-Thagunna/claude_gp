import * as React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ApplicationStanding } from "@gopasal/native-data/seller-onboarding";
import { Card, Sunken, Text, theme, useT } from "@gopasal/native-ui";

/**
 * Where the application stands, said once at the top.
 *
 * Two states earn most of this component's weight, and they are the two a
 * status chip alone handles badly:
 *
 *  - **Waiting.** "Under review" is not enough. An applicant who has heard
 *    nothing for three days needs to see that it *was* sent, when, and that the
 *    silence is GoPasal's to break — otherwise they assume it was lost and
 *    start again, which is how one shop becomes three applications.
 *  - **Handed back.** The reviewer's own words are the most important text on
 *    the screen, and they are written to be read by the applicant. So they get
 *    the room, verbatim, above everything else — not paraphrased into "action
 *    required", which tells nobody anything.
 *
 * The headline is the app's own, one per status. The server's `statusLabel`
 * ("a draft", "submitted and waiting for review") is written to sit inside a
 * sentence the web console builds around it, reads as a fragment on its own,
 * and is English only. It stays as the fallback, so a status the API adds later
 * still gets a headline before the app learns its name.
 */

const TONE: Record<
  ApplicationStanding["next"],
  { icon: keyof typeof Ionicons.glyphMap; ink: string; wash: string }
> = {
  finish: {
    icon: "create-outline",
    ink: theme.color.textSecondary,
    wash: theme.color.surfaceSunken,
  },
  submit: { icon: "paper-plane-outline", ink: theme.color.brand, wash: theme.color.brandSoft },
  wait: {
    icon: "hourglass-outline",
    ink: theme.palette.marigold[600],
    wash: theme.color.warningSoft,
  },
  fix: {
    icon: "alert-circle-outline",
    ink: theme.palette.marigold[600],
    wash: theme.color.warningSoft,
  },
  "open-shop": {
    icon: "checkmark-circle",
    ink: theme.color.success,
    wash: theme.color.successSoft,
  },
  "start-again": {
    icon: "close-circle-outline",
    ink: theme.color.danger,
    wash: theme.color.dangerSoft,
  },
};

export function RegisterStatus({
  standing,
  reference,
}: {
  standing: ApplicationStanding;
  reference: string;
}) {
  const t = useT();
  const tone = TONE[standing.next];

  return (
    <Card style={{ gap: theme.spacing[3] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: theme.radii.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: tone.wash,
          }}
        >
          <Ionicons name={tone.icon} size={19} color={tone.ink} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="title3" numberOfLines={2}>
            {t(`register.headline.${standing.status}`, undefined, standing.headline)}
          </Text>
          {/* The reference is what a shopkeeper reads out on the phone when
              they call to ask. It earns its place for that alone. */}
          <Text variant="caption" color="textFaint" numberOfLines={1}>
            {reference}
          </Text>
        </View>
      </View>

      {standing.decisionNote ? (
        <Sunken style={{ backgroundColor: tone.wash, gap: theme.spacing[1] }}>
          <Text variant="caption" color="textMuted">
            {t("register.status.fromGopasal")}
          </Text>
          <Text variant="callout" style={{ color: theme.color.text }}>
            {standing.decisionNote}
          </Text>
        </Sunken>
      ) : null}

      {standing.waitingOnGopasal ? (
        <Text variant="footnote" color="textSecondary">
          {t("register.status.waiting")}
        </Text>
      ) : null}

      {standing.next === "start-again" ? (
        <Text variant="footnote" color="textSecondary">
          {t("register.status.closed")}
        </Text>
      ) : null}

      {standing.rejectedDocuments.length > 0 ? (
        <View style={{ gap: theme.spacing[2] }}>
          <Text variant="caption" color="textMuted">
            {t("register.status.papersBack")}
          </Text>
          {standing.rejectedDocuments.map((doc) => (
            <View
              key={doc.id}
              style={{ flexDirection: "row", gap: theme.spacing[2], alignItems: "flex-start" }}
            >
              <Ionicons
                name="close-circle"
                size={14}
                color={theme.color.danger}
                style={{ marginTop: 2 }}
              />
              <Text variant="caption" color="textSecondary" style={{ flex: 1, minWidth: 0 }}>
                {/* The kind, then the reviewer's reason. Without the reason a
                    rejected document is just a red mark with no way to fix it. */}
                {t(`register.doc.${doc.kind}`, undefined, doc.kind)}
                {doc.reason ? ` — ${doc.reason}` : ""}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {standing.submitCount > 1 ? (
        <Text variant="caption" color="textFaint">
          {t("register.status.sentTimes", { count: standing.submitCount })}
        </Text>
      ) : null}
    </Card>
  );
}
