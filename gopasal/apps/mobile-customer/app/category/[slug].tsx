import * as React from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";
import {
  useCategories,
  useCartMutations,
  useDeliveryPoint,
  useHome,
} from "@gopasal/native-data";
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
  categoryTint,
  theme,
  useI18n,
  useT,
} from "@gopasal/native-ui";
import { useCategoryName } from "../../lib/category";
import { ShopCard } from "../../components/ShopCard";

/**
 * One category: the shops in it that deliver here, and its products.
 *
 * Costs nothing extra to open. The home feed is already in the query cache for
 * this location, so this screen reads the same data rather than asking the
 * server the same question with a filter attached — which on a weak link is the
 * difference between a screen that appears and a screen that spins.
 *
 * When a category has nothing nearby it says so plainly. A category that is in
 * the taxonomy but has no open shop in this neighbourhood is the normal state of
 * a hyperlocal app on launch day, not an error, and pretending otherwise by
 * hiding the tile would make the app look like it sells two things.
 */
export default function CategoryScreen() {
  const t = useT();
  const { language } = useI18n();
  const nameOf = useCategoryName();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { point } = useDeliveryPoint();

  const categories = useCategories();
  const home = useHome(point);
  const { add } = useCartMutations();

  const category = (categories.data ?? []).find((c) => c.slug === slug);
  const shops = (home.data?.shops ?? []).filter((s) => s.category?.slug === slug);
  const shelf = (home.data?.shelves ?? []).find((s) => s.category.slug === slug);
  const products = shelf?.products ?? [];
  const tint = categoryTint(category?.hue);
  const loading = home.isLoading || categories.isLoading;

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing[3],
          paddingBottom: theme.spacing[10],
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing[3],
            paddingHorizontal: theme.spacing[4],
          }}
        >
          <Touchable
            haptic="light"
            onPress={() => router.back()}
            accessibilityLabel={t("common.back")}
            style={{
              width: 38,
              height: 38,
              borderRadius: theme.radii.full,
              backgroundColor: theme.color.surface,
              borderWidth: 1,
              borderColor: theme.color.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="arrow-back" size={19} color={theme.color.text} />
          </Touchable>

          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: theme.radii.lg,
              backgroundColor: tint.bg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CategoryArt slug={slug} hue={category?.hue} size={28} />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="title2" numberOfLines={1}>
              {category ? nameOf(category) : t("category.title")}
            </Text>
            {category && (language === "np" ? category.en : category.np) ? (
              <Text
                variant="footnote"
                color="textMuted"
                script={language === "np" ? undefined : "np"}
                numberOfLines={1}
              >
                {language === "np" ? category.en : category.np}
              </Text>
            ) : null}
          </View>
        </View>

        {loading ? (
          <View style={{ paddingHorizontal: theme.spacing[4], marginTop: theme.spacing[6], gap: theme.spacing[3] }}>
            {[0, 1].map((i) => (
              <Skeleton key={i} width="100%" height={96} radius={theme.radii.lg} delay={i * 90} />
            ))}
          </View>
        ) : shops.length === 0 ? (
          <Animated.View
            entering={FadeIn.duration(280)}
            style={{ alignItems: "center", paddingTop: theme.spacing[12], paddingHorizontal: theme.spacing[6] }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: theme.radii["2xl"],
                backgroundColor: tint.bg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CategoryArt slug={slug} hue={category?.hue} size={38} />
            </View>
            <Text variant="title3" align="center" style={{ marginTop: theme.spacing[4] }}>
              {category?.en
                ? t("category.empty.title", { name: nameOf(category).toLowerCase() })
                : t("category.empty.titleGeneric")}
            </Text>
            <Text
              variant="footnote"
              color="textMuted"
              align="center"
              style={{ marginTop: theme.spacing[2], maxWidth: 270 }}
            >
              {t("category.empty.detail", { area: point.label })}
            </Text>
            <Button
              label={t("category.backHome")}
              variant="secondary"
              full={false}
              onPress={() => router.back()}
              style={{ marginTop: theme.spacing[5] }}
            />
          </Animated.View>
        ) : (
          <>
            <View style={{ paddingHorizontal: theme.spacing[4], marginTop: theme.spacing[6], gap: theme.spacing[3] }}>
              <Text variant="title3">
                {shops.length === 1
                  ? t("category.shopsNearby.one")
                  : t("category.shopsNearby.many", { count: shops.length })}
              </Text>
              {shops.map((shop, index) => (
                <ShopCard
                  key={shop.id}
                  shop={shop}
                  index={index}
                  onPress={() => router.push({ pathname: "/shop/[slug]", params: { slug: shop.slug } })}
                />
              ))}
            </View>

            {products.length > 0 && (
              <View style={{ paddingHorizontal: theme.spacing[4], marginTop: theme.spacing[8], gap: theme.spacing[3] }}>
                <Text variant="title3">{t("category.popular")}</Text>
                {products.map((product, index) => (
                  <Card key={product.id} index={index} padded={false}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        padding: theme.spacing[4],
                        gap: theme.spacing[4],
                      }}
                    >
                      <Thumb
                        uri={product.imageUrl ?? product.images?.[0]}
                        size={52}
                        radius={theme.radii.md}
                        fallback={
                          <Ionicons name="cube-outline" size={21} color={theme.color.textFaint} />
                        }
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="bodyStrong" numberOfLines={2}>
                          {product.name}
                        </Text>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "baseline",
                            gap: theme.spacing[2],
                            marginTop: theme.spacing[1],
                          }}
                        >
                          <Price value={product.price} variant="callout" />
                          {product.unit ? (
                            <Text variant="caption" color="textMuted">
                              · {product.unit}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      <Touchable
                        haptic="medium"
                        onPress={() => add.mutate({ productId: product.id, qty: 1, label: product.name })}
                        accessibilityLabel={t("category.addToCart", { name: product.name })}
                        style={{
                          paddingHorizontal: theme.spacing[4],
                          height: 34,
                          borderRadius: theme.radii.full,
                          backgroundColor: theme.color.brandSoft,
                          borderWidth: 1,
                          borderColor: theme.color.brandBorder,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text variant="overline" style={{ color: theme.color.brand }}>
                          {t("product.add")}
                        </Text>
                      </Touchable>
                    </View>
                  </Card>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
