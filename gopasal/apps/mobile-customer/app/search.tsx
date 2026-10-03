import * as React from "react";
import { FlatList, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  useCartMutations,
  useDeliveryPoint,
  useSearch,
  type SearchProduct,
  type Shop,
} from "@gopasal/native-data";
import {
  Card,
  CategoryArt,
  ConnectionBanner,
  Price,
  Skeleton,
  Text,
  Thumb,
  Touchable,
  categoryTint,
  fontFamily,
  theme,
  useT,
} from "@gopasal/native-ui";
import { ShopCard } from "../components/ShopCard";

/**
 * Search across shops and products near the delivery point.
 *
 * Debounced at 350 ms and gated at two characters — a one-letter query matches
 * most of a catalogue and costs a full-text scan to say so. The query is also
 * location-qualified, so a result is something that can actually be delivered
 * rather than a product in a shop four districts away.
 *
 * Products are listed before shops because "daal" is a thing you want, not a
 * place you want; someone searching a shop's name recognises it in the shops
 * section immediately below.
 */

function ProductRow({ product, index }: { product: SearchProduct; index: number }) {
  const t = useT();
  const router = useRouter();
  const { add } = useCartMutations();
  const tint = categoryTint(product.shop?.category?.hue);

  return (
    <Card
      index={index}
      padded={false}
      // The product, not its shop: tapping a search hit for "basmati" and
      // landing on a shelf of ninety other things is the wrong answer to the
      // question that was asked.
      onPress={() => router.push({ pathname: "/product/[id]", params: { id: product.id } })}
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
            {product.shop?.name}
            {product.unit ? ` · ${product.unit}` : ""}
          </Text>
          <Price value={product.price} variant="caption" style={{ marginTop: 2 }} />
        </View>
        <Touchable
          haptic="medium"
          onPress={() => add.mutate({ productId: product.id, qty: 1, label: product.name })}
          accessibilityLabel={t("search.addToCart", { name: product.name })}
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
      </View>
    </Card>
  );
}

export default function SearchScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { point } = useDeliveryPoint();

  const [text, setText] = React.useState("");
  const [query, setQuery] = React.useState("");

  // The debounce lives here rather than in the hook: it is a typing concern,
  // and a hook that debounced internally would make every other caller wait.
  React.useEffect(() => {
    const id = setTimeout(() => setQuery(text), 350);
    return () => clearTimeout(id);
  }, [text]);

  const search = useSearch(query, point);
  const products = search.data?.products ?? [];
  const shops = search.data?.shops ?? [];
  const asked = query.trim().length >= 2;
  const empty = asked && !search.isFetching && products.length === 0 && shops.length === 0;

  type Item =
    | { kind: "heading"; title: string }
    | { kind: "product"; product: SearchProduct }
    | { kind: "shop"; shop: Shop };

  const items: Item[] = [
    ...(products.length > 0 ? ([{ kind: "heading", title: t("search.items") }] as Item[]) : []),
    ...products.map((product): Item => ({ kind: "product", product })),
    ...(shops.length > 0 ? ([{ kind: "heading", title: t("search.shops") }] as Item[]) : []),
    ...shops.map((shop): Item => ({ kind: "shop", shop })),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
          paddingTop: insets.top + theme.spacing[2],
          paddingBottom: theme.spacing[3],
          paddingHorizontal: theme.spacing[4],
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

        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing[3],
            height: 46,
            paddingHorizontal: theme.spacing[4],
            borderRadius: theme.radii.lg,
            backgroundColor: theme.color.surface,
            borderWidth: 1,
            borderColor: theme.color.border,
          }}
        >
          <Ionicons name="search" size={17} color={theme.color.textMuted} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t("search.placeholder")}
            placeholderTextColor={theme.color.textFaint}
            autoFocus
            returnKeyType="search"
            accessibilityLabel={t("search.label")}
            style={{
              flex: 1,
              fontFamily: fontFamily.body,
              fontSize: 15,
              color: theme.color.text,
            }}
          />
          {text.length > 0 && (
            <Touchable
              haptic="light"
              onPress={() => setText("")}
              accessibilityLabel={t("search.clear")}
              style={{ padding: 4 }}
            >
              <Ionicons name="close-circle" size={17} color={theme.color.textFaint} />
            </Touchable>
          )}
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item, index) =>
          item.kind === "heading"
            ? `${item.title}-${index}`
            : item.kind === "product"
              ? item.product.id
              : item.shop.id
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: theme.spacing[4],
          paddingBottom: theme.spacing[10],
          gap: theme.spacing[3],
          flexGrow: 1,
        }}
        renderItem={({ item, index }) =>
          item.kind === "heading" ? (
            <Text variant="overline" color="textFaint" style={{ marginTop: index === 0 ? 0 : theme.spacing[4] }}>
              {item.title.toUpperCase()}
            </Text>
          ) : item.kind === "product" ? (
            <ProductRow product={item.product} index={index} />
          ) : (
            <ShopCard
              shop={item.shop}
              index={index}
              onPress={() => router.push({ pathname: "/shop/[slug]", params: { slug: item.shop.slug } })}
            />
          )
        }
        ListEmptyComponent={
          search.isFetching ? (
            <View style={{ gap: theme.spacing[3] }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} width="100%" height={72} radius={theme.radii.lg} delay={i * 80} />
              ))}
            </View>
          ) : empty ? (
            <Animated.View
              entering={FadeIn.duration(240)}
              style={{ alignItems: "center", paddingTop: theme.spacing[10] }}
            >
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: theme.radii["2xl"],
                  backgroundColor: theme.color.surfaceSunken,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <CategoryArt size={34} />
              </View>
              <Text variant="title3" align="center" style={{ marginTop: theme.spacing[4] }}>
                {t("search.empty.title", { query: query.trim() })}
              </Text>
              <Text
                variant="footnote"
                color="textMuted"
                align="center"
                style={{ marginTop: theme.spacing[2], maxWidth: 270 }}
              >
                {/* Honest about the reason: the search is location-qualified, so
                    "no results" usually means "not near you" rather than "we do
                    not sell it". */}
                {t("search.empty.detail", { area: point.label })}
              </Text>
            </Animated.View>
          ) : (
            <Animated.View
              entering={FadeIn.duration(240)}
              style={{ alignItems: "center", paddingTop: theme.spacing[10] }}
            >
              <Text variant="footnote" color="textFaint" align="center" style={{ maxWidth: 260 }}>
                {t("search.hint")}
              </Text>
            </Animated.View>
          )
        }
      />
    </View>
  );
}
