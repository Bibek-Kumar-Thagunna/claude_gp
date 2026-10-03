import * as React from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  useCartMutations,
  useGopasal,
  useSavedProducts,
  useSavedShops,
  type SearchProduct,
  type Shop,
} from "@gopasal/native-data";
import {
  Button,
  Card,
  ConnectionBanner,
  Price,
  Skeleton,
  Text,
  Thumb,
  Touchable,
  categoryTint,
  palette,
  theme,
  useT,
} from "@gopasal/native-ui";
import { ShopCard } from "../components/ShopCard";

/**
 * Saved shops and products.
 *
 * Two tabs rather than one merged list: a saved shop is somewhere you go and a
 * saved product is something you re-buy, and mixing them makes both harder to
 * scan. The counts sit in the tabs so the split is legible before tapping.
 */

export default function SavedScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useGopasal();
  const { add } = useCartMutations();

  const [tab, setTab] = React.useState<"shops" | "products">("shops");
  const shops = useSavedShops();
  const products = useSavedProducts();

  const shopRows = shops.data ?? [];
  const productRows = products.data ?? [];
  const active = tab === "shops" ? shops : products;
  const rows: (Shop | SearchProduct)[] = tab === "shops" ? shopRows : productRows;

  if (!user) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: theme.spacing[6],
          backgroundColor: theme.color.background,
        }}
      >
        <Text variant="title3" align="center">
          {t("saved.signIn.title")}
        </Text>
        <Button
          label={t("common.continue")}
          full={false}
          onPress={() => router.push("/auth/phone")}
          style={{ marginTop: theme.spacing[5] }}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      <View
        style={{
          paddingTop: insets.top + theme.spacing[2],
          paddingHorizontal: theme.spacing[4],
          gap: theme.spacing[4],
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
          <Touchable
            haptic="light"
            onPress={() => router.back()}
            accessibilityLabel={t("common.back")}
            style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="arrow-back" size={20} color={theme.color.text} />
          </Touchable>
          <Text variant="title2">{t("account.saved")}</Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            gap: theme.spacing[2],
            padding: 4,
            borderRadius: theme.radii.full,
            backgroundColor: theme.color.surfaceSunken,
          }}
        >
          {(
            [
              [
                "shops",
                shopRows.length
                  ? t("saved.tab.shopsCount", { count: shopRows.length })
                  : t("saved.tab.shops"),
              ],
              [
                "products",
                productRows.length
                  ? t("saved.tab.productsCount", { count: productRows.length })
                  : t("saved.tab.products"),
              ],
            ] as const
          ).map(([key, label]) => {
            const on = tab === key;
            return (
              <Touchable
                key={key}
                haptic="selection"
                onPress={() => setTab(key)}
                accessibilityLabel={
                  key === "shops" ? t("saved.a11y.showShops") : t("saved.a11y.showProducts")
                }
                style={{
                  flex: 1,
                  height: 36,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: theme.radii.full,
                  backgroundColor: on ? theme.color.surface : "transparent",
                  ...(on ? theme.shadows.xs : null),
                }}
              >
                <Text variant="caption" style={{ color: on ? theme.color.brand : theme.color.textMuted }}>
                  {label}
                </Text>
              </Touchable>
            );
          })}
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing[4],
          paddingTop: theme.spacing[4],
          paddingBottom: theme.spacing[10],
          gap: theme.spacing[3],
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={active.isFetching && !active.isLoading}
            onRefresh={active.refetch}
            tintColor={theme.color.brand}
            colors={[palette.crimson[500]]}
          />
        }
        renderItem={({ item, index }) =>
          tab === "shops" ? (
            <ShopCard
              shop={item as Shop}
              index={index}
              onPress={() =>
                router.push({ pathname: "/shop/[slug]", params: { slug: (item as Shop).slug } })
              }
            />
          ) : (
            <SavedProductRow product={item as SearchProduct} index={index} onAdd={add.mutate} />
          )
        }
        ListEmptyComponent={
          active.isLoading ? (
            <View style={{ gap: theme.spacing[3] }}>
              {[0, 1].map((i) => (
                <Skeleton key={i} width="100%" height={88} radius={theme.radii.lg} delay={i * 90} />
              ))}
            </View>
          ) : (
            <Animated.View
              entering={FadeIn.duration(260)}
              style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing[6] }}
            >
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: theme.radii["2xl"],
                  backgroundColor: theme.color.brandSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="heart-outline" size={26} color={theme.color.brand} />
              </View>
              <Text variant="title3" style={{ marginTop: theme.spacing[4] }}>
                {t("saved.empty.title")}
              </Text>
              <Text
                variant="footnote"
                color="textMuted"
                align="center"
                style={{ marginTop: theme.spacing[2], maxWidth: 260 }}
              >
                {t("saved.empty.detail")}
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
    </View>
  );
}

function SavedProductRow({
  product,
  index,
  onAdd,
}: {
  product: SearchProduct;
  index: number;
  onAdd: (input: { productId: string; qty: number; label: string }) => void;
}) {
  const t = useT();
  const router = useRouter();
  const tint = categoryTint(product.shop?.category?.hue);
  // A saved product whose shop has since closed or delisted it is still worth
  // showing — with the reason — rather than vanishing from the list silently.
  const unavailable = product.inStock === false || product.shop?.isOpen === false;

  return (
    <Card
      index={index}
      padded={false}
      // The product, not its shop: tapping a search hit for "basmati" and
      // landing on a shelf of ninety other things is the wrong answer to the
      // question that was asked.
      onPress={() => router.push({ pathname: "/product/[id]", params: { id: product.id } })}
      style={unavailable ? { opacity: 0.7 } : undefined}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
          padding: theme.spacing[4],
        }}
      >
        <Thumb
          uri={product.imageUrl ?? product.images?.[0]}
          size={48}
          radius={theme.radii.md}
          tint={tint.bg}
          fallback={<Ionicons name="cube-outline" size={20} color={theme.color.textFaint} />}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="callout" numberOfLines={1}>
            {product.name}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {t("cart.from", { shop: product.shop?.name ?? t("saved.aShop") })}
          </Text>
          <Price value={product.price} variant="caption" style={{ marginTop: 2 }} />
        </View>

        {unavailable ? (
          <Text variant="caption" color="textFaint">
            {product.shop?.isOpen === false ? t("saved.shopClosed") : t("product.soldOut")}
          </Text>
        ) : (
          <Touchable
            haptic="medium"
            onPress={() => onAdd({ productId: product.id, qty: 1, label: product.name })}
            accessibilityLabel={t("saved.addToCart", { name: product.name })}
            style={{
              paddingHorizontal: theme.spacing[4],
              height: 32,
              justifyContent: "center",
              borderRadius: theme.radii.full,
              backgroundColor: theme.color.brandSoft,
              borderWidth: 1,
              borderColor: theme.color.brandBorder,
            }}
          >
            <Text variant="overline" color="brand">
              {t("product.add")}
            </Text>
          </Touchable>
        )}
      </View>
    </Card>
  );
}
