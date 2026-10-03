import * as React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Settlement } from "@gopasal/native-data/seller";
import { Price, Sunken, Text, theme, useT } from "@gopasal/native-ui";

/**
 * One settlement, as a line a shopkeeper can check against their own book.
 *
 * Two things this row refuses to do:
 *
 *  - **It does not colour the status.** `Settlement.status` is `OPEN`, `PAID` or
 *    `FAILED` and carries no severity beyond the word; painting OPEN amber and
 *    PAID green would be this screen inventing a traffic light the API never
 *    described. Only `FAILED` is coloured, and only because the same type
 *    carries `failureReason` — a failure is a state the wire itself names.
 *  - **It does not sign the amount.** Which way the money went is
 *    `direction`, so the direction is said in words and the figure is drawn
 *    plainly. A minus sign in front of a rupee figure is read as a discount
 *    about as often as it is read as a debt.
 */

function stamp(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function MoneySettlementRow({ settlement }: { settlement: Settlement }) {
  const t = useT();

  const toSeller = settlement.direction === "PAYOUT_TO_SELLER";
  const failed = settlement.status === "FAILED";

  const heading = toSeller ? t("money.settlement.toYou") : t("money.settlement.fromYou");

  const status =
    settlement.status === "PAID"
      ? t("money.settlement.done")
      : settlement.status === "OPEN"
        ? t("money.settlement.open")
        : t("money.settlement.failed");

  // `netAmount` is not documented as signed, so the absolute value is taken
  // rather than assumed either way; `direction` above is what says which way it
  // moved, and it is the field the API guarantees.
  const amount = Math.abs(settlement.netAmount);
  const window = `${stamp(settlement.windowStart)} – ${stamp(settlement.windowEnd)}`;
  const settled = stamp(settlement.completedAt);

  return (
    <Sunken>
      <View
        accessible
        accessibilityLabel={t("money.a11y.settlement", {
          direction: heading,
          amount,
          window,
          status,
        })}
        style={{ gap: 3 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
          <Ionicons
            name={toSeller ? "arrow-down" : "arrow-up"}
            size={13}
            color={theme.color.textMuted}
          />
          <Text variant="callout" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
            {heading}
          </Text>
          <Price value={amount} variant="callout" />
        </View>

        <View style={{ flexDirection: "row", alignItems: "baseline", gap: theme.spacing[2] }}>
          <Text
            variant="caption"
            color="textFaint"
            style={{ flex: 1, minWidth: 0 }}
            numberOfLines={1}
          >
            {window}
            {settled ? ` · ${settled}` : ""}
          </Text>
          <Text variant="caption" color={failed ? "danger" : "textMuted"}>
            {status}
          </Text>
        </View>

        {settlement.payoutDestinationMasked ? (
          <Text variant="caption" color="textFaint" numberOfLines={1}>
            {settlement.payoutDestinationMasked}
          </Text>
        ) : null}

        {/* Printed verbatim: whatever the provider said is the only thing that
            explains a payout that did not arrive, and a generic "something went
            wrong" here would send the shopkeeper to the console to find out. */}
        {failed && settlement.failureReason ? (
          <Text variant="caption" color="danger">
            {settlement.failureReason}
          </Text>
        ) : null}
      </View>
    </Sunken>
  );
}
