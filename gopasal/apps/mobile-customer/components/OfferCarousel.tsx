import * as React from "react";
import {
  FlatList,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import type { Offer } from "@gopasal/native-data";
import {
  Skeleton,
  Text,
  Touchable,
  haptic,
  palette,
  theme,
  timings,
  useT,
} from "@gopasal/native-ui";

/**
 * The offers strip, drawn as a ticket.
 *
 * The first version of this was a coloured rectangle with the code in a dashed
 * box, and it read as a banner ad — the thing people have trained themselves to
 * scroll past. A ticket reads as something you were given: a torn stub, a
 * perforation, a code on the counterfoil. The shape is the whole point, so it
 * is built properly — two notches punched out of the card edges with circles in
 * the page colour, and a dashed perforation running between them.
 *
 * The rest is behaviour, not decoration:
 *
 *  - **Tapping copies the code**, because an offer is worthless until the code
 *    reaches the checkout field. The confirmation happens on the card itself;
 *    a toast at the other end of the screen moves the eye away from the thing
 *    just tapped.
 *  - **It advances itself** when there is more than one offer, and stops the
 *    moment a finger touches it — an auto-scroller that fights the user is
 *    worse than none.
 *  - **The dots track the scroll offset**, not a settled index, so they follow
 *    the finger rather than snapping after it lifts.
 */

const GAP = theme.spacing[3];
/** How much of the next ticket shows, which is what says "there are more". */
const PEEK = 26;
const HEIGHT = 124;
const STUB = 104;
/** Diameter of the punched notches sitting on the perforation. */
const NOTCH = 18;

function tint(scope: string): [string, string] {
  // Platform-funded offers wear the brand; a shop's own wears the marigold
  // accent, so who is paying is legible without a label saying so.
  return scope === "PLATFORM"
    ? [palette.crimson[500], palette.crimson[700]]
    : [palette.marigold[600], "#A85B00"];
}

function Ticket({ offer, width }: { offer: Offer; width: number }) {
  const t = useT();
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(offer.code);
    } catch {
      // Clipboard can be unavailable (web preview, restricted device). The code
      // is on screen either way, so this must not become an error.
    }
    haptic("success");
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  const [from, to] = tint(offer.scope);
  const notchColor = theme.color.background;

  return (
    <Touchable
      haptic="none"
      scaleTo={0.975}
      onPress={copy}
      accessibilityLabel={t("offer.a11y", {
        title: offerTitle(offer, t),
        detail: offerDetail(offer, t),
        code: offer.code,
      })}
      style={{ width, height: HEIGHT, borderRadius: theme.radii.lg, ...theme.shadows.sm }}
    >
      <View style={{ flex: 1, borderRadius: theme.radii.lg, overflow: "hidden" }}>
        <LinearGradient
          colors={[from, to]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, flexDirection: "row" }}
        >
          <View style={{ flex: 1, padding: theme.spacing[4], justifyContent: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
              <Ionicons name="pricetag" size={13} color="rgba(255,255,255,0.9)" />
              <Text variant="overline" style={{ color: "rgba(255,255,255,0.9)" }}>
                {offer.scope === "PLATFORM" ? t("offer.platform") : t("offer.shop")}
              </Text>
            </View>

            <Text
              variant="title2"
              style={{ color: palette.white, marginTop: theme.spacing[2] }}
              numberOfLines={1}
            >
              {offerTitle(offer, t)}
            </Text>
            <Text
              variant="footnote"
              style={{ color: "rgba(255,255,255,0.88)", marginTop: 1 }}
              numberOfLines={2}
            >
              {offerDetail(offer, t)}
            </Text>
          </View>

          {/* The counterfoil. */}
          <View
            style={{
              width: STUB,
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingHorizontal: theme.spacing[2],
              backgroundColor: "rgba(0,0,0,0.13)",
            }}
          >
            <Text
              variant="caption"
              align="center"
              style={{ color: palette.white, letterSpacing: 1.2, fontWeight: "700" }}
              numberOfLines={2}
            >
              {offer.code}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons
                name={copied ? "checkmark-circle" : "copy-outline"}
                size={12}
                color="rgba(255,255,255,0.92)"
              />
              <Text variant="overline" style={{ color: "rgba(255,255,255,0.92)" }}>
                {copied ? t("offer.copied") : t("offer.copy")}
              </Text>
            </View>
          </View>

          {/* The perforation, drawn as a dashed hairline between the notches. */}
          <View
            style={{
              position: "absolute",
              right: STUB,
              top: NOTCH / 2,
              bottom: NOTCH / 2,
              width: 1,
              borderRightWidth: 1,
              borderStyle: "dashed",
              borderColor: "rgba(255,255,255,0.55)",
            }}
          />
        </LinearGradient>
      </View>

      {/* Punched notches. Drawn outside the clipped surface, in the page colour,
          so the card edge genuinely looks torn rather than printed. */}
      <View
        style={{
          position: "absolute",
          right: STUB - NOTCH / 2,
          top: -NOTCH / 2,
          width: NOTCH,
          height: NOTCH,
          borderRadius: NOTCH / 2,
          backgroundColor: notchColor,
        }}
      />
      <View
        style={{
          position: "absolute",
          right: STUB - NOTCH / 2,
          bottom: -NOTCH / 2,
          width: NOTCH,
          height: NOTCH,
          borderRadius: NOTCH / 2,
          backgroundColor: notchColor,
        }}
      />
    </Touchable>
  );
}

function Dot({ index, progress }: { index: number; progress: { value: number } }) {
  const style = useAnimatedStyle(() => {
    // Distance from this dot, clamped — so the active one widens smoothly as the
    // finger drags rather than switching at a threshold.
    const d = Math.min(Math.abs(progress.value - index), 1);
    return {
      width: withTiming(6 + (1 - d) * 12, timings.fast),
      opacity: withTiming(0.28 + (1 - d) * 0.72, timings.fast),
    };
  });
  return <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: theme.color.brand }, style]} />;
}

export function OfferCarousel({ offers, loading }: { offers: Offer[]; loading?: boolean }) {
  const { width: screen } = useWindowDimensions();
  const cardW = screen - theme.spacing[4] * 2 - PEEK;
  const pitch = cardW + GAP;

  const progress = useSharedValue(0);
  const listRef = React.useRef<FlatList<Offer>>(null);
  const index = React.useRef(0);
  const [paused, setPaused] = React.useState(false);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x / pitch;
    progress.value = x;
    index.current = Math.round(x);
  };

  // Self-advancing, and only while nobody is touching it.
  React.useEffect(() => {
    if (paused || offers.length < 2) return;
    const id = setInterval(() => {
      const next = (index.current + 1) % offers.length;
      listRef.current?.scrollToOffset({ offset: next * pitch, animated: true });
      index.current = next;
    }, 5000);
    return () => clearInterval(id);
  }, [paused, offers.length, pitch]);

  if (loading && offers.length === 0) {
    return (
      <View style={{ paddingHorizontal: theme.spacing[4] }}>
        <Skeleton width={cardW} height={HEIGHT} radius={theme.radii.lg} />
      </View>
    );
  }
  if (offers.length === 0) return null;

  return (
    <View>
      <FlatList
        ref={listRef}
        data={offers}
        keyExtractor={(o) => o.code}
        horizontal
        showsHorizontalScrollIndicator={false}
        // Snapping to the ticket's own pitch is what makes this feel like a
        // carousel; paging by screen width would leave cards half cut.
        snapToInterval={pitch}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => setPaused(true)}
        // A short grace period, so the strip does not lurch away the instant a
        // finger lifts off it.
        onScrollEndDrag={() => setTimeout(() => setPaused(false), 6000)}
        contentContainerStyle={{ paddingHorizontal: theme.spacing[4], gap: GAP }}
        renderItem={({ item }) => <Ticket offer={item} width={cardW} />}
      />
      {offers.length > 1 && (
        <View
          style={{
            flexDirection: "row",
            gap: 5,
            justifyContent: "center",
            marginTop: theme.spacing[3],
          }}
        >
          {offers.map((o, i) => (
            <Dot key={o.code} index={i} progress={progress} />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * The offer's words, written here from its numbers.
 *
 * The API sends a `title`/`detail` pair, but in English and with "Rs" — beside
 * prices everywhere else in the app written "रु". The numbers are on the offer,
 * so the sentence is built from them in the reader's language; the server's
 * words stay as the fallback for a kind of offer the app does not know.
 */
function money(n: number): string {
  return `रु ${Math.round(n).toLocaleString("en-IN")}`;
}

export function offerTitle(offer: Offer, t: ReturnType<typeof useT>): string {
  if (offer.type === "FLAT") return t("offer.flat", { amount: money(offer.value) });
  if (offer.type === "PERCENT") return t("offer.percent", { value: offer.value });
  return offer.title;
}

export function offerDetail(offer: Offer, t: ReturnType<typeof useT>): string {
  if (offer.type !== "FLAT" && offer.type !== "PERCENT") return offer.detail;
  const parts: string[] = [];
  if (offer.minOrder > 0) parts.push(t("offer.minOrder", { amount: money(offer.minOrder) }));
  else parts.push(t("offer.anyOrder"));
  if (offer.type === "PERCENT" && offer.maxDiscount)
    parts.push(t("offer.upTo", { amount: money(offer.maxDiscount) }));
  return parts.join(" · ");
}
