import * as React from "react";
import { FlatList, RefreshControl, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  useProductActions,
  useSelectedShop,
  useShopProductPages,
  type ProductQuery,
  type ShopProduct,
} from "@gopasal/native-data/seller";
import { useShopPermissions } from "@gopasal/native-data/seller-team";
import {
  Button,
  ConnectionBanner,
  Text,
  Touchable,
  fontFamily,
  theme,
  useT,
} from "@gopasal/native-ui";
import { ShelfRow, ShelfRowSkeleton } from "../../components/ShelfRow";
import { StockSheet, type StockSubmission } from "../../components/StockSheet";

/**
 * The shelf.
 *
 * A kirana carries hundreds of lines and the shopkeeper is almost never
 * browsing them — they are looking for *one*, because a customer is standing at
 * the counter asking whether there is any. So the search field is pinned above
 * the list rather than riding on it: it is the primary interaction, and a field
 * that scrolls away is a field you have to scroll back to while somebody waits.
 *
 * Everything else on the screen is arranged around two facts a counter needs and
 * a catalogue browser does not:
 *
 *  - **Sold out and running low are different jobs.** One is answered now
 *    ("we're out, come back tomorrow"), the other on the next order to the
 *    wholesaler. They get different words, different ramps and their own chips.
 *  - **The attention cases must not be at the bottom.** The default sort is
 *    `stock_asc`, so the empty and the nearly-empty float to the top of every
 *    view, filtered or not. Sorting by name would be tidier and would bury
 *    exactly the rows the screen exists to surface.
 *
 * What this screen cannot do is stated on it rather than discovered: photographs,
 * new products and bulk edits are the console's, and the note at the foot of the
 * list says so once, quietly, instead of five disabled buttons saying it five
 * times.
 */

/**
 * At or below this many, a tracked product is drawn as running low.
 *
 * The shop does not set this and the API does not return it — `Product` carries
 * `stock` and `trackStock` and no threshold, which is why `ProductStockFilter`
 * has no `low` tier. Five is this app's own reading of "nearly out", matching
 * the customer app's shelf, and it is used only to *colour* a row and to narrow
 * one chip. Nothing is written with it and no count is attributed to the shop.
 */
const LOW_STOCK_AT = 5;

/**
 * A page, deliberately larger than the server's default.
 *
 * Search is still the fast way to an item while a customer waits, but the
 * list itself now reads to the end: scrolling past the last row fetches the
 * next page, so a shop with four hundred products can see every one of them.
 */
const PAGE_LIMIT = 60;

const FILTERS = ["all", "noneLeft", "low", "soldOut"] as const;
type Filter = (typeof FILTERS)[number];

function Chip({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  /** Omitted where the API does not count the thing — never guessed at. */
  count?: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Touchable
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        height: 34,
        paddingHorizontal: theme.spacing[3],
        borderRadius: theme.radii.full,
        borderWidth: 1,
        backgroundColor: selected ? theme.color.brand : theme.color.surface,
        borderColor: selected ? theme.color.brand : theme.color.border,
      }}
    >
      <Text variant="caption" color={selected ? "onBrand" : "textSecondary"}>
        {label}
      </Text>
      {count != null && count > 0 ? (
        <Text variant="caption" color={selected ? "onBrand" : "textFaint"} tabular>
          {count}
        </Text>
      ) : null}
    </Touchable>
  );
}

export default function ShelfScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { shopId, ready } = useSelectedShop();
  // Drawn only once `/auth/me` has answered and grants it: a button that is
  // answered 403 is worse than none, and so is one that flashes away.
  const perms = useShopPermissions(shopId);
  const canAdd = perms.ready && perms.has("catalog.create");

  const [text, setText] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");

  // Debounced, because every keystroke is a request over a counter's connection
  // and the name of the thing being looked for is usually four or five letters.
  // Short enough that the list feels answerable, long enough that "ch" and
  // "chi" and "chiura" are one query rather than three.
  React.useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === search) return;
    const timer = setTimeout(() => setSearch(trimmed), 280);
    return () => clearTimeout(timer);
  }, [text, search]);

  const query = React.useMemo<ProductQuery>(() => {
    const base: ProductQuery = { limit: PAGE_LIMIT, sort: "stock_asc" };
    if (search) base.q = search;
    // "Sold out" here is availability — the product taken off the storefront —
    // which is what the row's pill toggles. "None left" is the count reaching
    // zero. They are separate columns on the wire and separate words on screen.
    if (filter === "soldOut") base.status = "hidden";
    if (filter === "noneLeft") base.stock = "out";
    return base;
  }, [search, filter]);

  const paged = useShopProductPages(shopId, query);
  const products = paged.first;
  const { setAvailability, setStock } = useProductActions(shopId);

  const [counting, setCounting] = React.useState<ShopProduct | null>(null);
  const [countError, setCountError] = React.useState<string | null>(null);
  const [toggleError, setToggleError] = React.useState<string | null>(null);

  const page = products.data;
  const summary = page?.summary;

  const rows = React.useMemo(() => {
    const all = paged.rows;
    if (filter !== "low") return all;
    // Narrowed here rather than on the server because there is no `low` filter
    // to ask for. `stock_asc` means the lowest counts are at the front of this
    // page, so what is filtered out behind it is stock that is higher still —
    // never a low row hiding on page two.
    return all.filter((p) => p.trackStock && p.stock > 0 && p.stock <= LOW_STOCK_AT);
  }, [paged.rows, filter]);

  const toggle = (product: ShopProduct) => {
    setToggleError(null);
    // The hook is already optimistic and rolls back on failure. A second layer
    // of local state here would fight it, and the row would flicker between two
    // sources both claiming to know what the switch says.
    setAvailability.mutate(
      { productId: product.id, isActive: !product.isActive },
      { onError: () => setToggleError(t("common.somethingWrong")) },
    );
  };

  const submitCount = async ({ from, to }: StockSubmission) => {
    if (!counting) return;
    setCountError(null);
    try {
      // `from` is the sheet's snapshot, not this render's copy of the product:
      // the API takes a signed delta and the delta has to be measured from the
      // number the shopkeeper was looking at when they decided.
      await setStock.mutateAsync({ productId: counting.id, from, to });
      // Nothing is written into the row from here. The mutation invalidates the
      // shelf and the number that comes back from the server is the one this
      // screen shows — a count is a claim the server clamps.
      setCounting(null);
    } catch {
      setCountError(t("common.somethingWrong"));
    }
  };

  const searching = search.length > 0;
  const loading = products.isLoading;
  const hasMore = paged.hasMore;

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      <View
        style={{
          paddingTop: insets.top + theme.spacing[2],
          paddingHorizontal: theme.spacing[4],
          paddingBottom: theme.spacing[3],
          backgroundColor: theme.color.surface,
          borderBottomWidth: 1,
          borderBottomColor: theme.color.border,
          gap: theme.spacing[3],
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: theme.spacing[2] }}>
          <Text variant="title2">{t("shelf.title")}</Text>
          {summary ? (
            <Text variant="caption" color="textFaint" tabular>
              {t("shelf.count", { count: summary.total })}
            </Text>
          ) : null}
          {canAdd ? (
            <Touchable
              haptic="light"
              onPress={() => router.push("/product/new")}
              accessibilityRole="button"
              accessibilityLabel={t("shelf.addProduct")}
              style={{
                marginLeft: "auto",
                alignSelf: "center",
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                height: 34,
                paddingHorizontal: theme.spacing[3],
                borderRadius: theme.radii.full,
                backgroundColor: theme.color.brand,
              }}
            >
              <Ionicons name="add" size={17} color={theme.color.onBrand} />
              <Text variant="caption" color="onBrand">
                {t("shelf.addProduct")}
              </Text>
            </Touchable>
          ) : null}
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing[2],
            height: 44,
            paddingHorizontal: theme.spacing[3],
            borderRadius: theme.radii.lg,
            backgroundColor: theme.color.surfaceSunken,
          }}
        >
          <Ionicons name="search" size={17} color={theme.color.textMuted} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t("shelf.search")}
            placeholderTextColor={theme.color.textFaint}
            accessibilityLabel={t("shelf.search")}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            style={{
              flex: 1,
              minWidth: 0,
              paddingVertical: 0,
              color: theme.color.text,
              fontFamily: fontFamily.body,
              fontSize: 16,
            }}
          />
          {text.length > 0 ? (
            <Touchable
              haptic="light"
              onPress={() => setText("")}
              accessibilityRole="button"
              accessibilityLabel={t("shelf.clearSearch")}
              style={{ padding: 4 }}
            >
              <Ionicons name="close-circle" size={17} color={theme.color.textMuted} />
            </Touchable>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", gap: theme.spacing[2] }}>
          <Chip
            label={t("shelf.filter.all")}
            count={summary?.total}
            selected={filter === "all"}
            onPress={() => setFilter("all")}
          />
          <Chip
            label={t("shelf.filter.noneLeft")}
            count={summary?.outOfStock}
            selected={filter === "noneLeft"}
            onPress={() => setFilter("noneLeft")}
          />
          {/* No count: the API returns none for this tier and inventing one
              would be this app attributing a threshold to the shop. */}
          <Chip
            label={t("shelf.filter.low")}
            selected={filter === "low"}
            onPress={() => setFilter("low")}
          />
          <Chip
            label={t("shelf.outOfStock")}
            count={summary?.hidden}
            selected={filter === "soldOut"}
            onPress={() => setFilter("soldOut")}
          />
        </View>
      </View>

      {toggleError ? (
        <Animated.View
          entering={FadeIn.duration(140)}
          style={{
            marginHorizontal: theme.spacing[4],
            marginTop: theme.spacing[3],
            padding: theme.spacing[3],
            borderRadius: theme.radii.md,
            backgroundColor: theme.color.dangerSoft,
          }}
        >
          <Text variant="footnote" color="danger">
            {toggleError}
          </Text>
        </Animated.View>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(product) => product.id}
        onEndReached={paged.loadMore}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: theme.spacing[4],
          paddingTop: theme.spacing[3],
          paddingBottom: theme.spacing[10] + insets.bottom,
          gap: theme.spacing[3],
        }}
        refreshControl={
          <RefreshControl
            refreshing={products.isFetching && !products.isLoading}
            onRefresh={() => void paged.refetch()}
            tintColor={theme.color.brand}
          />
        }
        renderItem={({ item, index }) => (
          <ShelfRow
            product={item}
            index={index}
            lowAt={LOW_STOCK_AT}
            onOpen={() => router.push({ pathname: "/product/[id]", params: { id: item.id } })}
            onToggle={() => toggle(item)}
            onCount={() => {
              setCountError(null);
              setCounting(item);
            }}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: theme.spacing[3] }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <ShelfRowSkeleton key={i} index={i} />
              ))}
            </View>
          ) : (
            <Empty
              shopReady={ready && Boolean(shopId)}
              search={search}
              filter={filter}
              total={summary?.total ?? 0}
            />
          )
        }
        ListFooterComponent={
          rows.length > 0 ? (
            <View style={{ paddingTop: theme.spacing[5], gap: theme.spacing[2] }}>
              {hasMore ? (
                <Button
                  label={t("list.showMore", { shown: paged.rows.length, total: paged.total })}
                  variant="secondary"
                  loading={paged.loadingMore}
                  onPress={paged.loadMore}
                />
              ) : null}
              {/* Said once, at the foot of the list, where it is an answer to
                  "where is everything else?" rather than an apology at the top
                  of a screen that works. */}
              <Text variant="caption" color="textFaint" align="center">
                {t("shelf.onlyHere")}
              </Text>
            </View>
          ) : null
        }
      />

      <StockSheet
        product={counting}
        busy={setStock.isPending}
        error={countError}
        onSubmit={(submission) => void submitCount(submission)}
        onClose={() => {
          setCounting(null);
          setCountError(null);
        }}
      />
    </View>
  );
}

function Empty({
  shopReady,
  search,
  filter,
  total,
}: {
  shopReady: boolean;
  search: string;
  filter: Filter;
  total: number;
}) {
  const t = useT();

  const body = !shopReady
    ? { title: t("shop.choose.title"), detail: t("shop.choose.detail") }
    : search
      ? { title: t("shelf.noMatch", { query: search }), detail: t("shelf.noMatch.detail") }
      : // A shop with products but nothing under this chip is a shop with
        // nothing to attend to, which is good news and should not be dressed up
        // as the empty-catalogue screen.
        total > 0 && filter !== "all"
        ? {
            title: t("shelf.filter.none.title"),
            detail: t("shelf.filter.none.detail"),
          }
        : { title: t("shelf.empty.title"), detail: t("shelf.empty.detail") };

  return (
    <View style={{ alignItems: "center", paddingTop: theme.spacing[10], gap: theme.spacing[2] }}>
      <Ionicons name="cube-outline" size={30} color={theme.color.textFaint} />
      <Text variant="title3" align="center">
        {body.title}
      </Text>
      <Text variant="footnote" color="textMuted" align="center">
        {body.detail}
      </Text>
    </View>
  );
}
