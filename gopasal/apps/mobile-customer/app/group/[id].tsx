import * as React from "react";
import { RefreshControl, ScrollView, Share, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  useAddresses,
  useGopasal,
  useGroupOrder,
  useGroupOrderActions,
  useGroupQuote,
  usePaymentMethods,
  useShopProducts,
  type GroupParticipant,
  type Product,
} from "@gopasal/native-data";
import {
  Button,
  Card,
  Confirm,
  ConnectionBanner,
  Price,
  Skeleton,
  Sunken,
  Text,
  Touchable,
  haptic,
  palette,
  theme,
  useT,
} from "@gopasal/native-ui";

/**
 * A group order room.
 *
 * Everyone in here is editing the same basket from a different phone, so the
 * screen has to answer "what have the others added" as readily as "what have
 * I". Hence the two panels: your own items with steppers, and a roster showing
 * what each person is contributing.
 *
 * Two rules the server enforces and this screen makes visible rather than
 * discovering the hard way:
 *
 *  - **Only the host can lock, cancel or place.** Everyone else gets "leave".
 *  - **Locking stops edits.** A basket that could change while the host is
 *    paying would produce a total nobody agreed to, so once it is locked the
 *    steppers go away and say why.
 */

/**
 * One buyable thing: a plain product, or one option of a product.
 *
 * The shelf is flattened rather than nested because a group room is the wrong
 * place for a chooser sheet — everybody is watching the same list and the
 * fastest way to say "I want the 5 kg" is for the 5 kg to be a row with a
 * stepper on it. The server insists on the variant anyway.
 */
type Sellable = {
  key: string;
  productId: string;
  variantId: string | null;
  name: string;
  detail: string | null;
  price: number;
  soldOut: boolean;
};

/** `productId` alone, or `productId:variantId` — the identity of a line. */
function keyOf(productId: string, variantId?: string | null): string {
  return variantId ? `${productId}:${variantId}` : productId;
}

function shelfOf(products: Product[]): Sellable[] {
  const out: Sellable[] = [];
  for (const product of products) {
    const options = (product.variants ?? []).filter((v) => v.isActive !== false);
    if (options.length === 0) {
      out.push({
        key: product.id,
        productId: product.id,
        variantId: null,
        name: product.name,
        detail: product.unit ?? null,
        price: product.price,
        soldOut: product.trackStock === true && (product.stock ?? 0) <= 0,
      });
      continue;
    }
    for (const variant of options) {
      out.push({
        key: keyOf(product.id, variant.id),
        productId: product.id,
        variantId: variant.id,
        name: product.name,
        detail: variant.name,
        price: variant.price,
        soldOut: variant.stock != null && variant.stock <= 0,
      });
    }
  }
  return out;
}

function money(shelf: Sellable[], items: GroupParticipant["items"]): number {
  // Prices come from the shop's catalogue, which this screen already has; the
  // figure the host actually pays still comes from the server's quote.
  return items.reduce((sum, item) => {
    const row = shelf.find((s) => s.key === keyOf(item.productId, item.variantId));
    return sum + (row?.price ?? 0) * item.qty;
  }, 0);
}

export default function GroupRoomScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useGopasal();
  const [focused, setFocused] = React.useState(false);

  useFocusEffect(
    React.useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const groupId = String(id ?? "");
  const group = useGroupOrder(groupId, { poll: focused });
  const data = group.data;
  const open = data?.status === "OPEN";

  const products = useShopProducts(data?.shop.slug ?? "");
  const shelf = React.useMemo(() => shelfOf(products.data?.data ?? []), [products.data]);
  const actions = useGroupOrderActions(groupId);

  const addresses = useAddresses();
  const methods = usePaymentMethods(data?.shopId);
  const [addressId, setAddressId] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const isHost = data?.hostId === user?.id;
  const mine = data?.participants.find((p) => p.userId === user?.id);

  // Draft edits are local until saved, so a stepper tap does not fire a write
  // per tap into a room other people are polling.
  const [draft, setDraft] = React.useState<Record<string, number> | null>(null);
  const items = React.useMemo(() => {
    if (draft) return draft;
    const map: Record<string, number> = {};
    for (const item of mine?.items ?? []) map[keyOf(item.productId, item.variantId)] = item.qty;
    return map;
  }, [draft, mine]);
  const dirty = draft !== null;

  const setQty = (key: string, qty: number) => {
    haptic("light");
    setDraft({ ...items, [key]: Math.max(0, qty) });
  };

  const save = async () => {
    const payload = Object.entries(items)
      .filter(([, qty]) => qty > 0)
      .map(([key, qty]) => {
        const [productId, variantId] = key.split(":");
        return { productId, variantId: variantId ?? null, qty };
      });
    await actions.setItems.mutateAsync(payload);
    haptic("success");
    setDraft(null);
  };

  const share = async () => {
    if (!data) return;
    try {
      await Share.share({
        message: t("group.share.message", { shop: data.shop.name, code: data.code }),
      });
    } catch {
      /* the sheet can be dismissed; the code is on screen */
    }
  };

  const copy = async () => {
    if (!data) return;
    try {
      await Clipboard.setStringAsync(data.code);
    } catch {
      /* clipboard may be unavailable */
    }
    haptic("success");
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const quote = useGroupQuote(groupId, addressId, Boolean(isHost) && data?.status === "LOCKED");

  React.useEffect(() => {
    const list = addresses.data ?? [];
    if (addressId || list.length === 0) return;
    setAddressId((list.find((a) => a.isDefault) ?? list[0]).id);
  }, [addresses.data, addressId]);

  // Our own dialogs and an inline error: Alert.alert does nothing on web, so
  // both the confirmations and this failure message were invisible there.
  const [placeError, setPlaceError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<"cancel" | "leave" | null>(null);

  const place = async () => {
    if (!addressId) return;
    const method = (methods.data ?? [])[0]?.id ?? "COD";
    try {
      const order = await actions.place.mutateAsync({ addressId, paymentMethod: method });
      haptic("success");
      router.replace({ pathname: "/order/[id]", params: { id: order.id, placed: "1" } });
    } catch (e) {
      setPlaceError(e instanceof Error ? e.message : t("group.error.tryAgain"));
    }
  };

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.background, paddingTop: insets.top + 60, paddingHorizontal: theme.spacing[4], gap: theme.spacing[3] }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} width="100%" height={90} radius={theme.radii.lg} delay={i * 90} />
        ))}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing[2],
          paddingHorizontal: theme.spacing[4],
          paddingBottom: theme.spacing[10],
          gap: theme.spacing[4],
        }}
        refreshControl={
          <RefreshControl
            refreshing={group.isFetching && !group.isLoading}
            onRefresh={group.refetch}
            tintColor={theme.color.brand}
            colors={[palette.crimson[500]]}
          />
        }
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
            <Text variant="title2" numberOfLines={1}>
              {data.shop.name}
            </Text>
            <Text variant="caption" color="textMuted">
              {data.status === "OPEN"
                ? t("group.room.status.open")
                : data.status === "LOCKED"
                  ? t("group.room.status.locked")
                  : data.status === "PLACED"
                    ? t("group.status.PLACED")
                    : t("group.status.CANCELLED")}
            </Text>
          </View>
        </View>

        {/* the code — the product */}
        <Card>
          <Text variant="caption" color="textMuted">
            {t("group.code.share")}
          </Text>
          <Touchable
            haptic="none"
            onPress={copy}
            accessibilityLabel={t("group.code.copyA11y", { code: data.code })}
            style={{
              marginTop: theme.spacing[2],
              padding: theme.spacing[4],
              borderRadius: theme.radii.lg,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: theme.color.brandBorder,
              backgroundColor: theme.color.brandSoft,
              alignItems: "center",
            }}
          >
            <Text variant="display" style={{ color: theme.color.brand, letterSpacing: 2 }}>
              {data.code}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 }}>
              <Ionicons
                name={copied ? "checkmark-circle" : "copy-outline"}
                size={13}
                color={theme.color.brand}
              />
              <Text variant="overline" color="brand">
                {copied ? t("group.code.copied") : t("group.code.tapToCopy")}
              </Text>
            </View>
          </Touchable>
          <Button label={t("group.share")} variant="secondary" onPress={share} style={{ marginTop: theme.spacing[3] }} />
        </Card>

        {/* who is in */}
        <Card>
          <Text variant="title3">
            {data.participants.length === 1
              ? t("group.people.one", { count: data.participants.length })
              : t("group.people.other", { count: data.participants.length })}
          </Text>
          <View style={{ gap: theme.spacing[3], marginTop: theme.spacing[3] }}>
            {data.participants.map((p) => {
              const count = p.items.reduce((sum, i) => sum + i.qty, 0);
              return (
                <View
                  key={p.id}
                  style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: theme.color.surfaceSunken,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {/* An initial when we know a name, a person otherwise — a
                        "?" where somebody's initial belongs reads as an error
                        rather than as an unset name. */}
                    {p.user.name?.trim() ? (
                      <Text variant="caption" color="textSecondary">
                        {p.user.name.trim().slice(0, 1).toUpperCase()}
                      </Text>
                    ) : (
                      <Ionicons name="person" size={15} color={theme.color.textFaint} />
                    )}
                  </View>
                  <Text variant="callout" style={{ flex: 1 }} numberOfLines={1}>
                    {p.userId === user?.id ? t("group.you") : (p.user.name ?? t("group.someone"))}
                    {p.userId === data.hostId ? ` · ${t("group.host")}` : ""}
                  </Text>
                  <Text variant="caption" color="textMuted">
                    {count === 0
                      ? t("group.items.none")
                      : count === 1
                        ? t("group.items.one", { count })
                        : t("group.items.other", { count })}
                  </Text>
                  {count > 0 && <Price value={money(shelf, p.items)} variant="caption" />}
                </View>
              );
            })}
          </View>
        </Card>

        {/* my basket */}
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text variant="title3">{t("group.basket.title")}</Text>
            {dirty && (
              <Text variant="overline" color="brand">
                {t("group.basket.unsaved")}
              </Text>
            )}
          </View>

          {!open ? (
            <Sunken style={{ marginTop: theme.spacing[3], flexDirection: "row", gap: theme.spacing[3] }}>
              <Ionicons name="lock-closed-outline" size={16} color={theme.color.textMuted} />
              <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                {data.status === "LOCKED"
                  ? t("group.basket.lockedNote")
                  : t("group.basket.closedNote")}
              </Text>
            </Sunken>
          ) : products.isLoading ? (
            <View style={{ gap: theme.spacing[3], marginTop: theme.spacing[3] }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} width="100%" height={20} delay={i * 70} />
              ))}
            </View>
          ) : (
            <Animated.View layout={LinearTransition.duration(200)} style={{ gap: theme.spacing[3], marginTop: theme.spacing[3] }}>
              {shelf.map((row) => {
                const qty = items[row.key] ?? 0;
                const label = row.detail ? `${row.name} ${row.detail}` : row.name;
                return (
                  <View
                    key={row.key}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: theme.spacing[3],
                      opacity: row.soldOut ? 0.5 : 1,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="callout" numberOfLines={1}>
                        {row.name}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "baseline", gap: theme.spacing[2] }}>
                        <Price value={row.price} variant="caption" />
                        {row.detail ? (
                          <Text variant="caption" color="textMuted" numberOfLines={1}>
                            · {row.detail}
                          </Text>
                        ) : null}
                        {row.soldOut && (
                          <Text variant="caption" color="danger">
                            {t("product.soldOut")}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        height: 32,
                        borderRadius: theme.radii.full,
                        borderWidth: 1,
                        borderColor: qty > 0 ? theme.color.brand : theme.color.border,
                        backgroundColor: qty > 0 ? theme.color.brandSoft : theme.color.surface,
                      }}
                    >
                      <Touchable
                        haptic="light"
                        onPress={() => setQty(row.key, qty - 1)}
                        disabled={qty === 0}
                        accessibilityLabel={t("group.qty.less", { item: label })}
                        style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}
                      >
                        <Ionicons
                          name="remove"
                          size={14}
                          color={qty === 0 ? theme.color.textFaint : theme.color.brand}
                        />
                      </Touchable>
                      <Text variant="caption" style={{ minWidth: 18, textAlign: "center" }} tabular>
                        {qty}
                      </Text>
                      <Touchable
                        haptic="light"
                        onPress={() => setQty(row.key, qty + 1)}
                        disabled={row.soldOut}
                        accessibilityLabel={t("group.qty.more", { item: label })}
                        style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}
                      >
                        <Ionicons
                          name="add"
                          size={14}
                          color={row.soldOut ? theme.color.textFaint : theme.color.brand}
                        />
                      </Touchable>
                    </View>
                  </View>
                );
              })}

              {/* A full-width primary button that is permanently greyed out is
                  the loudest thing on the card and says nothing. The button
                  appears only when there is something to save; otherwise a
                  quiet line reports the state. */}
              {dirty ? (
                <Button
                  label={t("group.basket.save")}
                  loading={actions.setItems.isPending}
                  onPress={save}
                  style={{ marginTop: theme.spacing[2] }}
                />
              ) : (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: theme.spacing[2],
                    marginTop: theme.spacing[2],
                  }}
                >
                  <Ionicons
                    name={(mine?.items.length ?? 0) > 0 ? "checkmark-circle" : "add-circle-outline"}
                    size={15}
                    color={(mine?.items.length ?? 0) > 0 ? theme.color.success : theme.color.textFaint}
                  />
                  <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
                    {(mine?.items.length ?? 0) > 0
                      ? t("group.basket.saved")
                      : t("group.basket.addPrompt")}
                  </Text>
                </View>
              )}
            </Animated.View>
          )}
        </Card>

        {/* host controls */}
        {isHost && data.status === "OPEN" && (
          <Card>
            <Text variant="title3">{t("group.host.title")}</Text>
            <Text variant="footnote" color="textSecondary" style={{ marginTop: theme.spacing[2] }}>
              {t("group.host.lockNote")}
            </Text>
            <Button
              label={t("group.host.lock")}
              loading={actions.lock.isPending}
              onPress={() => actions.lock.mutate()}
              style={{ marginTop: theme.spacing[4] }}
            />
            <Button
              label={t("group.host.cancel")}
              variant="ghost"
              onPress={() =>
                setConfirming("cancel")
              }
              style={{ marginTop: theme.spacing[2] }}
            />
          </Card>
        )}

        {isHost && data.status === "LOCKED" && (
          <Card>
            <Text variant="title3">{t("group.pay.title")}</Text>

            <View style={{ gap: theme.spacing[2], marginTop: theme.spacing[3] }}>
              {(addresses.data ?? []).map((address) => (
                <Touchable
                  key={address.id}
                  haptic="selection"
                  onPress={() => setAddressId(address.id)}
                  accessibilityLabel={t("group.pay.deliverTo", { label: address.label })}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: theme.spacing[3],
                    padding: theme.spacing[3],
                    borderRadius: theme.radii.lg,
                    borderWidth: 1,
                    borderColor: addressId === address.id ? theme.color.brand : theme.color.border,
                    backgroundColor:
                      addressId === address.id ? theme.color.brandSoft : theme.color.surface,
                  }}
                >
                  <Ionicons
                    name={addressId === address.id ? "radio-button-on" : "radio-button-off"}
                    size={18}
                    color={addressId === address.id ? theme.color.brand : theme.color.textFaint}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="callout" numberOfLines={1}>
                      {address.label}
                    </Text>
                    <Text variant="caption" color="textMuted" numberOfLines={1}>
                      {address.fullAddress}
                    </Text>
                  </View>
                </Touchable>
              ))}
            </View>

            {quote.data ? (
              <View style={{ gap: theme.spacing[2], marginTop: theme.spacing[4] }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text variant="callout" color="textSecondary">
                    {t("group.pay.items")}
                  </Text>
                  <Price value={quote.data.subtotal} variant="callout" />
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text variant="callout" color="textSecondary">
                    {t("checkout.delivery")}
                  </Text>
                  <Price value={quote.data.deliveryFee} variant="callout" />
                </View>
                <View style={{ height: 1, backgroundColor: theme.color.border }} />
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text variant="bodyStrong">{t("checkout.total")}</Text>
                  <Price value={quote.data.total} variant="title3" />
                </View>
              </View>
            ) : quote.isError ? (
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
                  {quote.error instanceof Error
                    ? quote.error.message
                    : t("group.pay.quoteError")}
                </Text>
              </Sunken>
            ) : (
              <Skeleton width="100%" height={60} radius={theme.radii.md} />
            )}

            {placeError ? (
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
                  {placeError}
                </Text>
              </Sunken>
            ) : null}

            <Button
              label={t("group.pay.place")}
              size="lg"
              loading={actions.place.isPending}
              disabled={!addressId || !quote.data || actions.place.isPending}
              onPress={place}
              style={{ marginTop: theme.spacing[4] }}
            />
          </Card>
        )}

        {!isHost && open && (
          <Touchable
            haptic="warning"
            onPress={() =>
              setConfirming("leave")
            }
            accessibilityLabel={t("group.leave")}
            style={{ alignSelf: "center", padding: theme.spacing[3] }}
          >
            <Text variant="caption" style={{ color: theme.color.danger }}>
              {t("group.leave")}
            </Text>
          </Touchable>
        )}

        {data.order && (
          <Animated.View entering={FadeIn.duration(240)}>
            <Button
              label={t("group.trackOrder", { code: data.order.code })}
              onPress={() =>
                router.push({ pathname: "/order/[id]", params: { id: data.order!.id } })
              }
            />
          </Animated.View>
        )}
      </ScrollView>

      <Confirm
        visible={confirming === "cancel"}
        title={t("group.cancel.confirm.title")}
        message={t("group.cancel.confirm.message")}
        confirmLabel={t("group.cancel.confirm.yes")}
        cancelLabel={t("group.cancel.confirm.no")}
        destructive
        busy={actions.cancel.isPending}
        onConfirm={() => {
          setConfirming(null);
          actions.cancel.mutate();
        }}
        onCancel={() => setConfirming(null)}
      />

      <Confirm
        visible={confirming === "leave"}
        title={t("group.leave.confirm.title")}
        message={t("group.leave.confirm.message")}
        confirmLabel={t("group.leave.confirm.yes")}
        cancelLabel={t("group.leave.confirm.no")}
        destructive
        busy={actions.leave.isPending}
        onConfirm={async () => {
          setConfirming(null);
          await actions.leave.mutateAsync();
          router.back();
        }}
        onCancel={() => setConfirming(null)}
      />
    </View>
  );
}
