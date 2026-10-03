import * as React from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useSelectedShop } from "@gopasal/native-data/seller";
import { useShopPermissions } from "@gopasal/native-data/seller-team";
import {
  useShopCouponPages,
  type Coupon,
  type CouponQuery,
  type CouponStatusFilter,
} from "@gopasal/native-data/seller-promotions";
import { Button, ConnectionBanner, Sunken, Text, Touchable, theme, useT } from "@gopasal/native-ui";
import { PromoCouponRow } from "../../components/PromoCouponRow";
import { PROMO_PERMISSIONS } from "../../components/PromoCopy";
import { PromoHeader, PromoLoading, PromoNoAccess, PromoNotice } from "../../components/PromoFrame";

/**
 * The shop's coupons.
 *
 * Opened to answer one question — **which codes work right now?** — so the
 * filter chips are the server's own running/idle split and their counts are the
 * shop-wide summary, which does not move when a chip is tapped. "Not working"
 * is one bucket on purpose: to a customer, turned off, not started, ended and
 * used up are the same thing, and each row says which.
 *
 * Only this shop's codes are listed. GoPasal's own platform-wide offers can
 * also apply to this shop's orders, and no seller route lists them, so the
 * footer says so rather than letting this read as every code a customer has.
 */

/** One generous page. The API caps `limit` at 100; a kirana rarely has twenty codes. */
const PAGE_LIMIT = 50;

type Filter = "all" | CouponStatusFilter;

export default function PromotionsScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { shopId, shop, ready } = useSelectedShop();
  const permissions = useShopPermissions(shopId);
  const canView = permissions.has(PROMO_PERMISSIONS.view);
  const canManage = permissions.has(PROMO_PERMISSIONS.manage);

  const [filter, setFilter] = React.useState<Filter>("all");
  const query = React.useMemo<CouponQuery>(
    () => ({
      limit: PAGE_LIMIT,
      sort: "newest",
      ...(filter === "all" ? null : { status: filter }),
    }),
    [filter],
  );

  // Not asked for without `promotions.view` — that would be a 403 on every
  // visit to learn what `/auth/me` already said.
  const paged = useShopCouponPages(permissions.ready && canView ? shopId : null, query);
  const coupons = paged.first;
  const summary = coupons.data?.summary;
  const rows = paged.rows;
  const asOf = summary ? Date.parse(summary.asOf) : Date.now();

  const open = (coupon: Coupon) =>
    router.push({ pathname: "/promotions/edit", params: { id: coupon.id, code: coupon.code } });

  const gate = (() => {
    if (!ready || !permissions.ready) return <PromoLoading />;
    if (!shop) {
      return (
        <PromoNotice
          icon="storefront-outline"
          title={t("shop.choose.title")}
          detail={t("shop.choose.detail")}
          actionLabel={t("shop.switch")}
          onAction={() => router.push("/shop-picker")}
        />
      );
    }
    if (!canView) {
      return (
        <PromoNoAccess
          restricted={permissions.restricted}
          restrictionReason={permissions.restrictionReason}
          what={t("promo.what.list")}
        />
      );
    }
    return null;
  })();

  const listHead = (
    <View style={{ gap: theme.spacing[3], paddingBottom: theme.spacing[1] }}>
      {canManage ? (
        <Button
          label={t("promo.new")}
          leading={<Ionicons name="add" size={18} color={theme.color.onBrand} />}
          onPress={() => router.push("/promotions/edit")}
        />
      ) : (
        <Sunken style={{ flexDirection: "row", gap: theme.spacing[3] }}>
          <Ionicons name="eye-outline" size={16} color={theme.color.textMuted} />
          <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
            {t("promo.readOnly")}
          </Text>
        </Sunken>
      )}

      {summary && summary.total > 0 ? (
        <>
          <Text variant="footnote" color="textSecondary">
            {summary.redemptions === 1
              ? t("promo.summary.one", { running: summary.running })
              : t("promo.summary", { running: summary.running, used: summary.redemptions })}
          </Text>
          <View style={{ flexDirection: "row", gap: theme.spacing[2] }}>
            <Chip
              label={t("promo.filter.all")}
              count={summary.total}
              on={filter === "all"}
              onPress={() => setFilter("all")}
            />
            <Chip
              label={t("promo.filter.running")}
              count={summary.running}
              on={filter === "running"}
              onPress={() => setFilter("running")}
            />
            <Chip
              label={t("promo.filter.idle")}
              count={summary.idle}
              on={filter === "idle"}
              onPress={() => setFilter("idle")}
            />
          </View>
        </>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
      <PromoHeader title={t("promo.title")} subtitle={shop?.name ?? null} />

      {gate ? (
        <View style={{ padding: theme.spacing[4] }}>{gate}</View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(coupon) => coupon.id}
          contentContainerStyle={{
            padding: theme.spacing[4],
            paddingBottom: theme.spacing[10] + insets.bottom,
            gap: theme.spacing[3],
          }}
          refreshControl={
            <RefreshControl
              refreshing={coupons.isRefetching}
              onRefresh={() => void paged.refetch()}
              tintColor={theme.color.brand}
            />
          }
          ListHeaderComponent={listHead}
          renderItem={({ item, index }) => (
            <PromoCouponRow coupon={item} at={asOf} index={index} onPress={() => open(item)} />
          )}
          ListEmptyComponent={
            coupons.isLoading ? (
              <PromoLoading />
            ) : coupons.isError ? (
              <PromoNotice
                icon="cloud-offline-outline"
                title={t("promo.failed.title")}
                detail={t("shop.picker.failed.detail")}
                actionLabel={t("common.retry")}
                onAction={() => void coupons.refetch()}
              />
            ) : summary && summary.total > 0 ? (
              <PromoNotice
                icon={filter === "running" ? "pricetags-outline" : "checkmark-done-outline"}
                title={filter === "running" ? t("promo.empty.running") : t("promo.empty.idle")}
                detail={
                  filter === "running"
                    ? t("promo.empty.runningDetail")
                    : t("promo.empty.idleDetail")
                }
              />
            ) : (
              <PromoNotice
                icon="pricetag-outline"
                title={t("promo.empty.title")}
                detail={t("promo.empty.detail")}
                actionLabel={canManage ? t("promo.empty.make") : undefined}
                onAction={canManage ? () => router.push("/promotions/edit") : undefined}
              />
            )
          }
          ListFooterComponent={
            coupons.data ? (
              <View style={{ gap: theme.spacing[2], paddingTop: theme.spacing[4] }}>
                {paged.hasMore ? (
                  <Button
                    label={t("list.showMore", { shown: rows.length, total: paged.total })}
                    variant="secondary"
                    loading={paged.loadingMore}
                    onPress={paged.loadMore}
                  />
                ) : null}
                <Text variant="caption" color="textFaint" align="center">
                  {t("promo.platformNote")}
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

function Chip({
  label,
  count,
  on,
  onPress,
}: {
  label: string;
  count: number;
  on: boolean;
  onPress: () => void;
}) {
  const t = useT();
  return (
    <Touchable
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={t("promo.filter.a11y", { label, count })}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        height: 34,
        paddingHorizontal: theme.spacing[3],
        borderRadius: theme.radii.full,
        borderWidth: 1,
        backgroundColor: on ? theme.color.brand : theme.color.surface,
        borderColor: on ? theme.color.brand : theme.color.border,
      }}
    >
      <Text variant="caption" color={on ? "onBrand" : "textSecondary"}>
        {label}
      </Text>
      <Text variant="caption" color={on ? "onBrand" : "textFaint"} tabular>
        {String(count)}
      </Text>
    </Touchable>
  );
}
