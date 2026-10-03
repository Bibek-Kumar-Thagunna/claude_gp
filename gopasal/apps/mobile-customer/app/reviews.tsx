import * as React from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useMyReviews } from "@gopasal/native-data";
import {
  Card,
  ConnectionBanner,
  Skeleton,
  Text,
  Touchable,
  palette,
  theme,
  useT,
} from "@gopasal/native-ui";

/**
 * What you said about your orders.
 *
 * Small screen, real purpose: a rating you left is public on the shop's page,
 * and people should be able to see their own words without hunting through old
 * orders for them. Each row goes back to the order it belongs to, because the
 * next question after "did I say that" is always "which order was that".
 */

function Stars({ rating }: { rating: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons
          key={n}
          name={n <= rating ? "star" : "star-outline"}
          size={13}
          color={n <= rating ? palette.marigold[500] : theme.color.textFaint}
        />
      ))}
    </View>
  );
}

export default function ReviewsScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reviews = useMyReviews();
  const rows = reviews.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing[2],
          paddingHorizontal: theme.spacing[4],
          paddingBottom: theme.spacing[10],
          gap: theme.spacing[3],
        }}
        refreshControl={
          <RefreshControl
            refreshing={reviews.isFetching && !reviews.isLoading}
            onRefresh={reviews.refetch}
            tintColor={theme.color.brand}
            colors={[palette.crimson[500]]}
          />
        }
        ListHeaderComponent={
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.spacing[3],
              marginBottom: theme.spacing[3],
            }}
          >
            <Touchable
              haptic="light"
              onPress={() => router.back()}
              accessibilityLabel={t("common.back")}
              style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="arrow-back" size={20} color={theme.color.text} />
            </Touchable>
            <Text variant="title2" style={{ flex: 1 }}>
              {t("account.reviews")}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <Card
            index={index}
            padded={false}
            onPress={() => router.push({ pathname: "/order/[id]", params: { id: item.orderId } })}
          >
            <View style={{ padding: theme.spacing[4], gap: theme.spacing[2] }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
                <Stars rating={item.rating} />
                <Text variant="caption" color="textFaint" style={{ flex: 1 }} numberOfLines={1}>
                  {item.shop?.name ?? t("reviews.order")}
                </Text>
                <Text variant="caption" color="textFaint">
                  {new Date(item.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </Text>
              </View>
              {item.comment ? (
                <Text variant="footnote" color="textSecondary">
                  {item.comment}
                </Text>
              ) : (
                <Text variant="footnote" color="textFaint">
                  {t("reviews.ratingOnly")}
                </Text>
              )}
            </View>
          </Card>
        )}
        ListEmptyComponent={
          reviews.isLoading ? (
            <View style={{ gap: theme.spacing[3] }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} width="100%" height={72} radius={theme.radii.lg} delay={i * 80} />
              ))}
            </View>
          ) : (
            <View style={{ alignItems: "center", paddingTop: theme.spacing[10] }}>
              <Ionicons name="star-outline" size={30} color={theme.color.textFaint} />
              <Text variant="body" color="textMuted" style={{ marginTop: theme.spacing[3] }}>
                {t("reviews.empty.title")}
              </Text>
              <Text
                variant="caption"
                color="textFaint"
                align="center"
                style={{ marginTop: theme.spacing[2], maxWidth: 260 }}
              >
                {t("reviews.empty.detail")}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}
