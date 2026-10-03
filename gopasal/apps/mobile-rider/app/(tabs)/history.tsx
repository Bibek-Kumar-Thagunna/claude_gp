import * as React from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { dayTotals, useRiderHistory, type RiderDelivery } from "@gopasal/native-data/rider";
import {
  Button,
  Card,
  ConnectionBanner,
  Price,
  Skeleton,
  Sunken,
  Text,
  palette,
  theme,
  useT,
} from "@gopasal/native-ui";
import { rider } from "../../lib/rider-theme";

/**
 * What I've done: finished jobs, newest first, grouped under the day they
 * ended, with the day's count and cash at the top. The cash line is the one a
 * rider settles with the shop at the end of a shift, so it is the biggest
 * number on the screen.
 */
export default function History() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const history = useRiderHistory();
  const today = dayTotals(history.rows, new Date());
  const [refreshing, setRefreshing] = React.useState(false);

  const rows = React.useMemo(() => withDays(history.rows), [history.rows]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
      <FlatList
        data={rows}
        keyExtractor={(row) => (row.kind === "day" ? `day-${row.key}` : row.item.id)}
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing[3],
          paddingHorizontal: theme.spacing[4],
          paddingBottom: theme.spacing[8],
          gap: theme.spacing[3],
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void history.refetch().finally(() => setRefreshing(false));
            }}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => history.loadMore()}
        ListHeaderComponent={
          <View style={{ gap: theme.spacing[4], marginBottom: theme.spacing[1] }}>
            <Text variant="title1">{t("history.title")}</Text>
            <View
              style={{
                borderRadius: theme.radii.xl,
                padding: theme.spacing[4],
                backgroundColor: palette.ink[900],
                flexDirection: "row",
                gap: theme.spacing[4],
              }}
            >
              <View style={{ flex: 1 }}>
                <Text variant="caption" style={{ color: palette.ink[300] }}>
                  {t("history.today.cash")}
                </Text>
                <Price value={today.cash} variant="title1" style={{ color: rider.amber }} />
              </View>
              <View style={{ width: 1, backgroundColor: "rgba(255,255,255,0.12)" }} />
              <View style={{ minWidth: 88 }}>
                <Text variant="caption" style={{ color: palette.ink[300] }}>
                  {t("history.today.jobs")}
                </Text>
                <Text variant="title1" tabular style={{ color: palette.white }}>
                  {String(today.delivered)}
                </Text>
              </View>
            </View>
            {today.cash > 0 ? (
              <Text variant="footnote" color="textMuted">
                {t("history.today.settle")}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          history.first.isPending ? (
            <View style={{ gap: theme.spacing[3] }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} width="100%" height={76} radius={theme.radii.lg} delay={i * 80} />
              ))}
            </View>
          ) : history.first.isError ? (
            <Sunken style={{ alignItems: "center", gap: theme.spacing[3], paddingVertical: theme.spacing[6] }}>
              <Text variant="callout" color="textMuted" align="center">
                {t("history.error")}
              </Text>
              <Button label={t("common.retry")} size="sm" variant="secondary" onPress={() => void history.refetch()} />
            </Sunken>
          ) : (
            <Sunken style={{ alignItems: "center", gap: theme.spacing[2], paddingVertical: theme.spacing[8] }}>
              <Ionicons name="time-outline" size={28} color={theme.color.textFaint} />
              <Text variant="bodyStrong">{t("history.empty")}</Text>
              <Text variant="footnote" color="textMuted" align="center">
                {t("history.emptyDetail")}
              </Text>
            </Sunken>
          )
        }
        ListFooterComponent={
          history.loadingMore ? <Skeleton width="100%" height={76} radius={theme.radii.lg} /> : null
        }
        renderItem={({ item: row }) =>
          row.kind === "day" ? (
            <Text variant="overline" color="textMuted" style={{ marginTop: theme.spacing[2] }}>
              {row.label === "today" ? t("history.day.today") : row.label === "yesterday" ? t("history.day.yesterday") : row.label}
            </Text>
          ) : (
            <HistoryRow job={row.item} />
          )
        }
      />
    </View>
  );
}

function HistoryRow({ job }: { job: RiderDelivery }) {
  const t = useT();
  const delivered = job.status === "DELIVERED";
  const returned = job.status === "RETURNED_TO_SHOP";
  const at = job.deliveredAt ?? job.returnedAt ?? job.failedAt ?? job.updatedAt;
  return (
    <Card style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: delivered ? theme.color.successSoft : theme.color.surfaceSunken,
        }}
      >
        <Ionicons
          name={delivered ? "checkmark" : returned ? "return-down-back" : "close"}
          size={18}
          color={delivered ? theme.color.success : theme.color.textMuted}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {job.order.recipientName}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {`${job.order.code} · ${job.order.area} · ${clock(at)}`}
        </Text>
        {!delivered ? (
          <Text variant="caption" color={returned ? "textSecondary" : "danger"} numberOfLines={1}>
            {returned ? t("history.returned") : t("history.failed")}
            {job.failReason ? ` — ${job.failReason}` : ""}
          </Text>
        ) : null}
      </View>
      {delivered && job.codCollected ? (
        <View style={{ alignItems: "flex-end" }}>
          <Price value={job.codAmount} variant="bodyStrong" />
          <Text variant="caption" color="textMuted">
            {t("history.cash")}
          </Text>
        </View>
      ) : delivered ? (
        <Text variant="caption" color="textMuted">
          {t("history.prepaid")}
        </Text>
      ) : null}
    </Card>
  );
}

type Row = { kind: "day"; key: string; label: string } | { kind: "job"; item: RiderDelivery };

function withDays(items: RiderDelivery[]): Row[] {
  const out: Row[] = [];
  let lastKey = "";
  const now = new Date();
  const todayKey = keyOf(now);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yesterdayKey = keyOf(y);
  for (const item of items) {
    const at = new Date(item.deliveredAt ?? item.returnedAt ?? item.failedAt ?? item.updatedAt);
    const key = keyOf(at);
    if (key !== lastKey) {
      lastKey = key;
      out.push({
        kind: "day",
        key,
        label:
          key === todayKey
            ? "today"
            : key === yesterdayKey
              ? "yesterday"
              : at.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      });
    }
    out.push({ kind: "job", item });
  }
  return out;
}

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function clock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
