import * as React from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInUp, SlideInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  useCart,
  useCartMutations,
  useGopasal,
  useOffers,
  useShop,
  useShopProducts,
  type Product,
} from "@gopasal/native-data";
import {
  Card,
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
import { OfferCarousel } from "../../components/OfferCarousel";
import { ShopHero } from "../../components/ShopHero";
import { VariantSheet } from "../../components/VariantSheet";

/**
 * One shop, and its shelf.
 *
 * The stepper on each row is the screen's whole reason for existing, and it is
 * where a native app either feels immediate or does not. Every tap writes to the
 * cached cart straight away and the request goes through the outbox behind it —
 * so the number moves on the frame the finger lands, works with no signal, and
 * rolls back visibly if the server disagrees.
 *
 * Out-of-stock rows stay on the shelf, dimmed. Removing them makes a small
 * kirana look emptier than it is and leaves the customer wondering whether they
 * misremembered.
 */

function Stepper({
  qty,
  busy,
  onAdd,
  onRemove,
  disabled,
}: {
  qty: number;
  busy?: boolean;
  onAdd: () => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const t = useT();
  if (qty === 0) {
    return (
      <Touchable
        haptic="medium"
        onPress={onAdd}
        disabled={disabled}
        accessibilityLabel={t("product.addToCart")}
        style={{
          height: 36,
          paddingHorizontal: theme.spacing[4],
          borderRadius: theme.radii.full,
          backgroundColor: theme.color.brandSoft,
          borderWidth: 1,
          borderColor: theme.color.brandBorder,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text variant="caption" color="brand">
          {t("product.add")}
        </Text>
      </Touchable>
    );
  }

  return (
    <Animated.View
      entering={FadeIn.duration(140)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        height: 36,
        borderRadius: theme.radii.full,
        backgroundColor: theme.color.brand,
        opacity: busy ? 0.75 : 1,
      }}
    >
      <Touchable
        haptic="light"
        onPress={onRemove}
        accessibilityLabel={qty === 1 ? "Remove from cart" : "Decrease quantity"}
        style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
      >
        <Ionicons name={qty === 1 ? "trash-outline" : "remove"} size={16} color={palette.white} />
      </Touchable>
      <Text variant="caption" style={{ color: palette.white, minWidth: 18, textAlign: "center" }} tabular>
        {qty}
      </Text>
      <Touchable
        haptic="light"
        onPress={onAdd}
        disabled={disabled}
        accessibilityLabel={t("cart.a11y.increase")}
        style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
      >
        <Ionicons name="add" size={16} color={palette.white} />
      </Touchable>
    </Animated.View>
  );
}

/** A cart line for a product that is sold in options. */
type VariantLine = { id: string; variantId: string; variantName: string; qty: number };

function ProductRow({
  product,
  index,
  qty,
  lines,
  onAdd,
  onRemove,
  onLineQty,
  onOpen,
}: {
  product: Product;
  index: number;
  /** Total across every option of this product, so the row reads at a glance. */
  qty: number;
  lines: VariantLine[];
  onAdd: () => void;
  onRemove: () => void;
  onLineQty: (line: VariantLine, qty: number) => void;
  onOpen: () => void;
}) {
  const t = useT();
  const options = (product.variants ?? []).filter((v) => v.isActive !== false);
  const hasOptions = options.length > 0;

  // With options the product's own price and stock are a summary of its
  // variants' — the sellable thing is the variant, so "from रु 180" is the
  // honest headline and a product is only sold out when every option is.
  const from = hasOptions ? Math.min(...options.map((v) => v.price)) : product.price;
  const soldOut = hasOptions
    ? options.every((v) => v.stock != null && v.stock <= 0)
    : product.trackStock === true && (product.stock ?? 0) <= 0;
  const saving =
    !hasOptions && product.mrp && product.mrp > product.price ? product.mrp - product.price : 0;

  return (
    <Card index={index} padded={false} style={{ opacity: soldOut ? 0.55 : 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: theme.spacing[4], gap: theme.spacing[4] }}>
        {/* Everything except the stepper opens the product, because a row this
            small cannot hold a description, the other photographs or the full
            list of sizes — and a seller who wrote those deserves them read. */}
        <Touchable
          haptic="light"
          onPress={onOpen}
          accessibilityLabel={`Open ${product.name}`}
          style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[4], flex: 1, minWidth: 0 }}
        >
        {/* A picture when the seller has uploaded one, a tinted tile when not.
            The tile is not a fallback for a broken image — most shelves will
            have no photographs for months, and a row of grey boxes with torn
            picture icons is what that looks like if nobody decides otherwise. */}
        <Thumb
          uri={product.imageUrl ?? product.images?.[0]}
          size={56}
          radius={theme.radii.md}
          fallback={<Ionicons name="cube-outline" size={22} color={theme.color.textFaint} />}
        />

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {product.name}
          </Text>
          {product.nameNp ? (
            <Text variant="footnote" color="textMuted" script="np" numberOfLines={1}>
              {product.nameNp}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", alignItems: "baseline", gap: theme.spacing[2], marginTop: theme.spacing[2] }}>
            {hasOptions && (
              <Text variant="caption" color="textMuted">
                {t("product.from")}
              </Text>
            )}
            <Price value={from} />
            {saving > 0 && (
              <Price
                value={product.mrp!}
                variant="caption"
                color="textFaint"
                style={{ textDecorationLine: "line-through" }}
              />
            )}
            {product.unit && !hasOptions ? (
              <Text variant="caption" color="textMuted">
                · {product.unit}
              </Text>
            ) : null}
          </View>

          {hasOptions && !soldOut ? (
            <Text variant="caption" color="textMuted" style={{ marginTop: theme.spacing[1] }}>
              {t("product.sizes", { count: options.length })}
            </Text>
          ) : soldOut ? (
            <Text variant="caption" color="danger" style={{ marginTop: theme.spacing[1] }}>
              {t("product.soldOut")}
            </Text>
          ) : saving > 0 ? (
            <Text variant="caption" color="success" style={{ marginTop: theme.spacing[1] }}>
              {t("product.save", { amount: saving.toLocaleString("en-IN") })}
            </Text>
          ) : null}
        </View>
        </Touchable>

        {hasOptions ? (
          // A ± stepper cannot work here: "one more" of a product sold in three
          // sizes is an unanswerable question. So the control opens the options
          // and the chosen sizes get their own steppers underneath.
          <Touchable
            haptic="medium"
            onPress={onAdd}
            disabled={soldOut}
            accessibilityLabel={`Choose a size of ${product.name}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              height: 36,
              paddingHorizontal: theme.spacing[4],
              borderRadius: theme.radii.full,
              backgroundColor: qty > 0 ? theme.color.brand : theme.color.brandSoft,
              borderWidth: 1,
              borderColor: qty > 0 ? theme.color.brand : theme.color.brandBorder,
            }}
          >
            {/* Not "2 ADD" — a number next to a verb reads as an instruction to
                add two. The sizes and their counts are listed underneath. */}
            <Text variant="caption" style={{ color: qty > 0 ? palette.white : theme.color.brand }}>
              {qty > 0 ? t("product.addMore") : t("product.choose")}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={13}
              color={qty > 0 ? palette.white : theme.color.brand}
            />
          </Touchable>
        ) : (
          <Stepper qty={qty} onAdd={onAdd} onRemove={onRemove} disabled={soldOut} />
        )}
      </View>

      {/* What is actually in the basket from this product, one line per size. */}
      {hasOptions && lines.length > 0 && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: theme.color.border,
            paddingHorizontal: theme.spacing[4],
            paddingVertical: theme.spacing[2],
            gap: theme.spacing[1],
          }}
        >
          {lines.map((line) => (
            <View
              key={line.id}
              style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}
            >
              <Ionicons name="checkmark-circle" size={14} color={theme.color.success} />
              <Text variant="caption" color="textSecondary" style={{ flex: 1 }} numberOfLines={1}>
                {line.variantName}
              </Text>
              <Touchable
                haptic="light"
                onPress={() => onLineQty(line, line.qty - 1)}
                accessibilityLabel={
                  line.qty === 1
                    ? `Remove ${line.variantName} from cart`
                    : `Fewer ${line.variantName}`
                }
                style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons
                  name={line.qty === 1 ? "trash-outline" : "remove"}
                  size={14}
                  color={theme.color.brand}
                />
              </Touchable>
              <Text variant="caption" style={{ minWidth: 14, textAlign: "center" }} tabular>
                {line.qty}
              </Text>
              <Touchable
                haptic="light"
                onPress={() => onLineQty(line, line.qty + 1)}
                accessibilityLabel={`More ${line.variantName}`}
                style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="add" size={14} color={theme.color.brand} />
              </Touchable>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function ProductSkeleton({ index }: { index: number }) {
  return (
    <Card padded={false}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: theme.spacing[4], gap: theme.spacing[4] }}>
        <View style={{ flex: 1, gap: theme.spacing[2] }}>
          <Skeleton width="70%" height={14} delay={index * 80} />
          <Skeleton width="35%" height={11} delay={index * 80 + 40} />
          <Skeleton width="48%" height={13} delay={index * 80 + 80} />
        </View>
        <Skeleton width={72} height={36} radius={theme.radii.full} delay={index * 80 + 120} />
      </View>
    </Card>
  );
}

export default function ShopScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const shopQuery = useShop(String(slug ?? ""));
  const productsQuery = useShopProducts(String(slug ?? ""));
  // Offers are per shop and most shops will have none — so this section simply
  // is not there when the list comes back empty, rather than being an empty box
  // with a heading over it.
  const offersQuery = useOffers(String(slug ?? ""));
  const { data: cart } = useCart();
  const { add, setQty } = useCartMutations();
  const { user } = useGopasal();

  /**
   * The cart lives on the customer's number, so adding needs one. Browsing does
   * not — the shelf is public — which means the sign-in prompt belongs on the
   * first tap that writes, not on the way into the shop. Returning a boolean
   * keeps every caller a one-liner.
   */
  const needsSignIn = () => {
    if (user) return false;
    router.push("/auth/phone");
    return true;
  };

  const shop = shopQuery.data;
  const products = productsQuery.data?.data ?? [];
  const offers = offersQuery.data ?? [];

  /**
   * Cart lines for this shop, indexed by product for an O(1) lookup per row.
   *
   * A product can hold several lines at once — 1 kg and 5 kg of the same rice
   * are two lines — so this is a list per product, not a single line, and the
   * row shows the total with each size underneath.
   */
  const lines = React.useMemo(() => {
    const map = new Map<string, VariantLine[]>();
    for (const line of cart?.items ?? []) {
      const list = map.get(line.productId) ?? [];
      list.push({
        id: line.id,
        variantId: line.variantId ?? "",
        variantName: line.variantName ?? line.name,
        qty: line.qty,
      });
      map.set(line.productId, list);
    }
    return map;
  }, [cart]);

  /** The product whose options are open, if any. */
  const [choosing, setChoosing] = React.useState<Product | null>(null);
  const chosenSoFar = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const line of lines.get(choosing?.id ?? "") ?? []) {
      if (line.variantId) counts[line.variantId] = line.qty;
    }
    return counts;
  }, [choosing, lines]);

  // Both figures come from the server, which has already done this arithmetic
  // and will do it again at checkout. Recomputing them here would be a second
  // implementation to keep in step with the first.
  const cartCount = cart?.itemCount ?? 0;
  const cartTotal = cart?.subtotal ?? 0;
  // The cart belongs to one shop at a time, which is the server's rule too —
  // so the bar only appears when the basket is this shop's.
  const showBar = cartCount > 0 && (!cart?.shop || cart.shop.id === shop?.id);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing[4],
          paddingTop: 0,
          paddingBottom: (showBar ? 108 : theme.spacing[8]) + insets.bottom,
          gap: theme.spacing[3],
        }}
        refreshControl={
          <RefreshControl
            refreshing={productsQuery.isFetching && !productsQuery.isLoading}
            onRefresh={productsQuery.refetch}
            tintColor={theme.color.brand}
            colors={[palette.crimson[500]]}
          />
        }
        ListHeaderComponent={
          <View style={{ marginBottom: theme.spacing[4] }}>
            {shop ? (
              <>
                <ShopHero shop={shop} />

                {offers.length > 0 && (
                  <View style={{ marginTop: theme.spacing[6], marginHorizontal: -theme.spacing[4] }}>
                    <Text variant="title3" style={{ paddingHorizontal: theme.spacing[4] }}>
                      {/* Not "this shop's offers": the list mixes the shop's own
                          coupons with platform-funded ones, and each ticket says
                          which it is. What they have in common is that they work
                          here, so that is what the heading claims. */}
                      Offers you can use here
                    </Text>
                    <View style={{ marginTop: theme.spacing[3] }}>
                      <OfferCarousel offers={offers} />
                    </View>
                  </View>
                )}

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "baseline",
                    gap: theme.spacing[2],
                    marginTop: theme.spacing[6],
                  }}
                >
                  <Text variant="title3">{t("shop.shelf")}</Text>
                  {products.length > 0 && (
                    <Text variant="caption" color="textFaint">
                      {products.length === 1 ? "1 item" : `${products.length} items`}
                    </Text>
                  )}
                </View>
              </>
            ) : (
              <View style={{ marginTop: insets.top + theme.spacing[4], gap: theme.spacing[3] }}>
                <Skeleton width="100%" height={150} radius={theme.radii.xl} />
                <Skeleton width="60%" height={22} />
                <Skeleton width="40%" height={12} />
              </View>
            )}
          </View>
        }
        renderItem={({ item, index }) => {
          const productLines = lines.get(item.id) ?? [];
          const first = productLines[0];
          const total = productLines.reduce((sum, line) => sum + line.qty, 0);
          const hasOptions = (item.variants ?? []).some((v) => v.isActive !== false);
          return (
            <ProductRow
              product={item}
              index={index}
              qty={total}
              lines={productLines}
              onAdd={() => {
                if (needsSignIn()) return;
                if (hasOptions) {
                  setChoosing(item);
                  return;
                }
                first
                  ? setQty.mutate({ itemId: first.id, qty: first.qty + 1, label: item.name })
                  : add.mutate({ productId: item.id, qty: 1, label: item.name });
              }}
              onRemove={() =>
                first && setQty.mutate({ itemId: first.id, qty: first.qty - 1, label: item.name })
              }
              onLineQty={(line, qty) =>
                setQty.mutate({ itemId: line.id, qty, label: `${item.name} ${line.variantName}` })
              }
              onOpen={() => router.push({ pathname: "/product/[id]", params: { id: item.id } })}
            />
          );
        }}
        ListEmptyComponent={
          productsQuery.isLoading ? (
            <View style={{ gap: theme.spacing[3] }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <ProductSkeleton key={i} index={i} />
              ))}
            </View>
          ) : (
            <View style={{ alignItems: "center", paddingTop: theme.spacing[10] }}>
              <Text variant="body" color="textMuted">
                {t("shop.empty")}
              </Text>
            </View>
          )
        }
      />

      {showBar && (
        <Animated.View
          entering={SlideInDown.duration(260)}
          style={{
            position: "absolute",
            left: theme.spacing[4],
            right: theme.spacing[4],
            bottom: insets.bottom + theme.spacing[4],
          }}
        >
          <Touchable
            haptic="medium"
            onPress={() => router.push("/(tabs)/cart")}
            accessibilityLabel={t("cart.a11y.view", { count: cartCount, total: cartTotal })}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              height: 56,
              paddingHorizontal: theme.spacing[5],
              borderRadius: theme.radii.lg,
              backgroundColor: theme.color.brand,
              ...theme.shadows.brand,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
              <View
                style={{
                  minWidth: 24,
                  height: 24,
                  paddingHorizontal: 6,
                  borderRadius: theme.radii.full,
                  backgroundColor: "rgba(255,255,255,0.22)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text variant="caption" style={{ color: palette.white }} tabular>
                  {cartCount}
                </Text>
              </View>
              <Text variant="bodyStrong" style={{ color: palette.white }}>
                {t("cart.view")}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
              <Price value={cartTotal} color="onBrand" />
              <Ionicons name="arrow-forward" size={17} color={palette.white} />
            </View>
          </Touchable>
        </Animated.View>
      )}

      <VariantSheet
        product={choosing}
        inCart={chosenSoFar}
        onClose={() => setChoosing(null)}
        onPick={(variant) => {
          if (needsSignIn()) {
            setChoosing(null);
            return;
          }
          const existing = (lines.get(choosing?.id ?? "") ?? []).find(
            (line) => line.variantId === variant.id,
          );
          const label = `${choosing?.name ?? "Item"} ${variant.name}`;
          if (existing) setQty.mutate({ itemId: existing.id, qty: existing.qty + 1, label });
          else add.mutate({ productId: choosing!.id, variantId: variant.id, qty: 1, label });
          // Left open on purpose: buying rice usually means one size, but the
          // sheet is also where you notice you wanted oil in 5 L as well, and
          // closing on the first tap makes that a second trip.
        }}
      />
    </View>
  );
}

function Meta({
  icon,
  label,
  tone = "textSecondary",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone?: "success" | "textMuted" | "textSecondary";
}) {
  const color = tone === "success" ? theme.color.success : theme.color[tone];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <Ionicons name={icon} size={13} color={color} />
      <Text variant="caption" style={{ color }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
