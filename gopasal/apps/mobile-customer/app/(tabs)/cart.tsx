import * as React from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  useCart,
  useCartMutations,
  useGopasal,
  useOutbox,
  type CartLine,
} from "@gopasal/native-data";
import {
  Button,
  Card,
  ConnectionBanner,
  Price,
  Skeleton,
  Sunken,
  Text,
  Touchable,
  palette,
  theme,
  useNetwork,
  useT,
} from "@gopasal/native-ui";

/**
 * The basket.
 *
 * Two things here are not decoration:
 *
 *  - **The totals shown are the app's own arithmetic, clearly labelled as an
 *    estimate.** The real total comes from the server at checkout, because it is
 *    the only party that may decide what someone pays. Showing a confident
 *    figure here and a different one on the next screen is how a customer stops
 *    trusting the app, so this screen says "estimated" and the checkout screen
 *    says "server-confirmed".
 *  - **Queued writes are visible.** If the connection dropped while quantities
 *    were being changed, the strip says how many changes are waiting rather than
 *    letting the customer wonder whether their taps registered.
 */

function Row({ line, onQty }: { line: CartLine; onQty: (qty: number) => void }) {
  const t = useT();
  return (
    <Animated.View layout={LinearTransition.duration(220)}>
      <Card padded={false}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: theme.spacing[4], gap: theme.spacing[3] }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong" numberOfLines={2}>
              {line.name}
            </Text>
            {/* "5 kg · रु 860 · 5 kg" — the option and the unit are very often
                the same words, because a 5 kg bag is sold by the 5 kg bag. Say
                it once. */}
            <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
              {line.variantName ? `${line.variantName} · ` : ""}
              रु {line.unitPrice}
              {line.unit && line.unit !== line.variantName ? ` · ${line.unit}` : ""}
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              height: 34,
              borderRadius: theme.radii.full,
              borderWidth: 1,
              borderColor: theme.color.border,
              backgroundColor: theme.color.surface,
            }}
          >
            <Touchable
              haptic="light"
              onPress={() => onQty(line.qty - 1)}
              accessibilityLabel={line.qty === 1 ? t("cart.a11y.removeItem") : t("cart.a11y.decrease")}
              style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons
                name={line.qty === 1 ? "trash-outline" : "remove"}
                size={15}
                color={line.qty === 1 ? theme.color.danger : theme.color.text}
              />
            </Touchable>
            <Text variant="caption" style={{ minWidth: 20, textAlign: "center" }} tabular>
              {line.qty}
            </Text>
            <Touchable
              haptic="light"
              onPress={() => onQty(line.qty + 1)}
              accessibilityLabel={t("cart.a11y.increase")}
              style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="add" size={15} color={theme.color.text} />
            </Touchable>
          </View>

          <Price value={line.lineTotal} style={{ minWidth: 68, textAlign: "right" }} />
        </View>
      </Card>
    </Animated.View>
  );
}

export default function CartScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const net = useNetwork();
  const { user } = useGopasal();
  const { data: cart, isLoading } = useCart();
  const { setQty, clear } = useCartMutations();
  const outbox = useOutbox();

  const items = cart?.items ?? [];
  // Server-computed, and optimistically kept in step by the cart mutations.
  const subtotal = cart?.subtotal ?? 0;
  const itemCount = cart?.itemCount ?? 0;
  const minOrder = cart?.minOrder ?? 0;
  const belowMin = items.length > 0 && cart?.meetsMinOrder === false;
  const pending = outbox.entries.filter((e) => !e.parked).length;
  const parked = outbox.entries.filter((e) => e.parked);

  if (!user) return <SignedOut onPress={() => router.push("/auth/phone")} />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing[4],
          paddingTop: insets.top + theme.spacing[3],
          paddingBottom: theme.spacing[10],
          gap: theme.spacing[3],
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text variant="title1">{t("cart.title")}</Text>
          {items.length > 0 && (
            <Touchable
              haptic="warning"
              onPress={() => clear.mutate()}
              accessibilityLabel={t("cart.a11y.empty")}
              style={{ padding: theme.spacing[2] }}
            >
              <Text variant="footnote" color="textMuted">
                {t("cart.clear")}
              </Text>
            </Touchable>
          )}
        </View>

        {cart?.shop ? (
          <Text variant="footnote" color="textMuted" style={{ marginTop: -theme.spacing[2] }}>
            {t("cart.from", { shop: cart.shop.name })}
          </Text>
        ) : null}

        {pending > 0 && (
          <Animated.View entering={FadeIn.duration(200)}>
            <Sunken style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
              <Ionicons name="cloud-upload-outline" size={16} color={theme.color.textMuted} />
              <Text variant="footnote" color="textSecondary" style={{ flex: 1 }}>
                {pending === 1 ? t("cart.pending.one") : t("cart.pending.many", { count: pending })}
                {net.isConnected ? t("cart.pending.sending") : t("cart.pending.offline")}
              </Text>
            </Sunken>
          </Animated.View>
        )}

        {parked.map((entry) => (
          <Card key={entry.id} style={{ borderColor: theme.color.dangerSoft, backgroundColor: theme.color.dangerSoft }}>
            <Text variant="footnote" style={{ fontWeight: "700", color: theme.color.danger }}>
              {t("cart.parked.failed", { label: entry.label })}
            </Text>
            <Text variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
              {entry.lastError}
            </Text>
          </Card>
        ))}

        {isLoading && items.length === 0 ? (
          <View style={{ gap: theme.spacing[3] }}>
            {[0, 1, 2].map((i) => (
              <Card key={i} padded={false}>
                <View style={{ flexDirection: "row", alignItems: "center", padding: theme.spacing[4], gap: theme.spacing[3] }}>
                  <View style={{ flex: 1, gap: theme.spacing[2] }}>
                    <Skeleton width="68%" height={14} delay={i * 80} />
                    <Skeleton width="42%" height={10} delay={i * 80 + 50} />
                  </View>
                  <Skeleton width={90} height={34} radius={theme.radii.full} delay={i * 80 + 90} />
                </View>
              </Card>
            ))}
          </View>
        ) : items.length === 0 ? (
          <Empty onPress={() => router.push("/(tabs)/home")} />
        ) : (
          <>
            {items.map((line) => (
              <Row
                key={line.id}
                line={line}
                onQty={(qty) => setQty.mutate({ itemId: line.id, qty, label: line.name })}
              />
            ))}

            <Card style={{ marginTop: theme.spacing[2] }}>
              <Line label={t("cart.items", { count: itemCount })} value={subtotal} />
              <View style={{ height: 1, backgroundColor: theme.color.border, marginVertical: theme.spacing[3] }} />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text variant="bodyStrong">{t("cart.estimated")}</Text>
                <Price value={subtotal} variant="title3" />
              </View>
              <Text variant="caption" color="textFaint" style={{ marginTop: theme.spacing[2] }}>
                {t("cart.deliveryNote")}
              </Text>
            </Card>

            {belowMin && (
              <Sunken style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
                <Ionicons name="information-circle-outline" size={17} color={theme.palette.marigold[600]} />
                <Text variant="footnote" color="textSecondary" style={{ flex: 1 }}>
                  {t("cart.belowMin", { amount: minOrder - subtotal, min: minOrder })}
                </Text>
              </Sunken>
            )}

            <Button
              label={belowMin ? t("cart.minButton", { amount: minOrder }) : t("cart.checkout")}
              size="lg"
              disabled={belowMin}
              onPress={() => router.push("/checkout")}
              style={{ marginTop: theme.spacing[2] }}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text variant="callout" color="textSecondary">
        {label}
      </Text>
      <Price value={value} variant="callout" />
    </View>
  );
}

function Empty({ onPress }: { onPress: () => void }) {
  const t = useT();
  return (
    <Animated.View entering={FadeIn.duration(280)} style={{ alignItems: "center", paddingTop: theme.spacing[12] }}>
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
        <Ionicons name="bag-outline" size={28} color={theme.color.textFaint} />
      </View>
      <Text variant="title3" style={{ marginTop: theme.spacing[4] }}>
        {t("cart.empty.title")}
      </Text>
      <Text variant="footnote" color="textMuted" align="center" style={{ marginTop: theme.spacing[2], maxWidth: 250 }}>
        {t("cart.empty.detail")}
      </Text>
      <Button
        label={t("home.browseShops")}
        variant="secondary"
        full={false}
        onPress={onPress}
        style={{ marginTop: theme.spacing[5] }}
      />
    </Animated.View>
  );
}

function SignedOut({ onPress }: { onPress: () => void }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.color.background,
        padding: theme.spacing[6],
        paddingTop: insets.top,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: theme.radii["2xl"],
          backgroundColor: theme.color.brandSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="bag-outline" size={28} color={palette.crimson[500]} />
      </View>
      <Text variant="title3" style={{ marginTop: theme.spacing[4] }}>
        {t("cart.signIn.title")}
      </Text>
      <Text variant="footnote" color="textMuted" align="center" style={{ marginTop: theme.spacing[2], maxWidth: 260 }}>
        {t("cart.signIn.detail")}
      </Text>
      <Button label={t("common.continue")} full={false} onPress={onPress} style={{ marginTop: theme.spacing[5] }} />
    </View>
  );
}
