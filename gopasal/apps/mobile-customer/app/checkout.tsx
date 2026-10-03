import * as React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  useAddresses,
  useCart,
  useGopasal,
  useMyOffers,
  usePaymentMethods,
  usePlaceOrder,
  useQuote,
  type Address,
  type Offer,
  type PaymentMethod,
} from "@gopasal/native-data";
import {
  Button,
  Card,
  CoinIcon,
  ConnectionBanner,
  Price,
  Skeleton,
  Sunken,
  Text,
  Touchable,
  fontFamily,
  haptic,
  palette,
  theme,
  useNetwork,
  useT,
} from "@gopasal/native-ui";
import { payAtGateway } from "../lib/gateway";
import { offerDetail, offerTitle } from "../components/OfferCarousel";

/**
 * Checkout.
 *
 * Every number on this screen comes from `POST /orders/checkout/quote`. The app
 * does no arithmetic of its own here — not the delivery fee, not the discount,
 * not the total. That is not laziness: the server re-prices the cart at
 * placement anyway, so a figure computed locally is a second implementation
 * whose only possible contribution is to disagree with the first. A customer
 * who sees one total on this screen and is charged another stops trusting the
 * app, and they are right to.
 *
 * The quote is re-fetched whenever the address, the coupon or the coins toggle
 * changes, and it is never served from cache — `staleTime: 0`, `gcTime: 0`.
 *
 * Placing carries an `Idempotency-Key` minted at the tap. A reply lost to a
 * dropped connection cannot become a second order; the server replays the
 * first. This is the one write in the app that is deliberately *not* queued for
 * later — an order placed silently twenty minutes on, from a cart that has
 * changed and at prices that have moved, is not a kindness.
 */

function Radio({ on }: { on: boolean }) {
  return (
    <View
      style={{
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: on ? 6 : 1.5,
        borderColor: on ? theme.color.brand : theme.color.borderStrong,
        backgroundColor: theme.color.surface,
      }}
    />
  );
}

function Row({
  selected,
  onPress,
  children,
  accessibilityLabel,
}: {
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
  accessibilityLabel: string;
}) {
  return (
    <Touchable
      haptic="selection"
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[3],
        padding: theme.spacing[4],
        borderRadius: theme.radii.lg,
        borderWidth: 1,
        borderColor: selected ? theme.color.brand : theme.color.border,
        backgroundColor: selected ? theme.color.brandSoft : theme.color.surface,
      }}
    >
      <Radio on={selected} />
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </Touchable>
  );
}

function Line({
  label,
  value,
  tone = "textSecondary",
  strong,
}: {
  label: string;
  value: number;
  tone?: "textSecondary" | "success";
  strong?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text variant={strong ? "bodyStrong" : "callout"} color={strong ? "text" : tone}>
        {label}
      </Text>
      <Price
        value={value}
        variant={strong ? "title3" : "callout"}
        style={tone === "success" && !strong ? { color: theme.color.success } : undefined}
      />
    </View>
  );
}

export default function CheckoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const net = useNetwork();
  const { user, http } = useGopasal();
  const t = useT();

  const { data: cart } = useCart();
  const addresses = useAddresses();
  const methods = usePaymentMethods(cart?.shop?.id);
  const offers = useMyOffers(cart?.shop?.slug);
  const place = usePlaceOrder();

  const [addressId, setAddressId] = React.useState<string | null>(null);
  const [method, setMethod] = React.useState<string | null>(null);
  const [coupon, setCoupon] = React.useState("");
  const [couponDraft, setCouponDraft] = React.useState("");
  const [useCoins, setUseCoins] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const rows = addresses.data ?? [];
  const payments = methods.data ?? [];

  // Preselect the customer's default address and the first payment method the
  // shop actually accepts, so the common case is one tap.
  React.useEffect(() => {
    if (addressId || rows.length === 0) return;
    setAddressId((rows.find((a) => a.isDefault) ?? rows[0]).id);
  }, [rows, addressId]);

  React.useEffect(() => {
    if (method || payments.length === 0) return;
    setMethod(payments[0]!.id);
  }, [payments, method]);

  const quote = useQuote({ addressId, couponCode: coupon, useGoCoins: useCoins });
  const q = quote.data;

  const applyCoupon = (code: string) => {
    haptic("light");
    setCoupon(code);
    setCouponDraft(code);
    setError(null);
  };

  const clearCoupon = () => {
    setCoupon("");
    setCouponDraft("");
  };

  const placeOrder = async () => {
    if (!addressId || !method) return;
    setError(null);
    try {
      const order = await place.mutateAsync({
        addressId,
        paymentMethod: method,
        couponCode: coupon || null,
        note,
        useGoCoins: useCoins,
      });
      haptic("success");

      // An online payment hands off to the gateway; cash on delivery is done.
      const redirect = order.payment?.redirectUrl;
      if (redirect) {
        /*
          Stay inside the app for the wallet leg.

          `payAtGateway` opens the gateway in an in-app browser and watches our
          own API for the payment landing, because eSewa and Khalti return to
          an https callback of ours rather than to `gopasal://`. When the
          server says paid, it closes the sheet itself; when the customer backs
          out, the order screen shows "payment not confirmed" with a way to
          finish. Either way they end up on tracking rather than stranded on a
          gateway page in Chrome.
        */
        const outcome = await payAtGateway({
          url: redirect,
          isPaid: async () => {
            const latest = await http.request<{ paymentStatus?: string }>(
              `/orders/${encodeURIComponent(order.id)}`,
            );
            return latest.paymentStatus === "PAID";
          },
        });
        router.replace({
          pathname: "/order/[id]",
          params: { id: order.id, ...(outcome === "paid" ? { placed: "1" } : {}) },
        });
        return;
      }
      router.replace({ pathname: "/order/[id]", params: { id: order.id, placed: "1" } });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("checkout.placeError"),
      );
    }
  };

  if (!user) {
    return (
      <Gate
        title={t("checkout.signIn.title")}
        onPress={() => router.push("/auth/phone")}
        insets={insets.top}
      />
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <Gate
        title={t("cart.empty.title")}
        cta={t("home.browseShops")}
        onPress={() => router.replace("/(tabs)/home")}
        insets={insets.top}
      />
    );
  }

  /**
   * Why the order cannot be placed, in the customer's words.
   *
   * A disabled button with no explanation is the worst state a checkout can be
   * in — the customer can see the total, the address and the payment method,
   * and has no way to learn what is missing. The server's own message is
   * preferred over anything invented here: it said "Please pin your address on
   * the map", and that is both true and actionable, where "something went
   * wrong" is neither.
   */
  const quoteMessage =
    quote.error instanceof Error && quote.error.message ? quote.error.message : null;

  const blockReason: string | null = !addressId
    ? t("checkout.block.address")
    : !method
      ? t("checkout.block.payment")
      : quote.isError
        ? (quoteMessage ??
          (net.isConnected
            ? t("checkout.block.priceError")
            : t("checkout.block.offline")))
        : !q
          ? null
          : q.deliverable === false
            ? t("checkout.block.notDeliverable", {
                shop: cart.shop?.name ?? t("checkout.thisShop"),
              })
            : q.meetsMinOrder === false
              ? t("checkout.block.minOrder", {
                  min: q.minOrder,
                  amount: q.minOrder - q.subtotal,
                })
              : null;

  // A missing pin is the one blocker with a specific fix, so it gets a button
  // rather than a sentence the customer has to act on themselves.
  const needsPin = Boolean(quoteMessage && /pin/i.test(quoteMessage));

  const blocked = Boolean(blockReason) || !q;

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + theme.spacing[2],
            paddingHorizontal: theme.spacing[4],
            paddingBottom: 132 + insets.bottom,
            gap: theme.spacing[4],
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
            <Touchable
              haptic="light"
              onPress={() => router.back()}
              accessibilityLabel={t("common.back")}
              style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="arrow-back" size={20} color={theme.color.text} />
            </Touchable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="title2">{t("checkout.title")}</Text>
              {cart.shop ? (
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {cart.itemCount === 1
                    ? t("checkout.itemsFrom.one", { count: cart.itemCount, shop: cart.shop.name })
                    : t("checkout.itemsFrom.many", { count: cart.itemCount, shop: cart.shop.name })}
                </Text>
              ) : null}
            </View>
          </View>

          {/* 1 — where */}
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text variant="title3">{t("home.deliverTo")}</Text>
              <Touchable
                haptic="light"
                onPress={() => router.push("/address")}
                accessibilityLabel={t("checkout.a11y.manageAddresses")}
                style={{ padding: theme.spacing[2] }}
              >
                <Text variant="caption" color="brand">
                  {rows.length > 0 ? t("checkout.manage") : t("checkout.add")}
                </Text>
              </Touchable>
            </View>

            {addresses.isLoading ? (
              <Skeleton width="100%" height={72} radius={theme.radii.lg} />
            ) : rows.length === 0 ? (
              <>
                <Text variant="footnote" color="textMuted" style={{ marginTop: theme.spacing[2] }}>
                  {t("checkout.noAddress")}
                </Text>
                <Button
                  label={t("address.add")}
                  onPress={() => router.push("/address")}
                  style={{ marginTop: theme.spacing[4] }}
                />
              </>
            ) : (
              <View style={{ gap: theme.spacing[3], marginTop: theme.spacing[3] }}>
                {rows.map((address: Address) => (
                  <Row
                    key={address.id}
                    selected={addressId === address.id}
                    onPress={() => setAddressId(address.id)}
                    accessibilityLabel={t("checkout.a11y.deliverTo", { label: address.label, address: address.fullAddress })}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
                      <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                        {address.label}
                      </Text>
                      {address.isDefault && (
                        <Text variant="overline" color="textFaint">
                          {t("address.default").toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <Text variant="caption" color="textSecondary" numberOfLines={2}>
                      {address.fullAddress}
                      {address.landmark ? ` · ${address.landmark}` : ""}
                    </Text>
                    <Text variant="caption" color="textFaint" numberOfLines={1}>
                      {address.recipientName} · {address.phone}
                    </Text>
                  </Row>
                ))}
              </View>
            )}

            {q && q.deliverable === false && (
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
                  {t("checkout.notDeliverable", { shop: cart.shop?.name ?? t("checkout.thisShop") })}
                </Text>
              </Sunken>
            )}
          </Card>

          {/* 2 — how it's paid */}
          <Card>
            <Text variant="title3">{t("checkout.payment")}</Text>
            {methods.isLoading ? (
              <Skeleton width="100%" height={60} radius={theme.radii.lg} />
            ) : payments.length === 0 ? (
              <Text variant="footnote" color="textMuted" style={{ marginTop: theme.spacing[2] }}>
                {t("checkout.noPayment")}
              </Text>
            ) : (
              <View style={{ gap: theme.spacing[3], marginTop: theme.spacing[3] }}>
                {payments.map((payment: PaymentMethod) => (
                  <Row
                    key={payment.id}
                    selected={method === payment.id}
                    onPress={() => setMethod(payment.id)}
                    accessibilityLabel={t("checkout.a11y.pay", { method: payment.label })}
                  >
                    <Text variant="bodyStrong">{payment.label}</Text>
                    <Text variant="caption" color="textMuted">
                      {payment.description}
                    </Text>
                  </Row>
                ))}
              </View>
            )}
          </Card>

          {/* 3 — what comes off */}
          <Card>
            <Text variant="title3">{t("home.offers")}</Text>

            {(offers.data ?? []).length > 0 && (
              <View style={{ gap: theme.spacing[2], marginTop: theme.spacing[3] }}>
                {(offers.data ?? []).map((offer: Offer) => {
                  const on = coupon.toUpperCase() === offer.code.toUpperCase();
                  const short = (cart.subtotal ?? 0) < offer.minOrder;
                  return (
                    <Touchable
                      key={offer.code}
                      haptic="selection"
                      onPress={() => (on ? clearCoupon() : applyCoupon(offer.code))}
                      disabled={short}
                      accessibilityLabel={
                        on
                          ? t("checkout.a11y.removeOffer", { code: offer.code })
                          : t("checkout.a11y.applyOffer", { code: offer.code })
                      }
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: theme.spacing[3],
                        padding: theme.spacing[3],
                        borderRadius: theme.radii.lg,
                        borderWidth: 1,
                        borderStyle: "dashed",
                        borderColor: on ? theme.color.brand : theme.color.border,
                        backgroundColor: on ? theme.color.brandSoft : theme.color.surface,
                        opacity: short ? 0.55 : 1,
                      }}
                    >
                      <Ionicons
                        name={on ? "checkmark-circle" : "pricetag-outline"}
                        size={17}
                        color={on ? theme.color.brand : theme.color.textMuted}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="callout" numberOfLines={1}>
                          {offerTitle(offer, t)}
                        </Text>
                        <Text variant="caption" color="textMuted" numberOfLines={1}>
                          {/* Says what is missing, not just that it does not apply. */}
                          {short
                            ? t("checkout.offerShort", {
                                amount: offer.minOrder - (cart.subtotal ?? 0),
                              })
                            : offerDetail(offer, t)}
                        </Text>
                      </View>
                      <Text variant="overline" color="textFaint">
                        {offer.code}
                      </Text>
                    </Touchable>
                  );
                })}
              </View>
            )}

            <View style={{ flexDirection: "row", gap: theme.spacing[2], marginTop: theme.spacing[3] }}>
              <View
                style={{
                  flex: 1,
                  height: 46,
                  justifyContent: "center",
                  paddingHorizontal: theme.spacing[4],
                  borderRadius: theme.radii.lg,
                  borderWidth: 1,
                  borderColor: theme.color.border,
                  backgroundColor: theme.color.surfaceSunken,
                }}
              >
                <TextInput
                  value={couponDraft}
                  onChangeText={(text) => setCouponDraft(text.toUpperCase())}
                  placeholder={t("checkout.coupon.placeholder")}
                  placeholderTextColor={theme.color.textFaint}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={64}
                  accessibilityLabel={t("checkout.a11y.coupon")}
                  style={{
                    fontFamily: fontFamily.body,
                    fontSize: 15,
                    color: theme.color.text,
                    letterSpacing: 0.6,
                  }}
                />
              </View>
              <Button
                label={coupon ? t("checkout.remove") : t("checkout.apply")}
                variant="secondary"
                full={false}
                onPress={() => (coupon ? clearCoupon() : applyCoupon(couponDraft))}
                disabled={!coupon && couponDraft.trim().length === 0}
              />
            </View>

            {/* The server is the only party that may say a coupon is good. */}
            {coupon && q && q.couponCode == null && !quote.isFetching && (
              <Text variant="caption" style={{ color: theme.color.danger, marginTop: theme.spacing[2] }}>
                {t("checkout.couponBad", { code: coupon })}
              </Text>
            )}

            {q && q.availableGoCoins > 0 && (
              <Touchable
                haptic="selection"
                onPress={() => setUseCoins((on) => !on)}
                accessibilityLabel={useCoins ? t("checkout.a11y.noCoins") : t("checkout.useCoins")}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: theme.spacing[3],
                  marginTop: theme.spacing[4],
                  padding: theme.spacing[3],
                  borderRadius: theme.radii.lg,
                  borderWidth: 1,
                  borderColor: useCoins ? theme.color.brand : theme.color.border,
                  backgroundColor: useCoins ? theme.color.brandSoft : theme.color.surface,
                }}
              >
                <CoinIcon size={18} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="callout">{t("checkout.useCoins")}</Text>
                  <Text variant="caption" color="textMuted">
                    {q.eligibleGoCoins > 0
                      ? t("checkout.coins.usable", {
                          count: q.eligibleGoCoins,
                          available: q.availableGoCoins,
                          value: q.eligibleGoCoinsValue,
                        })
                      : t("checkout.coins.none", { available: q.availableGoCoins })}
                  </Text>
                </View>
                <Ionicons
                  name={useCoins ? "checkbox" : "square-outline"}
                  size={20}
                  color={useCoins ? theme.color.brand : theme.color.textFaint}
                />
              </Touchable>
            )}
          </Card>

          {/* 4 — anything else */}
          <Card>
            <Text variant="title3">{t("checkout.note")}</Text>
            <View
              style={{
                marginTop: theme.spacing[3],
                minHeight: 72,
                borderRadius: theme.radii.lg,
                borderWidth: 1,
                borderColor: theme.color.border,
                backgroundColor: theme.color.surfaceSunken,
                paddingHorizontal: theme.spacing[4],
                paddingVertical: theme.spacing[3],
              }}
            >
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={t("checkout.note.placeholder")}
                placeholderTextColor={theme.color.textFaint}
                multiline
                maxLength={280}
                accessibilityLabel={t("checkout.note")}
                style={{
                  fontFamily: fontFamily.body,
                  fontSize: 15,
                  lineHeight: 21,
                  color: theme.color.text,
                  textAlignVertical: "top",
                }}
              />
            </View>
          </Card>

          {/* 5 — the money */}
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text variant="title3">{t("checkout.summary")}</Text>
              {quote.isFetching && (
                <Text variant="overline" color="textFaint">
                  {t("checkout.updating").toUpperCase()}
                </Text>
              )}
            </View>

            {quote.isLoading || !q ? (
              <View style={{ gap: theme.spacing[3], marginTop: theme.spacing[3] }}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} width="100%" height={16} delay={i * 80} />
                ))}
              </View>
            ) : (
              <Animated.View
                layout={LinearTransition.duration(200)}
                style={{ gap: theme.spacing[3], marginTop: theme.spacing[3] }}
              >
                <Line label={t("cart.items", { count: cart.itemCount })} value={q.subtotal} />
                <Line
                  label={
                    q.distanceMeters
                      ? t("checkout.deliveryDistance", {
                          distance: (q.distanceMeters / 1000).toFixed(1),
                        })
                      : t("checkout.delivery")
                  }
                  value={q.deliveryFee}
                />
                {q.discount > 0 && (
                  <Line
                    label={q.couponCode ? t("checkout.offerCode", { code: q.couponCode }) : t("checkout.offer")}
                    value={-q.discount}
                    tone="success"
                  />
                )}
                {q.loyaltyDiscount > 0 && (
                  <Line
                    label={t("checkout.coinsLine", { count: q.loyaltyPointsRedeemed })}
                    value={-q.loyaltyDiscount}
                    tone="success"
                  />
                )}
                <View style={{ height: 1, backgroundColor: theme.color.border }} />
                <Line label={t("checkout.total")} value={q.total} strong />
                <Text variant="caption" color="textFaint">
                  {t("checkout.totalNote")}
                </Text>
              </Animated.View>
            )}

            {q && q.meetsMinOrder === false && (
              <Sunken
                style={{
                  flexDirection: "row",
                  gap: theme.spacing[3],
                  marginTop: theme.spacing[3],
                }}
              >
                <Ionicons name="information-circle-outline" size={16} color={theme.color.textMuted} />
                <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                  {t("checkout.minNote", { min: q.minOrder, amount: q.minOrder - q.subtotal })}
                </Text>
              </Sunken>
            )}

            {quote.isError && (
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
                  {net.isConnected
                    ? t("checkout.priceError")
                    : t("checkout.priceOffline")}
                </Text>
              </Sunken>
            )}
          </Card>

          {error ? (
            <Animated.View entering={FadeIn.duration(200)}>
              <Sunken
                style={{
                  flexDirection: "row",
                  gap: theme.spacing[3],
                  backgroundColor: theme.color.dangerSoft,
                }}
              >
                <Ionicons name="alert-circle" size={16} color={theme.color.danger} />
                <Text variant="caption" style={{ color: theme.color.danger, flex: 1 }}>
                  {error}
                </Text>
              </Sunken>
            </Animated.View>
          ) : null}
        </ScrollView>

        {/* the commitment */}
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: theme.spacing[4],
            paddingTop: theme.spacing[4],
            paddingBottom: insets.bottom + theme.spacing[4],
            backgroundColor: theme.color.surface,
            ...theme.shadows.bar,
          }}
        >
          {blockReason ? (
            <Animated.View
              entering={FadeIn.duration(180)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing[3],
                marginBottom: theme.spacing[3],
                padding: theme.spacing[3],
                borderRadius: theme.radii.md,
                backgroundColor: theme.color.dangerSoft,
              }}
            >
              <Ionicons name="alert-circle" size={16} color={theme.color.danger} />
              <Text variant="caption" style={{ color: theme.color.danger, flex: 1 }}>
                {blockReason}
              </Text>
              {needsPin && (
                <Touchable
                  haptic="light"
                  onPress={() => router.push("/address")}
                  accessibilityLabel={t("checkout.a11y.addPin")}
                  style={{
                    paddingHorizontal: theme.spacing[3],
                    height: 28,
                    justifyContent: "center",
                    borderRadius: theme.radii.full,
                    backgroundColor: theme.color.danger,
                  }}
                >
                  <Text variant="overline" style={{ color: palette.white }}>
                    {t("checkout.addPin").toUpperCase()}
                  </Text>
                </Touchable>
              )}
            </Animated.View>
          ) : null}

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: theme.spacing[3],
            }}
          >
            <Text variant="caption" color="textMuted">
              {method === "COD" ? t("checkout.payRider") : t("checkout.payingNow")}
            </Text>
            {q ? (
              <Price value={q.total} variant="title3" />
            ) : quote.isError ? (
              <Text variant="caption" color="textFaint">
                {t("checkout.noTotal")}
              </Text>
            ) : (
              <Skeleton width={80} height={18} />
            )}
          </View>

          <Button
            label={method === "COD" ? t("checkout.place") : `${t("checkout.place")} · ${t("checkout.payment")}`}
            size="lg"
            loading={place.isPending}
            disabled={blocked || place.isPending}
            onPress={placeOrder}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Gate({
  title,
  cta,
  onPress,
  insets,
}: {
  title: string;
  cta?: string;
  onPress: () => void;
  insets: number;
}) {
  const t = useT();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: theme.spacing[6],
        paddingTop: insets,
        backgroundColor: theme.color.background,
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
      <Text variant="title3" align="center" style={{ marginTop: theme.spacing[4] }}>
        {title}
      </Text>
      <Button label={cta ?? t("common.continue")} full={false} onPress={onPress} style={{ marginTop: theme.spacing[5] }} />
    </View>
  );
}
