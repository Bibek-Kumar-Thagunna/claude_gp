import * as React from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  useCart,
  useCartMutations,
  useGopasal,
  useProduct,
  useSavedIds,
  useToggleSavedProduct,
  type ProductVariant,
} from "@gopasal/native-data";
import {
  Card,
  ConnectionBanner,
  Price,
  Skeleton,
  Text,
  Thumb,
  Touchable,
  haptic,
  palette,
  theme,
  useT,
} from "@gopasal/native-ui";

/**
 * One product.
 *
 * A shelf row is 56 points tall and has to hold a name, a price and a stepper,
 * which leaves nowhere for the things a seller writes about what they are
 * selling. So this screen exists for the tap on the row: the description, the
 * photographs, every size with its own price and its own stock, and the shop it
 * comes from.
 *
 * The buying control is a bar pinned to the bottom rather than a button in the
 * flow, because on a long description the thing you came to do should not
 * scroll away.
 */

function Chip({ label }: { label: string }) {
  return (
    <View
      style={{
        paddingHorizontal: theme.spacing[3],
        paddingVertical: 5,
        borderRadius: theme.radii.full,
        backgroundColor: theme.color.surfaceSunken,
      }}
    >
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

export default function ProductScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useGopasal();

  const productId = String(id ?? "");
  const query = useProduct(productId);
  const product = query.data;

  const { data: cart } = useCart();
  const { add, setQty } = useCartMutations();
  const saved = useSavedIds();
  const toggleSaved = useToggleSavedProduct();

  const options = (product?.variants ?? []).filter((v) => v.isActive !== false);
  const [chosen, setChosen] = React.useState<string | null>(null);
  React.useEffect(() => {
    // Preselect the first option that can actually be bought, so the bar is
    // never disabled for a reason the customer has to work out.
    if (chosen || options.length === 0) return;
    const first = options.find((v) => v.stock == null || v.stock > 0) ?? options[0];
    setChosen(first.id);
  }, [chosen, options]);

  const variant: ProductVariant | null = options.find((v) => v.id === chosen) ?? null;
  const price = variant?.price ?? product?.price ?? 0;
  const mrp = variant?.mrp ?? product?.mrp ?? null;
  const saving = mrp && mrp > price ? mrp - price : 0;
  const soldOut = variant
    ? variant.stock != null && variant.stock <= 0
    : product?.trackStock === true && (product?.stock ?? 0) <= 0;

  const line = (cart?.items ?? []).find(
    (l) => l.productId === productId && (variant ? l.variantId === variant.id : !l.variantId),
  );
  const isSaved = (saved.data?.productIds ?? []).includes(productId);

  const images = product?.imageUrls?.length
    ? product.imageUrls
    : product?.images?.length
      ? product.images
      : [];

  const onAdd = () => {
    if (!user) {
      router.push("/auth/phone");
      return;
    }
    const label = variant ? `${product!.name} ${variant.name}` : (product?.name ?? "Item");
    if (line) setQty.mutate({ itemId: line.id, qty: line.qty + 1, label });
    else add.mutate({ productId, variantId: variant?.id, qty: 1, label });
    haptic("success");
  };

  if (!product) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.color.background,
          paddingTop: insets.top + 56,
          paddingHorizontal: theme.spacing[4],
          gap: theme.spacing[3],
        }}
      >
        <Skeleton width="100%" height={200} radius={theme.radii.xl} />
        <Skeleton width="65%" height={22} />
        <Skeleton width="40%" height={14} />
        <Skeleton width="100%" height={80} radius={theme.radii.lg} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing[2],
          paddingHorizontal: theme.spacing[4],
          paddingBottom: 120 + insets.bottom,
          gap: theme.spacing[4],
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Touchable
            haptic="light"
            onPress={() => router.back()}
            accessibilityLabel={t("common.back")}
            style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="arrow-back" size={20} color={theme.color.text} />
          </Touchable>
          <View style={{ flex: 1 }} />
          <Touchable
            haptic="none"
            onPress={() => {
              if (!user) {
                router.push("/auth/phone");
                return;
              }
              haptic(isSaved ? "light" : "success");
              toggleSaved.mutate({ productId, saved: isSaved });
            }}
            accessibilityLabel={isSaved ? "Remove from saved products" : "Save this product"}
            style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons
              name={isSaved ? "heart" : "heart-outline"}
              size={21}
              color={isSaved ? theme.color.brand : theme.color.textSecondary}
            />
          </Touchable>
        </View>

        {/* picture, or the honest absence of one */}
        {images.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -theme.spacing[4] }}
          >
            {images.map((uri, i) => (
              <View key={`${uri}-${i}`} style={{ width: 390, paddingHorizontal: theme.spacing[4] }}>
                <Thumb uri={uri} size="fill" radius={theme.radii.xl} style={{ height: 240 }} />
              </View>
            ))}
          </ScrollView>
        ) : (
          <View
            style={{
              height: 180,
              borderRadius: theme.radii.xl,
              backgroundColor: theme.color.surfaceSunken,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="cube-outline" size={44} color={theme.color.textFaint} />
            <Text variant="caption" color="textFaint" style={{ marginTop: theme.spacing[2] }}>
              {t("product.noPhoto")}
            </Text>
          </View>
        )}

        <View>
          <Text variant="title1">{product.name}</Text>
          {product.nameNp ? (
            <Text variant="body" color="textMuted" script="np" style={{ marginTop: 2 }}>
              {product.nameNp}
            </Text>
          ) : null}

          <View
            style={{
              flexDirection: "row",
              alignItems: "baseline",
              gap: theme.spacing[2],
              marginTop: theme.spacing[3],
            }}
          >
            <Price value={price} variant="title2" />
            {saving > 0 && (
              <Price
                value={mrp!}
                variant="callout"
                color="textFaint"
                style={{ textDecorationLine: "line-through" }}
              />
            )}
            {saving > 0 && (
              <Text variant="caption" color="success">
                Save रु {saving.toLocaleString("en-IN")}
              </Text>
            )}
          </View>

          {soldOut ? (
            <Text variant="caption" color="danger" style={{ marginTop: theme.spacing[2] }}>
              {t("product.soldOut")}
            </Text>
          ) : variant?.stock != null && variant.stock <= 5 ? (
            <Text variant="caption" color="warning" style={{ marginTop: theme.spacing[2] }}>
              Only {variant.stock} left
            </Text>
          ) : null}
        </View>

        {/* sizes */}
        {options.length > 0 && (
          <Card>
            <Text variant="title3">Size</Text>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: theme.spacing[2],
                marginTop: theme.spacing[3],
              }}
            >
              {options.map((option) => {
                const on = option.id === chosen;
                const out = option.stock != null && option.stock <= 0;
                return (
                  <Touchable
                    key={option.id}
                    haptic="selection"
                    onPress={() => !out && setChosen(option.id)}
                    disabled={out}
                    accessibilityLabel={
                      out ? `${option.name}, sold out` : `Choose ${option.name}, रु ${option.price}`
                    }
                    style={{
                      paddingHorizontal: theme.spacing[4],
                      paddingVertical: theme.spacing[3],
                      borderRadius: theme.radii.lg,
                      borderWidth: 1,
                      borderColor: on ? theme.color.brand : theme.color.border,
                      backgroundColor: on ? theme.color.brandSoft : theme.color.surface,
                      opacity: out ? 0.45 : 1,
                    }}
                  >
                    <Text variant="callout" style={{ color: on ? theme.color.brand : theme.color.text }}>
                      {option.name}
                    </Text>
                    <Price value={option.price} variant="caption" color="textMuted" />
                  </Touchable>
                );
              })}
            </View>
          </Card>
        )}

        {product.description ? (
          <Card>
            <Text variant="title3">{t("product.about")}</Text>
            <Text variant="body" color="textSecondary" style={{ marginTop: theme.spacing[2] }}>
              {product.description}
            </Text>
          </Card>
        ) : null}

        {(product.tags ?? []).length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] }}>
            {product.tags!.slice(0, 8).map((tag) => (
              <Chip key={tag} label={tag} />
            ))}
          </View>
        )}

        {/* the shop, because who you are buying from matters here */}
        <Touchable
          haptic="light"
          onPress={() => router.push({ pathname: "/shop/[slug]", params: { slug: product.shop.slug } })}
          accessibilityLabel={`Open ${product.shop.name}`}
        >
          <Card padded={false}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing[3],
                padding: theme.spacing[4],
              }}
            >
              <Ionicons name="storefront-outline" size={18} color={theme.color.brand} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="callout" numberOfLines={1}>
                  {product.shop.name}
                </Text>
                <Text variant="caption" color="textMuted">
                  {t("product.seeShelf")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.color.textFaint} />
            </View>
          </Card>
        </Touchable>
      </ScrollView>

      {/* buy bar */}
      <Animated.View
        entering={SlideInDown.duration(240)}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: theme.spacing[4],
          paddingTop: theme.spacing[3],
          paddingBottom: insets.bottom + theme.spacing[3],
          backgroundColor: theme.color.surface,
          borderTopWidth: 1,
          borderTopColor: theme.color.border,
          ...theme.shadows.bar,
        }}
      >
        {line ? (
          <Animated.View
            entering={FadeIn.duration(140)}
            style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                height: 52,
                borderRadius: theme.radii.lg,
                backgroundColor: theme.color.brandSoft,
              }}
            >
              <Touchable
                haptic="light"
                onPress={() =>
                  setQty.mutate({ itemId: line.id, qty: line.qty - 1, label: product.name })
                }
                accessibilityLabel={line.qty === 1 ? "Remove from cart" : "Decrease quantity"}
                style={{ width: 48, height: 52, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons
                  name={line.qty === 1 ? "trash-outline" : "remove"}
                  size={18}
                  color={theme.color.brand}
                />
              </Touchable>
              <Text variant="bodyStrong" style={{ minWidth: 24, textAlign: "center" }} tabular>
                {line.qty}
              </Text>
              <Touchable
                haptic="light"
                onPress={onAdd}
                accessibilityLabel={t("cart.a11y.increase")}
                style={{ width: 48, height: 52, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="add" size={18} color={theme.color.brand} />
              </Touchable>
            </View>

            <Touchable
              haptic="medium"
              onPress={() => router.push("/(tabs)/cart")}
              accessibilityLabel={t("cart.view")}
              style={{
                flex: 1,
                height: 52,
                borderRadius: theme.radii.lg,
                backgroundColor: theme.color.brand,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: theme.spacing[2],
                ...theme.shadows.brand,
              }}
            >
              <Text variant="bodyStrong" style={{ color: palette.white }}>
                {t("cart.view")}
              </Text>
              <Ionicons name="arrow-forward" size={17} color={palette.white} />
            </Touchable>
          </Animated.View>
        ) : (
          <Touchable
            haptic="medium"
            onPress={onAdd}
            disabled={soldOut}
            accessibilityLabel={soldOut ? t("product.soldOut") : t("product.a11y.add", { name: product.name })}
            style={{
              height: 52,
              borderRadius: theme.radii.lg,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: theme.spacing[3],
              backgroundColor: soldOut ? theme.color.surfaceSunken : theme.color.brand,
              ...(soldOut ? {} : theme.shadows.brand),
            }}
          >
            <Text
              variant="bodyStrong"
              style={{ color: soldOut ? theme.color.textMuted : palette.white }}
            >
              {soldOut ? t("product.soldOut") : t("product.addToCart")}
            </Text>
            {!soldOut && (
              <>
                <Text variant="bodyStrong" style={{ color: palette.white, opacity: 0.6 }}>
                  ·
                </Text>
                <Price value={price} variant="bodyStrong" color="onBrand" />
              </>
            )}
          </Touchable>
        )}
      </Animated.View>
    </View>
  );
}
