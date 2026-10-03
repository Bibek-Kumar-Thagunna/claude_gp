import * as React from "react";
import { FlatList, RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  useCartMutations,
  useCategories,
  useDeliveryPoint,
  useGopasal,
  useHome,
  useLoyalty,
  useOffers,
  type HomeShelf,
  type Product,
  type Shop,
} from "@gopasal/native-data";
import {
  Card,
  CoinIcon,
  ConnectionBanner,
  Logo,
  Price,
  Skeleton,
  Text,
  Thumb,
  Touchable,
  categoryTint,
  palette,
  stagger,
  theme,
  useNetwork,
  useI18n,
  useT,
} from "@gopasal/native-ui";
import { useCategoryName } from "../../lib/category";
import { CategoryGrid } from "../../components/CategoryGrid";
import { OfferCarousel } from "../../components/OfferCarousel";
import { ShopCard } from "../../components/ShopCard";

/**
 * Home.
 *
 * The page is built as a coloured header with a sheet of content riding over it,
 * rather than as cards floating on a flat ground. That is not styling for its
 * own sake: the band gives the location picker and the search field somewhere to
 * live that is obviously "the app", and the sheet's top edge is what tells you
 * the content below scrolls independently of it.
 *
 * Order is deliberate, most-decisive first:
 *
 *  1. **Where am I ordering to** — everything below is only true for a place.
 *  2. **Search** — the fastest path for anyone who knows what they came for.
 *  3. **Categories** — the whole taxonomy, so the app says what it is for in one
 *     glance. Not just the categories with a shop open nearby, which in a quiet
 *     neighbourhood is two tiles and reads as "this app sells two things".
 *  4. **Offers** — worth showing early, but under the things people came to do.
 *  5. **Shops**, then **shelves** by category.
 *
 * `GET /discovery/home` returns shops *and* shelves in a single request, and the
 * category list is cached for a day. On a 3G link the cost of a screen is
 * dominated by how many times it talks to the server, not by how much it moves.
 *
 * Still no map, deliberately — a map here would cost tile loads on the
 * most-visited screen in the app to answer a question a distance already answers
 * for nothing. See `docs/maps-cost-policy.md`.
 */

/* ── shelves ──────────────────────────────────────────────────────────────── */

function ShelfProduct({
  product,
  shopSlug,
  index,
  onAdd,
}: {
  product: Product;
  shopSlug?: string;
  index: number;
  onAdd: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const saving = product.mrp && product.mrp > product.price ? product.mrp - product.price : 0;

  return (
    <Animated.View entering={FadeInDown.delay(stagger(index)).duration(300)}>
      <Touchable
        haptic="selection"
        scaleTo={0.98}
        onPress={() =>
          shopSlug && router.push({ pathname: "/shop/[slug]", params: { slug: shopSlug } })
        }
        style={{
          width: 152,
          borderRadius: theme.radii.lg,
          backgroundColor: theme.color.surface,
          borderWidth: 1,
          borderColor: theme.color.border,
          padding: theme.spacing[3],
          ...theme.shadows.xs,
        }}
      >
        <View style={{ height: 78, marginBottom: theme.spacing[3] }}>
          <Thumb
            uri={product.imageUrl ?? product.images?.[0]}
            size="fill"
            radius={theme.radii.md}
            fallback={<Ionicons name="cube-outline" size={26} color={theme.color.textFaint} />}
          />
          {saving > 0 && (
            <View
              style={{
                position: "absolute",
                top: 6,
                left: 6,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: theme.radii.sm,
                backgroundColor: theme.color.success,
              }}
            >
              <Text variant="overline" style={{ color: palette.white }}>
                {t("home.saveBadge", { amount: saving }).toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        <Text variant="callout" numberOfLines={2} style={{ minHeight: 42 }}>
          {product.name}
        </Text>
        {product.unit ? (
          <Text variant="caption" color="textFaint" numberOfLines={1}>
            {product.unit}
          </Text>
        ) : null}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: theme.spacing[2],
          }}
        >
          <Price value={product.price} variant="callout" />
          <Touchable
            haptic="medium"
            onPress={onAdd}
            accessibilityLabel={`Add ${product.name} to cart`}
            style={{
              width: 30,
              height: 30,
              borderRadius: theme.radii.full,
              backgroundColor: theme.color.brandSoft,
              borderWidth: 1,
              borderColor: theme.color.brandBorder,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="add" size={17} color={theme.color.brand} />
          </Touchable>
        </View>
      </Touchable>
    </Animated.View>
  );
}

function Shelf({ shelf, shops }: { shelf: HomeShelf; shops: Shop[] }) {
  const t = useT();
  const { language } = useI18n();
  const nameOf = useCategoryName();
  const router = useRouter();
  const { add } = useCartMutations();
  // Shelf products carry no shop of their own, so they are attributed to the
  // nearest shop in that category — which is the one the customer would have
  // reached anyway.
  const shop = shops.find((s) => s.category?.id === shelf.category.id) ?? shops[0];
  const tint = categoryTint(shelf.category.hue);

  if (shelf.products.length === 0) return null;

  return (
    <View style={{ marginTop: theme.spacing[8] }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
          paddingHorizontal: theme.spacing[4],
          marginBottom: theme.spacing[3],
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* The reader's language leads; the other name stays underneath,
              because a shelf heading is also how somebody learns the word. */}
          <Text variant="title3" numberOfLines={1} script={language === "np" ? "np" : undefined}>
            {nameOf(shelf.category)}
          </Text>
          <Text
            variant="caption"
            color="textMuted"
            script={language === "np" ? undefined : "np"}
            numberOfLines={1}
          >
            {language === "np" ? shelf.category.en : shelf.category.np}
          </Text>
        </View>
        <Touchable
          haptic="selection"
          onPress={() =>
            router.push({ pathname: "/category/[slug]", params: { slug: shelf.category.slug } })
          }
          accessibilityLabel={t("home.a11y.seeAllCategory", { category: nameOf(shelf.category) })}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
            paddingVertical: 4,
            paddingHorizontal: theme.spacing[3],
            borderRadius: theme.radii.full,
            backgroundColor: tint.bg,
          }}
        >
          <Text variant="overline" style={{ color: tint.fg }}>
            {t("home.seeAll").toUpperCase()}
          </Text>
          <Ionicons name="chevron-forward" size={12} color={tint.fg} />
        </Touchable>
      </View>

      <FlatList
        data={shelf.products.slice(0, 10)}
        keyExtractor={(p) => p.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: theme.spacing[4], gap: theme.spacing[3] }}
        renderItem={({ item, index }) => (
          <ShelfProduct
            product={item}
            shopSlug={item.shopSlug ?? shop?.slug}
            index={index}
            onAdd={() => add.mutate({ productId: item.id, qty: 1, label: item.name })}
          />
        )}
      />
    </View>
  );
}

/* ── section heading ──────────────────────────────────────────────────────── */

function SectionHeading({ title, sub }: { title: string; sub?: string | null }) {
  return (
    <View
      style={{
        paddingHorizontal: theme.spacing[4],
        flexDirection: "row",
        alignItems: "baseline",
        gap: theme.spacing[2],
      }}
    >
      <Text variant="title3">{title}</Text>
      {sub ? (
        <Text variant="caption" color="textFaint">
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

/* ── screen ───────────────────────────────────────────────────────────────── */

export default function HomeScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const net = useNetwork();
  const { user } = useGopasal();

  // There is always a point to query with: a saved address if there is one,
  // otherwise Kathmandu as an admitted guess. The feed is never blocked behind a
  // location permission prompt on first launch — that is the fastest way to lose
  // a new user — and the header says plainly which of the two it is.
  const { point, isDefault } = useDeliveryPoint();
  const home = useHome(point);
  const categories = useCategories();
  const shops = home.data?.shops ?? [];
  const shelves = home.data?.shelves ?? [];
  // Offers are fetched against the nearest shop, which returns that shop's own
  // coupons *and* the platform-funded ones. One request, both kinds.
  const offers = useOffers(shops[0]?.slug);
  const loyalty = useLoyalty();
  const coins = loyalty.data?.points ?? 0;

  // Recomputed when the language changes as well as on mount: the same hour
  // has to be able to say शुभ प्रभात once the customer switches.
  const greeting = React.useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return t("home.greeting.morning");
    if (h < 17) return t("home.greeting.afternoon");
    return t("home.greeting.evening");
  }, [t]);

  const firstName = user?.name?.split(" ")[0];

  return (
    <View style={{ flex: 1, backgroundColor: palette.crimson[600] }}>
      <ConnectionBanner />

      <ScrollView
        style={{ backgroundColor: theme.color.background }}
        contentContainerStyle={{ paddingBottom: theme.spacing[10] }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={home.isFetching && !home.isLoading}
            onRefresh={home.refetch}
            tintColor={theme.color.brand}
            colors={[palette.crimson[500]]}
          />
        }
      >
        {/* The brand band. Deep enough that white type sits on it comfortably,
            and tall enough to hold the two controls that decide everything
            below: where this is going, and what you are looking for. */}
        <LinearGradient
          colors={[palette.crimson[600], palette.crimson[500]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingTop: insets.top + theme.spacing[3],
            paddingBottom: theme.spacing[8],
            paddingHorizontal: theme.spacing[4],
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
            <Touchable
              haptic="selection"
              onPress={() => router.push("/address")}
              accessibilityLabel={t("home.a11y.changeAddress")}
              style={{ flex: 1, minWidth: 0 }}
            >
              <Text variant="overline" style={{ color: "rgba(255,255,255,0.75)" }}>
                {(isDefault ? t("home.showingNear") : t("home.deliverTo")).toUpperCase()}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: theme.spacing[2],
                  marginTop: 2,
                }}
              >
                <Ionicons
                  name={isDefault ? "location-outline" : "location"}
                  size={16}
                  color={palette.white}
                />
                <Text
                  variant="title3"
                  style={{ color: palette.white, flexShrink: 1 }}
                  numberOfLines={1}
                >
                  {point.label}
                </Text>
                <Ionicons name="chevron-down" size={15} color="rgba(255,255,255,0.85)" />
              </View>
            </Touchable>

            {/* GoCoins, not the logo.
                The mark here was decoration — the customer knows which app they
                opened. A balance they can spend at checkout is worth the corner,
                and it only earns the space once they are signed in and it is a
                real number rather than a dash. */}
            {user ? (
              <Touchable
                haptic="selection"
                onPress={() => router.push("/rewards")}
                accessibilityLabel={`${coins} GoCoins. Open rewards`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  height: 36,
                  paddingHorizontal: theme.spacing[3],
                  borderRadius: theme.radii.full,
                  backgroundColor: "rgba(255,255,255,0.18)",
                }}
              >
                <CoinIcon size={16} />
                <Text variant="caption" style={{ color: palette.white }} tabular>
                  {loyalty.isLoading ? "—" : coins}
                </Text>
              </Touchable>
            ) : (
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: theme.radii.full,
                  backgroundColor: "rgba(255,255,255,0.16)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Logo size={24} tone="onDark" />
              </View>
            )}
          </View>

          {/* A line of warmth, and the one place the customer's name belongs —
              under the address, where it reads as "yours" rather than as a
              headline competing with it. */}
          <Text
            variant="footnote"
            style={{ color: "rgba(255,255,255,0.8)", marginTop: theme.spacing[3] }}
            numberOfLines={1}
          >
            {firstName
              ? t("home.greeting.named", { greeting, name: firstName })
              : t("home.greeting.line", { greeting })}
          </Text>

          <Touchable
            haptic="selection"
            onPress={() => router.push("/search")}
            accessibilityLabel={t("home.a11y.search")}
            style={{
              marginTop: theme.spacing[3],
              flexDirection: "row",
              alignItems: "center",
              gap: theme.spacing[3],
              height: 48,
              paddingHorizontal: theme.spacing[4],
              borderRadius: theme.radii.lg,
              backgroundColor: theme.color.surface,
              ...theme.shadows.sm,
            }}
          >
            <Ionicons name="search" size={18} color={theme.color.brand} />
            <Text variant="callout" color="textMuted" style={{ flex: 1 }} numberOfLines={1}>
              {t("home.search")}
            </Text>
          </Touchable>
        </LinearGradient>

        {/* The sheet. Its rounded top edge riding over the band is what makes
            the page read as one object with a header, rather than as a stack of
            unrelated strips. */}
        <View
          style={{
            backgroundColor: theme.color.background,
            borderTopLeftRadius: theme.radii["2xl"],
            borderTopRightRadius: theme.radii["2xl"],
            marginTop: -theme.spacing[5],
            paddingTop: theme.spacing[6],
          }}
        >
          <SectionHeading title={t("home.categories")} />
          <View style={{ marginTop: theme.spacing[4] }}>
            <CategoryGrid
              categories={categories.data ?? []}
              loading={categories.isLoading}
              onPick={(category) =>
                router.push({ pathname: "/category/[slug]", params: { slug: category.slug } })
              }
            />
          </View>

          {(offers.isLoading || (offers.data?.length ?? 0) > 0) && (
            <View style={{ marginTop: theme.spacing[8] }}>
              <SectionHeading title={t("home.offers")} />
              <View style={{ marginTop: theme.spacing[3] }}>
                <OfferCarousel offers={offers.data ?? []} loading={offers.isLoading} />
              </View>
            </View>
          )}

          <View style={{ marginTop: theme.spacing[8] }}>
            <SectionHeading
              title={t("home.nearby")}
              sub={
                shops.length === 0
                  ? null
                  : shops.length === 1
                    ? t("home.nearby.one")
                    : t("home.nearby.many", { count: shops.length })
              }
            />

            <View
              style={{
                paddingHorizontal: theme.spacing[4],
                marginTop: theme.spacing[3],
                gap: theme.spacing[3],
              }}
            >
              {home.isLoading && shops.length === 0
                ? [0, 1, 2].map((i) => <ShopSkeleton key={i} index={i} />)
                : shops.map((shop, index) => (
                    <ShopCard
                      key={shop.id}
                      shop={shop}
                      index={index}
                      onPress={() =>
                        router.push({ pathname: "/shop/[slug]", params: { slug: shop.slug } })
                      }
                    />
                  ))}

              {!home.isLoading && shops.length === 0 && (
                <Animated.View
                  entering={FadeIn.duration(280)}
                  style={{ alignItems: "center", paddingTop: theme.spacing[8] }}
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
                    <Ionicons
                      name={home.error ? "cloud-offline-outline" : "storefront-outline"}
                      size={28}
                      color={theme.color.textFaint}
                    />
                  </View>
                  <Text variant="title3" style={{ marginTop: theme.spacing[4] }}>
                    {home.error ? "Can't load shops" : "No shops yet"}
                  </Text>
                  <Text
                    variant="footnote"
                    color="textMuted"
                    align="center"
                    style={{ marginTop: theme.spacing[2], maxWidth: 260 }}
                  >
                    {home.error
                      ? net.isConnected
                        ? "Something went wrong at our end. Pull down to try again."
                        : "You're offline. We'll load these as soon as you're back."
                      : "There are no shops delivering to this area yet."}
                  </Text>
                </Animated.View>
              )}
            </View>
          </View>

          {shelves.map((shelf) => (
            <Shelf key={shelf.category.id} shelf={shelf} shops={shops} />
          ))}

          {/* A deliberate end to the page. Without it the last shelf simply
              stops, which reads as content failing to load. */}
          {!home.isLoading && shops.length > 0 && (
            <View style={{ alignItems: "center", marginTop: theme.spacing[10], paddingHorizontal: theme.spacing[6] }}>
              <Logo size={26} tone="mono" color={theme.color.textFaint} />
              <Text variant="caption" color="textFaint" align="center" style={{ marginTop: theme.spacing[3] }}>
                {t("home.tagline")}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function ShopSkeleton({ index }: { index: number }) {
  return (
    <Card padded={false}>
      <View style={{ flexDirection: "row", padding: theme.spacing[4], gap: theme.spacing[4] }}>
        <Skeleton width={64} height={64} radius={theme.radii.lg} delay={index * 90} />
        <View style={{ flex: 1, gap: theme.spacing[2], justifyContent: "center" }}>
          <Skeleton width="62%" height={15} delay={index * 90 + 40} />
          <Skeleton width="40%" height={11} delay={index * 90 + 80} />
          <Skeleton width="78%" height={10} delay={index * 90 + 120} />
        </View>
      </View>
    </Card>
  );
}
