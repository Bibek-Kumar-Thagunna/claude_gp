import * as React from "react";
import { TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { REPLY_MAX_LENGTH, type ShopReview } from "@gopasal/native-data/seller";
import { Button, Card, Sunken, Text, Touchable, fontFamily, theme, useT } from "@gopasal/native-ui";
import { ReviewStars } from "./ReviewStars";

/**
 * One review, and the shop's answer to it.
 *
 * ## The customer's words are never abbreviated
 *
 * No `numberOfLines`, no "read more". A review is short, it is the only thing
 * on this screen a shopkeeper has to actually read, and a three-line clamp on
 * the one sentence explaining why somebody gave two stars turns the screen into
 * a list of ratings — which is the number they could already see.
 *
 * ## Replying is a replace, and the screen says so
 *
 * `POST …/reply` writes `sellerReply` with a plain update: posting again
 * overwrites what was there, there is no history and no route removes a reply.
 * So the card offers *changing* an answer rather than a second one, warns that
 * the customer will see the new text in place of the old, and never offers a
 * delete it cannot honour. An empty reply is refused here rather than sent: the
 * DTO would accept `""` and store an empty string, which is a reply that exists
 * and says nothing.
 */

/**
 * How close to the cap the counter appears.
 *
 * A character count on an empty box is a form telling somebody off before they
 * have written anything. A thousand characters is far more than a shop reply
 * ever runs to, so the number only matters once it is nearly spent.
 */
const COUNTER_FROM = 120;

function reviewDate(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

export function ReviewCard({
  review,
  index,
  busy = false,
  error,
  onSubmit,
  onOpenComposer,
}: {
  review: ShopReview;
  index?: number;
  /** True while this review's reply is in flight. */
  busy?: boolean;
  /** Whatever went wrong the last time this card tried to send. */
  error?: string | null;
  onSubmit: (reply: string) => void;
  /** Lets the screen clear a stale failure before a second attempt. */
  onOpenComposer?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [refusal, setRefusal] = React.useState<string | null>(null);

  const replied = review.sellerReply;

  // The composer closes on the falling edge of this card's own send, and only
  // when nothing came back wrong. Closing on `review.sellerReply` changing
  // instead would look tidier and would shut the box — losing a half-typed
  // answer — the moment a colleague replied to the same review from the
  // console while this shopkeeper was still writing.
  const sending = React.useRef(false);
  React.useEffect(() => {
    if (sending.current && !busy && !error) {
      setOpen(false);
      setRefusal(null);
    }
    sending.current = busy;
  }, [busy, error]);

  const startReply = () => {
    setRefusal(null);
    setDraft(replied ?? "");
    setOpen(true);
    onOpenComposer?.();
  };

  const send = () => {
    const text = draft.trim();
    if (!text) {
      setRefusal(t("reviews.needWords"));
      return;
    }
    // The field is capped, so this is a guard rather than a gate — but a paste
    // is a way past a `maxLength` on some keyboards, and a 400 from the server
    // after typing is a worse way to find out.
    if (text.length > REPLY_MAX_LENGTH) {
      setRefusal(t("reviews.tooLong", { max: REPLY_MAX_LENGTH }));
      return;
    }
    setRefusal(null);
    onSubmit(text);
  };

  const remaining = REPLY_MAX_LENGTH - draft.length;
  const customer = review.customer?.name?.trim();

  return (
    <Card index={index}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
        <ReviewStars rating={review.rating} label={false} />
        <View style={{ flex: 1 }} />
        <Text variant="caption" color="textFaint">
          {reviewDate(review.createdAt)}
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          gap: theme.spacing[2],
          marginTop: theme.spacing[2],
        }}
      >
        <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
          {customer || t("reviews.anonymous")}
        </Text>
        {review.order ? (
          <Text variant="caption" color="textFaint" numberOfLines={1}>
            {t("order.title", { code: review.order.code })}
          </Text>
        ) : null}
      </View>

      {review.comment?.trim() ? (
        <Text variant="body" color="textSecondary" style={{ marginTop: theme.spacing[2] }}>
          {review.comment.trim()}
        </Text>
      ) : (
        <Text variant="footnote" color="textFaint" style={{ marginTop: theme.spacing[2] }}>
          {t("reviews.ratingOnly")}
        </Text>
      )}

      {replied && !open ? (
        <Sunken style={{ marginTop: theme.spacing[4] }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
            <Ionicons name="return-down-forward" size={14} color={theme.color.brand} />
            <Text variant="overline" color="brand" style={{ flex: 1, minWidth: 0 }}>
              {t("reviews.replied")}
            </Text>
            <Touchable
              haptic="light"
              onPress={startReply}
              accessibilityRole="button"
              accessibilityLabel={t("reviews.change")}
              style={{ paddingHorizontal: theme.spacing[2], paddingVertical: 2 }}
            >
              <Text variant="caption" color="textMuted">
                {t("reviews.change")}
              </Text>
            </Touchable>
          </View>
          <Text variant="callout" style={{ marginTop: theme.spacing[2] }}>
            {replied}
          </Text>
        </Sunken>
      ) : null}

      {!replied && !open ? (
        <View style={{ flexDirection: "row", marginTop: theme.spacing[4] }}>
          <Button
            label={t("reviews.reply")}
            variant="secondary"
            size="sm"
            full={false}
            onPress={startReply}
            leading={<Ionicons name="chatbubble-outline" size={14} color={theme.color.text} />}
          />
        </View>
      ) : null}

      {open ? (
        <View style={{ marginTop: theme.spacing[4], gap: theme.spacing[2] }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t("reviews.replyPlaceholder")}
            placeholderTextColor={theme.color.textFaint}
            accessibilityLabel={t("reviews.replyPlaceholder")}
            multiline
            autoFocus
            maxLength={REPLY_MAX_LENGTH}
            style={{
              minHeight: 88,
              padding: theme.spacing[3],
              borderRadius: theme.radii.md,
              borderWidth: 1,
              borderColor: theme.color.border,
              backgroundColor: theme.color.surfaceSunken,
              color: theme.color.text,
              fontFamily: fontFamily.body,
              fontSize: 15,
              lineHeight: 21,
              textAlignVertical: "top",
            }}
          />

          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              {refusal || error ? (
                <Text variant="caption" color="danger">
                  {refusal ?? error}
                </Text>
              ) : remaining <= COUNTER_FROM ? (
                <Text variant="caption" color={remaining <= 0 ? "danger" : "textMuted"} tabular>
                  {t("reviews.remaining", { count: remaining })}
                </Text>
              ) : replied ? (
                // Only said when there is something to replace. A shop writing
                // its first answer does not need warning about overwriting one.
                <Text variant="caption" color="textMuted">
                  {t("reviews.replaceNote")}
                </Text>
              ) : null}
            </View>

            <Button
              label={t("common.cancel")}
              variant="ghost"
              size="sm"
              full={false}
              disabled={busy}
              onPress={() => {
                setOpen(false);
                setRefusal(null);
              }}
            />
            <Button
              label={busy ? t("common.working") : t("reviews.post")}
              size="sm"
              full={false}
              loading={busy}
              disabled={busy || draft.trim().length === 0}
              onPress={send}
            />
          </View>
        </View>
      ) : null}

      {/* A failure that happened while the composer was shut still has to be
          visible, or a reply that never sent looks like one that did. */}
      {!open && error ? (
        <Text variant="caption" color="danger" style={{ marginTop: theme.spacing[2] }}>
          {error}
        </Text>
      ) : null}
    </Card>
  );
}
