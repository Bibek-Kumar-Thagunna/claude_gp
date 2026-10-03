import * as React from "react";
import { FlatList, KeyboardAvoidingView, Platform, RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  useReplyToReview,
  useSelectedShop,
  useShopReviewPages,
  type ReviewQuery,
  type ShopReviewSummary,
} from "@gopasal/native-data/seller";
import {
  Button,
  ConnectionBanner,
  Skeleton,
  Sunken,
  Text,
  Touchable,
  theme,
  useT,
} from "@gopasal/native-ui";
import { ReviewCard } from "../components/ReviewCard";
import { ReviewStars } from "../components/ReviewStars";

/**
 * The shop's reviews.
 *
 * **It opens on the ones nobody has answered**, because that is the only part
 * of this screen that is work. Read chronologically, a review list is a
 * scoreboard — pleasant on a good week and useless on any week — and the
 * unanswered two-star from Tuesday is three screens down behind eleven fives
 * that need nothing.
 *
 * The filter is the server's (`?answered=false`) rather than a local partition
 * of the first page, so "not answered" means every unanswered review the shop
 * has and not merely the unanswered ones that happened to land on page one.
 *
 * The one piece of cleverness: if there is nothing waiting, the screen does not
 * open on an empty list. A shop that has answered everything gets its reviews,
 * newest first, because an empty screen is the right answer to "what needs me?"
 * and the wrong answer to "show me my reviews" — and it is the same tap.
 */

/**
 * One generous page, following the shelf.
 *
 * Paging a review list on a counter phone is scroll work in exchange for older
 * opinions, and the web console is where a shop reads its whole history. The
 * server caps `limit` at 100; fifty is more than a kirana accumulates between
 * one look and the next, and the footer says plainly when there are more.
 */
const PAGE_LIMIT = 50;

/** `lowRated` in the summary is rated 1 or 2 — the same two this chip asks for. */
const LOW_RATINGS = [1, 2];

type Filter = "unanswered" | "low" | "all";

export default function ReviewsScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { shopId, ready } = useSelectedShop();

  const [filter, setFilter] = React.useState<Filter>("unanswered");
  // Set the moment the shopkeeper touches a chip, after which the screen stops
  // having opinions about which one should be showing.
  const chosen = React.useRef(false);

  const query = React.useMemo<ReviewQuery>(() => {
    const base: ReviewQuery = { limit: PAGE_LIMIT, sort: "newest" };
    if (filter === "unanswered") base.answered = "false";
    if (filter === "low") base.rating = LOW_RATINGS;
    return base;
  }, [filter]);

  const paged = useShopReviewPages(shopId, query);
  const reviews = paged.first;
  const summary = reviews.data?.summary;
  const rows = paged.rows;

  // The summary counts every review the shop has, unaffected by this filter, so
  // it is the right thing to ask "is there any work?" — and it is what makes
  // the fall-back to the full list honest rather than a guess from an empty
  // page that might only be empty because it failed to load.
  React.useEffect(() => {
    if (chosen.current || !summary) return;
    if (summary.unanswered === 0 && summary.total > 0) setFilter("all");
  }, [summary]);

  const choose = (next: Filter) => {
    chosen.current = true;
    setFilter(next);
  };

  const reply = useReplyToReview(shopId);
  const [sendingId, setSendingId] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<{ id: string; message: string } | null>(null);

  const submit = (reviewId: string, text: string) => {
    setSendingId(reviewId);
    setFailure(null);
    reply.mutate(
      { reviewId, reply: text },
      {
        onError: () => setFailure({ id: reviewId, message: t("common.somethingWrong") }),
        onSettled: () => setSendingId(null),
      },
    );
  };

  const loading = reviews.isLoading || !ready;

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
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
          <Touchable
            haptic="light"
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            style={{
              width: 40,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: theme.radii.full,
              borderWidth: 1,
              borderColor: theme.color.border,
            }}
          >
            <Ionicons name="arrow-back" size={19} color={theme.color.text} />
          </Touchable>
          <Text variant="title2" style={{ flex: 1 }}>
            {t("reviews.title")}
          </Text>
        </View>

        {summary && summary.total > 0 ? <Summary summary={summary} /> : null}

        {summary && summary.total > 0 ? (
          <View style={{ flexDirection: "row", gap: theme.spacing[2] }}>
            <Chip
              label={t("reviews.unanswered")}
              count={summary.unanswered}
              selected={filter === "unanswered"}
              onPress={() => choose("unanswered")}
            />
            {summary.lowRated > 0 ? (
              <Chip
                label={t("reviews.lowRated")}
                count={summary.lowRated}
                selected={filter === "low"}
                onPress={() => choose("low")}
              />
            ) : null}
            <Chip
              label={t("reviews.all")}
              count={summary.total}
              selected={filter === "all"}
              onPress={() => choose("all")}
            />
          </View>
        ) : null}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <FlatList
          data={rows}
          keyExtractor={(review) => review.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: theme.spacing[4],
            paddingTop: theme.spacing[4],
            paddingBottom: theme.spacing[10] + insets.bottom,
            gap: theme.spacing[3],
          }}
          refreshControl={
            <RefreshControl
              refreshing={reviews.isFetching && !reviews.isLoading}
              onRefresh={() => void paged.refetch()}
              tintColor={theme.color.brand}
            />
          }
          renderItem={({ item, index }) => (
            <ReviewCard
              review={item}
              index={index}
              busy={sendingId === item.id}
              error={failure?.id === item.id ? failure.message : null}
              onSubmit={(text) => submit(item.id, text)}
              onOpenComposer={() => setFailure(null)}
            />
          )}
          ListEmptyComponent={
            loading ? (
              <View style={{ gap: theme.spacing[3] }}>
                {[0, 1, 2].map((i) => (
                  <Skeleton
                    key={i}
                    width="100%"
                    height={132}
                    radius={theme.radii.lg}
                    delay={i * 90}
                  />
                ))}
              </View>
            ) : !shopId ? (
              <Empty
                icon="storefront-outline"
                title={t("shop.choose.title")}
                detail={t("shop.choose.detail")}
              />
            ) : reviews.error ? (
              <Unreachable onRetry={() => void reviews.refetch()} />
            ) : filter === "unanswered" ? (
              <Empty
                icon="checkmark-done-outline"
                title={t("reviews.allAnswered.title")}
                detail={t("reviews.allAnswered.detail")}
              />
            ) : filter === "low" ? (
              <Empty
                icon="star-outline"
                title={t("reviews.noLowRated")}
                detail={t("reviews.empty.detail")}
              />
            ) : (
              <Empty
                icon="star-outline"
                title={t("reviews.empty.title")}
                detail={t("reviews.empty.detail")}
              />
            )
          }
          ListFooterComponent={
            paged.hasMore ? (
              <View style={{ paddingTop: theme.spacing[5] }}>
                <Button
                  label={t("list.showMore", { shown: rows.length, total: paged.total })}
                  variant="secondary"
                  loading={paged.loadingMore}
                  onPress={paged.loadMore}
                />
              </View>
            ) : null
          }
        />
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * The shop's standing, in one line.
 *
 * `averageRating` is null rather than zero when nobody has reviewed the shop —
 * a shop nobody has rated does not have a zero-star rating — so the figure is
 * simply absent in that case rather than drawn as a very bad score.
 */
function Summary({ summary }: { summary: ShopReviewSummary }) {
  const t = useT();
  const average = summary.averageRating;

  return (
    <Sunken>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
        {average != null ? (
          <>
            <Text variant="title2" tabular>
              {average.toFixed(1)}
            </Text>
            <ReviewStars rating={average} label={false} />
          </>
        ) : null}
        <View style={{ flex: 1 }} />
        <Text variant="caption" color="textMuted" tabular>
          {summary.total === 1
            ? t("reviews.countOne")
            : t("reviews.count", { count: summary.total })}
        </Text>
      </View>
    </Sunken>
  );
}

function Chip({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count: number;
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
      {count > 0 ? (
        <Text variant="caption" color={selected ? "onBrand" : "textFaint"} tabular>
          {count}
        </Text>
      ) : null}
    </Touchable>
  );
}

function Empty({
  icon,
  title,
  detail,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
}) {
  return (
    <View style={{ alignItems: "center", paddingTop: theme.spacing[10], gap: theme.spacing[2] }}>
      <Ionicons name={icon} size={30} color={theme.color.textFaint} />
      <Text variant="title3" align="center">
        {title}
      </Text>
      <Text variant="footnote" color="textMuted" align="center">
        {detail}
      </Text>
    </View>
  );
}

function Unreachable({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <View style={{ alignItems: "center", paddingTop: theme.spacing[10], gap: theme.spacing[4] }}>
      <Text variant="callout" color="textMuted" align="center">
        {t("common.somethingWrong")}
      </Text>
      <Button label={t("common.retry")} variant="secondary" full={false} onPress={onRetry} />
    </View>
  );
}
