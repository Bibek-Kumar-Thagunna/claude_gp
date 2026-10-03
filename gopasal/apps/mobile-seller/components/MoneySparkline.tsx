import * as React from "react";
import { View } from "react-native";
import type { SalesPoint } from "@gopasal/native-data/seller";
import { Price, Text, theme, useT } from "@gopasal/native-ui";

/**
 * A shop's days, drawn as columns out of plain `View`s.
 *
 * No chart library and no SVG, and not only to save a dependency: this is one
 * series of one measure on a 360-point screen, and everything a library would
 * add — axes, ticks, a legend, a tooltip — is either impossible on a phone
 * nobody hovers over or noise around thirty small numbers.
 *
 * What the drawing is careful about:
 *
 *  - **Zero is drawn as zero, not as a gap.** The baseline runs the full width,
 *    so a day with no orders reads as a day with no orders rather than as
 *    missing data. The data layer is explicit that a zero here is a fact.
 *  - **A day with any sales gets at least two points of column.** Rounding a
 *    real morning's work down to nothing would be the chart lying by arithmetic.
 *  - **One value is named, not thirty.** The best day is called out above the
 *    plot; the rest is shape. A number over every column goes unread.
 *  - **The columns carry the colour and the text does not.** Brand fill on the
 *    marks, ink on every label — a crimson caption on paper is decoration that
 *    happens to be unreadable.
 */

const PLOT_HEIGHT = 76;

/** A day with any sales at all must never round away to an invisible column. */
const MIN_COLUMN_HEIGHT = 2;

/** Columns never fill their slot; the leftover is the air the chart reads by. */
const MAX_COLUMN_WIDTH = 24;

/** Past this many days the gaps close to a hairline or the columns vanish. */
const DENSE_AT = 40;

function shortDate(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function MoneySparkline({ series }: { series: SalesPoint[] }) {
  const t = useT();

  const max = series.reduce((highest, point) => Math.max(highest, point.sales), 0);
  const best = series.reduce<SalesPoint | null>(
    (winner, point) =>
      point.sales > 0 && (!winner || point.sales > winner.sales) ? point : winner,
    null,
  );

  // Nothing to draw is not an empty chart with an axis — the screen says "no
  // sales" in words above this, and a flat baseline underneath it would only
  // repeat that in a shape.
  if (series.length === 0 || max <= 0 || !best) return null;

  const gap = series.length > DENSE_AT ? 1 : 2;
  const first = series[0];
  const last = series[series.length - 1];

  return (
    <View style={{ gap: theme.spacing[2] }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: theme.spacing[2] }}>
        <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
          {t("money.byDayPlaced")}
        </Text>
        <Text variant="caption" color="textFaint">
          {t("money.bestDay", { date: shortDate(best.date) })}
        </Text>
        <Price value={best.sales} variant="caption" color="textSecondary" />
      </View>

      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={t("money.a11y.chart", {
          days: series.length,
          date: shortDate(best.date),
          amount: Math.round(best.sales),
        })}
        style={{
          height: PLOT_HEIGHT,
          flexDirection: "row",
          alignItems: "flex-end",
          gap,
          // The baseline is the axis: one hairline, solid, a step off the
          // surface, and never a dashed rule competing with the data.
          borderBottomWidth: 1,
          borderBottomColor: theme.color.border,
          paddingBottom: 1,
        }}
      >
        {series.map((point) => {
          const height =
            point.sales > 0
              ? Math.max(MIN_COLUMN_HEIGHT, Math.round((point.sales / max) * PLOT_HEIGHT))
              : 0;
          return (
            <View
              key={point.date}
              style={{ flex: 1, maxWidth: MAX_COLUMN_WIDTH, alignItems: "stretch" }}
            >
              <View
                style={{
                  height,
                  backgroundColor: theme.color.brand,
                  // Rounded at the data end, square where it meets the
                  // baseline — a column floating on two round corners stops
                  // looking anchored to zero.
                  borderTopLeftRadius: 3,
                  borderTopRightRadius: 3,
                }}
              />
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text variant="caption" color="textFaint">
          {first ? shortDate(first.date) : ""}
        </Text>
        <Text variant="caption" color="textFaint">
          {last ? shortDate(last.date) : ""}
        </Text>
      </View>
    </View>
  );
}
