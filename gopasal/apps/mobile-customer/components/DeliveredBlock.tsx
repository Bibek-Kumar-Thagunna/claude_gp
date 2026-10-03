import * as React from "react";
import { Image, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useGopasal, useReviewOrder, type Order } from "@gopasal/native-data";
import {
  Button,
  Card,
  Skeleton,
  Sunken,
  Text,
  Touchable,
  fontFamily,
  haptic,
  palette,
  theme,
  useT,
} from "@gopasal/native-ui";

/**
 * What a delivered order shows: the handover photo, and the chance to rate it.
 *
 * The proof photo is **private and authenticated** — it is a picture of
 * somebody's doorstep — so it cannot be dropped into an `<Image src>` the way a
 * product photo can. It is fetched with the session's bearer token and turned
 * into a data URI in memory, and it is only fetched when the customer asks to
 * see it. Loading every doorstep photo automatically on an order list would be
 * both wasteful and a little creepy.
 *
 * The review sits under it because that is the order the customer thinks in:
 * did it arrive, was it right, then how was it.
 */

function Stars({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  const t = useT();

  return (
    <View style={{ flexDirection: "row", gap: theme.spacing[2] }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Touchable
          key={n}
          haptic="light"
          onPress={() => onChange(n)}
          accessibilityLabel={t("delivered.review.star", { n })}
          style={{ padding: 4 }}
        >
          <Ionicons
            name={n <= value ? "star" : "star-outline"}
            size={30}
            color={n <= value ? palette.marigold[500] : theme.color.borderStrong}
          />
        </Touchable>
      ))}
    </View>
  );
}

function ProofPhoto({ orderId }: { orderId: string }) {
  const t = useT();
  const { http } = useGopasal();
  const [uri, setUri] = React.useState<string | null>(null);
  const [state, setState] = React.useState<"idle" | "loading" | "missing">("idle");

  const load = async () => {
    setState("loading");
    try {
      const dataUri = await http.requestDataUri(
        `/orders/${encodeURIComponent(orderId)}/delivery-proof`,
      );
      if (!dataUri) {
        setState("missing");
        return;
      }
      setUri(dataUri);
      setState("idle");
    } catch {
      setState("missing");
    }
  };

  if (uri) {
    return (
      <Animated.View entering={FadeIn.duration(260)}>
        <Image
          source={{ uri }}
          style={{
            width: "100%",
            height: 200,
            borderRadius: theme.radii.lg,
            backgroundColor: theme.color.surfaceSunken,
          }}
          resizeMode="cover"
          accessibilityLabel={t("delivered.photo.alt")}
        />
        <Text variant="caption" color="textFaint" style={{ marginTop: theme.spacing[2] }}>
          {t("delivered.photo.caption")}
        </Text>
      </Animated.View>
    );
  }

  if (state === "loading") return <Skeleton width="100%" height={200} radius={theme.radii.lg} />;

  if (state === "missing") {
    return (
      <Text variant="caption" color="textMuted">
        {t("delivered.photo.none")}
      </Text>
    );
  }

  return (
    <Touchable
      haptic="light"
      onPress={load}
      accessibilityLabel={t("delivered.photo.showA11y")}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[3],
        padding: theme.spacing[3],
        borderRadius: theme.radii.lg,
        borderWidth: 1,
        borderColor: theme.color.border,
        backgroundColor: theme.color.surfaceSunken,
      }}
    >
      <Ionicons name="camera-outline" size={18} color={theme.color.textSecondary} />
      <Text variant="callout" color="textSecondary" style={{ flex: 1 }}>
        {t("delivered.photo.show")}
      </Text>
      <Ionicons name="chevron-forward" size={15} color={theme.color.textFaint} />
    </Touchable>
  );
}

export function DeliveredBlock({ order }: { order: Order }) {
  const t = useT();
  const review = useReviewOrder(order.id);
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState("");
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    if (rating === 0) return setError(t("delivered.review.needRating"));
    setError(null);
    try {
      await review.mutateAsync({ rating, comment: comment.trim() || undefined });
      haptic("success");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("delivered.review.failed"));
    }
  };

  return (
    <>
      <Card>
        <Text variant="title3">{t("delivered.handover.title")}</Text>
        <View style={{ marginTop: theme.spacing[3] }}>
          <ProofPhoto orderId={order.id} />
        </View>
      </Card>

      <Card>
        {done ? (
          <Animated.View entering={FadeIn.duration(240)} style={{ alignItems: "center", paddingVertical: theme.spacing[3] }}>
            <Ionicons name="checkmark-circle" size={30} color={theme.color.success} />
            <Text variant="title3" style={{ marginTop: theme.spacing[3] }}>
              {t("delivered.thanks")}
            </Text>
            <Text variant="footnote" color="textMuted" align="center" style={{ marginTop: 4 }}>
              {t("delivered.thanks.detail", { shop: order.shop.name })}
            </Text>
          </Animated.View>
        ) : (
          <>
            <Text variant="title3">{t("delivered.review.title")}</Text>
            <Text variant="footnote" color="textMuted" style={{ marginTop: 2 }}>
              {t("delivered.review.detail")}
            </Text>

            <View style={{ alignItems: "center", marginTop: theme.spacing[4] }}>
              <Stars value={rating} onChange={setRating} />
            </View>

            <View
              style={{
                marginTop: theme.spacing[4],
                minHeight: 76,
                paddingHorizontal: theme.spacing[4],
                paddingVertical: theme.spacing[3],
                borderRadius: theme.radii.lg,
                borderWidth: 1,
                borderColor: theme.color.border,
                backgroundColor: theme.color.surfaceSunken,
              }}
            >
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder={t("delivered.review.placeholder")}
                placeholderTextColor={theme.color.textFaint}
                multiline
                maxLength={1000}
                accessibilityLabel={t("delivered.review.commentA11y")}
                style={{
                  fontFamily: fontFamily.body,
                  fontSize: 15,
                  lineHeight: 21,
                  color: theme.color.text,
                  textAlignVertical: "top",
                }}
              />
            </View>

            {error ? (
              <Sunken
                style={{
                  flexDirection: "row",
                  gap: theme.spacing[3],
                  marginTop: theme.spacing[3],
                  backgroundColor: theme.color.dangerSoft,
                }}
              >
                <Ionicons name="alert-circle" size={16} color={theme.color.danger} />
                <Text variant="caption" style={{ color: theme.color.danger, flex: 1 }}>
                  {error}
                </Text>
              </Sunken>
            ) : null}

            <Button
              label={t("delivered.review.send")}
              loading={review.isPending}
              disabled={rating === 0 || review.isPending}
              onPress={submit}
              style={{ marginTop: theme.spacing[4] }}
            />
          </>
        )}
      </Card>
    </>
  );
}
