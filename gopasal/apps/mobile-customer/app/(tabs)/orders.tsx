import * as React from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useGopasal, useOrders, type Order, type OrderStatus } from "@gopasal/native-data";
import {
  Button,
  Card,
  CategoryArt,
  ConnectionBanner,
  Price,
  Skeleton,
  Text,
  Thumb,
  Touchable,
  palette,
  theme,
  useT,
} from "@gopasal/native-ui";

/**
 * Orders, split by whether anything is still happening.
 *
 * Live orders get a five-dot rail and sit at the top; finished ones are a list
 * you scroll. That split is the whole design — someone opening this tab while
 * waiting for eggs has exactly one question, and it should be answered in the
 * first hundred points of the screen without a tap.
 */

const STAGES: OrderStatus[] = ["PLACED", "ACCEPTED", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED"];
const LIVE: OrderStatus[] = ["PLACED", "ACCEPTED", "PACKED", "OUT_FOR_DELIVERY"];

function stageLabel(status: string, t: ReturnType<typeof useT>): string {
  const labels: Record<string, string> = {
    PLACED: t("orderlist.stage.PLACED"),
    ACCEPTED: t("orderlist.stage.ACCEPTED"),
    PACKED: t("orderlist.stage.PACKED"),
    OUT_FOR_DELIVERY: t("orderlist.stage.OUT_FOR_DELIVERY"),
    DELIVERED: t("orderlist.stage.DELIVERED"),
    CANCELLED: t("orderlist.stage.CANCELLED"),
    REJECTED: t("orderlist.stage.REJECTED"),
  };
  return labels[status] ?? status;
}

function Rail({ status }: { status: OrderStatus }) {
  const current = STAGES.indexOf(status);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      {STAGES.map((stage, index) => (
        <View
          key={stage}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor: index <= current ? theme.color.brand : theme.color.border,
          }}
        />
      ))}
    </View>
  );
}

function OrderCard({ order, index }: { order: Order; index: number }) {
  const t = useT();
  const router = useRouter();
  const live = LIVE.includes(order.status);
  const when = new Date(order.placedAt);

  return (
    <Card
      index={index}
      padded={false}
      onPress={() => router.push({ pathname: "/order/[id]", params: { id: order.id } })}
    >
      <View style={{ padding: theme.spacing[4], gap: theme.spacing[3] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
          <Thumb
            size={44}
            radius={theme.radii.md}
            fallback={<CategoryArt size={28} />}
            emoji={order.shop.emoji ?? "🏪"}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {order.shop.name}
            </Text>
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {t(order.items.length === 1 ? "orderlist.meta.one" : "orderlist.meta.many", {
                code: order.code,
                date: when.toLocaleDateString([], { day: "numeric", month: "short" }),
                count: order.items.length,
              })}
            </Text>
          </View>
          <Price value={order.total} variant="callout" />
        </View>

        {live ? (
          <>
            <Rail status={order.status} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: theme.color.brand,
                }}
              />
              <Text variant="caption" color="brand" style={{ flex: 1 }}>
                {stageLabel(order.status, t)}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={theme.color.textFaint} />
            </View>
          </>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
            <Ionicons
              name={order.status === "DELIVERED" ? "checkmark-circle" : "close-circle"}
              size={14}
              color={order.status === "DELIVERED" ? theme.color.success : theme.color.textFaint}
            />
            <Text
              variant="caption"
              style={{
                flex: 1,
                color:
                  order.status === "DELIVERED" ? theme.color.success : theme.color.textMuted,
              }}
            >
              {stageLabel(order.status, t)}
            </Text>
            <Touchable
              haptic="light"
              onPress={() =>
                router.push({ pathname: "/shop/[slug]", params: { slug: order.shop.slug } })
              }
              accessibilityLabel={t("orderlist.orderAgain.a11y", { shop: order.shop.name })}
              style={{
                paddingHorizontal: theme.spacing[3],
                height: 28,
                justifyContent: "center",
                borderRadius: theme.radii.full,
                backgroundColor: theme.color.brandSoft,
              }}
            >
              <Text variant="overline" color="brand">
                {t("orderlist.orderAgain")}
              </Text>
            </Touchable>
          </View>
        )}
      </View>
    </Card>
  );
}

export default function OrdersTab() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useGopasal();
  const [focused, setFocused] = React.useState(false);

  useFocusEffect(
    React.useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const orders = useOrders();
  const rows = orders.data ?? [];
  const active = rows.filter((o) => LIVE.includes(o.status));
  const past = rows.filter((o) => !LIVE.includes(o.status));

  // Only while this tab is open, and only while something is still moving.
  React.useEffect(() => {
    if (!focused || active.length === 0) return;
    const id = setInterval(() => void orders.refetch(), 20_000);
    return () => clearInterval(id);
  }, [focused, active.length, orders]);

  type Item = { kind: "heading"; title: string } | { kind: "order"; order: Order };
  const items: Item[] = [
    ...(active.length > 0
      ? ([{ kind: "heading", title: t("orderlist.section.live") }] as Item[])
      : []),
    ...active.map((order): Item => ({ kind: "order", order })),
    ...(past.length > 0
      ? ([{ kind: "heading", title: t("orderlist.section.past") }] as Item[])
      : []),
    ...past.map((order): Item => ({ kind: "order", order })),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      <View
        style={{
          paddingTop: insets.top + theme.spacing[3],
          paddingBottom: theme.spacing[4],
          paddingHorizontal: theme.spacing[4],
        }}
      >
        <Text variant="title1">{t("orders.title")}</Text>
      </View>

      {!user ? (
        <SignedOut onPress={() => router.push("/auth/phone")} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, index) =>
            item.kind === "order" ? item.order.id : `${item.title}-${index}`
          }
          contentContainerStyle={{
            paddingHorizontal: theme.spacing[4],
            paddingBottom: theme.spacing[10],
            gap: theme.spacing[3],
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={orders.isFetching && !orders.isLoading}
              onRefresh={orders.refetch}
              tintColor={theme.color.brand}
              colors={[palette.crimson[500]]}
            />
          }
          renderItem={({ item, index }) =>
            item.kind === "heading" ? (
              <Text
                variant="overline"
                color="textFaint"
                style={{ marginTop: index === 0 ? 0 : theme.spacing[4] }}
              >
                {item.title.toUpperCase()}
              </Text>
            ) : (
              <OrderCard order={item.order} index={index} />
            )
          }
          ListEmptyComponent={
            orders.isLoading ? (
              <View style={{ gap: theme.spacing[3] }}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} width="100%" height={104} radius={theme.radii.lg} delay={i * 90} />
                ))}
              </View>
            ) : (
              <Animated.View
                entering={FadeIn.duration(280)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  padding: theme.spacing[6],
                }}
              >
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: theme.radii["2xl"],
                    backgroundColor: theme.color.surfaceSunken,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="receipt-outline" size={28} color={theme.color.textFaint} />
                </View>
                <Text variant="title3" style={{ marginTop: theme.spacing[4] }}>
                  {t("orders.empty.title")}
                </Text>
                <Text
                  variant="footnote"
                  color="textMuted"
                  align="center"
                  style={{ marginTop: theme.spacing[2], maxWidth: 260 }}
                >
                  {t("orders.empty.detail")}
                </Text>
                <Button
                  label={t("home.browseShops")}
                  variant="secondary"
                  full={false}
                  onPress={() => router.push("/(tabs)/home")}
                  style={{ marginTop: theme.spacing[5] }}
                />
              </Animated.View>
            )
          }
        />
      )}
    </View>
  );
}

function SignedOut({ onPress }: { onPress: () => void }) {
  const t = useT();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing[6] }}>
      <Text variant="title3" align="center">
        {t("orderlist.signedOut.title")}
      </Text>
      <Text
        variant="footnote"
        color="textMuted"
        align="center"
        style={{ marginTop: theme.spacing[2], maxWidth: 260 }}
      >
        {t("orderlist.signedOut.detail")}
      </Text>
      <Button
        label={t("common.continue")}
        full={false}
        onPress={onPress}
        style={{ marginTop: theme.spacing[5] }}
      />
    </View>
  );
}
