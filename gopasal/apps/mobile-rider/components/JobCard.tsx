import * as React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  cashToCollect,
  distanceLabel,
  riderStep,
  type RiderDelivery,
  type RiderStep,
} from "@gopasal/native-data/rider";
import { Card, Price, Text, palette, theme, useT } from "@gopasal/native-ui";
import { rider } from "../lib/rider-theme";

type T = ReturnType<typeof useT>;

/** The phase, in the words a rider uses. */
export function stageLabel(step: RiderStep, t: T): string {
  switch (step.stage) {
    case "toShop":
      return t("stage.toShop");
    case "toCustomer":
      return t("stage.toCustomer");
    case "mustReturn":
      return t("stage.mustReturn");
    case "returning":
      return t("stage.returning");
    default:
      return t("stage.done");
  }
}

export function StageChip({ step }: { step: RiderStep }) {
  const t = useT();
  const warn = step.stage === "mustReturn" || step.stage === "returning";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: theme.radii.full,
        backgroundColor: warn ? theme.color.dangerSoft : rider.amberSoft,
      }}
    >
      <Ionicons
        name={
          step.stage === "toShop"
            ? "storefront"
            : step.stage === "toCustomer"
              ? "navigate"
              : "return-down-back"
        }
        size={12}
        color={warn ? theme.color.danger : rider.amberDeep}
      />
      <Text variant="caption" style={{ color: warn ? theme.color.danger : palette.ink[800] }}>
        {stageLabel(step, t)}
      </Text>
    </View>
  );
}

/**
 * A job on the list. The two places on it — from and to — are the first thing
 * read, then whether there is cash to collect, which is the one detail a rider
 * must not discover at the door.
 */
export function JobCard({ job, index, onOpen }: { job: RiderDelivery; index: number; onOpen: () => void }) {
  const t = useT();
  const step = riderStep(job);
  const cash = cashToCollect(job);
  const distance = distanceLabel(job.distanceMeters);

  return (
    <Card index={index} onPress={onOpen} padded={false} style={{ borderColor: rider.amberLine }}>
      <View style={{ padding: theme.spacing[4], gap: theme.spacing[3] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
          <StageChip step={step} />
          <View style={{ flex: 1 }} />
          <Text variant="caption" color="textMuted" tabular>
            {job.order.code}
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: theme.spacing[3] }}>
          <View style={{ alignItems: "center", paddingTop: 4 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: rider.amber }} />
            <View style={{ width: 2, flex: 1, minHeight: 18, backgroundColor: palette.ink[200], marginVertical: 3 }} />
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: palette.ink[900] }} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: theme.spacing[3] }}>
            <View>
              <Text variant="bodyStrong" numberOfLines={1}>
                {job.order.shop.name}
              </Text>
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {job.order.shop.area ?? job.order.shop.fullAddress ?? ""}
              </Text>
            </View>
            <View>
              <Text variant="bodyStrong" numberOfLines={1}>
                {job.order.recipientName}
              </Text>
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {[job.order.area, job.order.landmark].filter(Boolean).join(" · ")}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
          {cash > 0 ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: theme.radii.md,
                backgroundColor: theme.color.warningSoft,
              }}
            >
              <Ionicons name="cash-outline" size={15} color={theme.color.warning} />
              <Text variant="caption">{t("job.collect")}</Text>
              <Price value={cash} variant="footnote" />
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="checkmark-circle" size={15} color={theme.color.success} />
              <Text variant="caption" color="textMuted">
                {t("job.prepaid")}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          {distance ? (
            <Text variant="caption" color="textMuted">
              {distance}
            </Text>
          ) : null}
          <Ionicons name="chevron-forward" size={16} color={theme.color.textFaint} />
        </View>
      </View>
    </Card>
  );
}
