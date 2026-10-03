import * as React from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { useGopasal } from "@gopasal/native-data";
import {
  useSelectedShop,
  useShopRiders,
  useShopSettings,
  type SellerShop,
} from "@gopasal/native-data/seller";
import { useShopPermissions } from "@gopasal/native-data/seller-team";
import {
  Button,
  Card,
  Confirm,
  ConnectionBanner,
  Price,
  Skeleton,
  Text,
  Touchable,
  theme,
  useI18n,
} from "@gopasal/native-ui";
import { ShopMinOrderSheet } from "../../components/ShopMinOrderSheet";
import { ShopRiderRoster } from "../../components/ShopRiderRoster";
import { ShopRow, ShopRowDivider } from "../../components/ShopRow";
import { ShopShutter } from "../../components/ShopShutter";

/**
 * The shop tab.
 *
 * Everything a shopkeeper can change about the shop *from behind the counter*,
 * which is a much shorter list than everything a shop has. The order is by how
 * often a thumb lands on it, not by how the settings are grouped on the server:
 *
 *  1. **The shutter**, alone at the top, in the space a screen usually spends on
 *     a header. It is the reason this tab gets opened — someone stepping out for
 *     twenty minutes, someone whose gas cylinder just ran out — and it must be
 *     readable and reachable without scrolling or reading.
 *  2. **The minimum order**, which moves on a wet afternoon when nobody wants to
 *     ride out for eighty rupees.
 *  3. **The roster and the reviews**, which are read rather than changed.
 *  4. **Language**, above the destructive row and not buried under it, because
 *     somebody who needs it cannot read the rows around it.
 *  5. **Sign out**, last, behind a confirmation that names the real cost: the
 *     order alerts stop.
 *
 * What the console keeps — photographs, staff, delivery areas, coupons, adding
 * and removing riders — is stated once, in the place a reader would otherwise
 * start hunting for it, rather than left as an absence they have to interpret.
 */

/** The three reasons `storefront.visible` can be false, in the API's own words. */
const BLOCKER_COPY: Record<SellerShop["storefront"]["blockers"][number], string> = {
  APPROVAL: "shop.blocker.approval",
  VERIFIED_LOCATION: "shop.blocker.location",
  DELIVERABLE_PRODUCT: "shop.blocker.stock",
};

export default function ShopTab() {
  const { t, language, setLanguage, languages } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { shopId, shop, shops, ready } = useSelectedShop();
  const { user, signOut } = useGopasal();

  // Two instances of the same mutation on purpose. They are separate pieces of
  // work — a shutter toggle and a saved minimum — and sharing one `isPending`
  // would put a spinner on the shutter because somebody was typing a number.
  const shutter = useShopSettings(shopId);
  const minOrderSave = useShopSettings(shopId);
  const riders = useShopRiders(shopId);

  // What this person may open. A UI affordance only — every screen behind these
  // rows is still refused by the server if the role does not allow it.
  const permissions = useShopPermissions(shopId);
  const can = (key: string) => permissions.ready && (permissions.owner || permissions.has(key));

  const manageRows: {
    route: "/team" | "/promotions" | "/delivery" | "/settings";
    icon: React.ComponentProps<typeof Ionicons>["name"];
    label: string;
    detail: string;
  }[] = [
    ...(can("team.view")
      ? [
          {
            route: "/team" as const,
            icon: "people-outline" as const,
            label: t("shop.manage.team"),
            detail: t("shop.manage.teamDetail"),
          },
        ]
      : []),
    ...(can("promotions.view")
      ? [
          {
            route: "/promotions" as const,
            icon: "ticket-outline" as const,
            label: t("shop.manage.promotions"),
            detail: t("shop.manage.promotionsDetail"),
          },
        ]
      : []),
    ...(can("delivery.view")
      ? [
          {
            route: "/delivery" as const,
            icon: "bicycle-outline" as const,
            label: t("shop.manage.delivery"),
            detail: t("shop.manage.deliveryDetail"),
          },
        ]
      : []),
    ...(can("dashboard.view") || can("settings.manage")
      ? [
          {
            route: "/settings" as const,
            icon: "settings-outline" as const,
            label: t("shop.manage.settings"),
            detail: t("shop.manage.settingsDetail"),
          },
        ]
      : []),
  ];

  const [shutterError, setShutterError] = React.useState<string | null>(null);
  const [confirmClose, setConfirmClose] = React.useState(false);

  const [editingMinOrder, setEditingMinOrder] = React.useState(false);
  const [minOrderError, setMinOrderError] = React.useState<string | null>(null);
  /**
   * The minimum the server confirmed, held only until the refetched shop list
   * agrees with it.
   *
   * The PATCH answers with the stored row, and that — not the number that was
   * typed — is what the row shows in the second or two before the invalidated
   * shop list comes back. Cleared by the effect below on any change to the
   * fetched value, so a colleague's later edit cannot be masked by it.
   */
  const [confirmedMinOrder, setConfirmedMinOrder] = React.useState<number | null>(null);
  React.useEffect(() => {
    setConfirmedMinOrder(null);
  }, [shop?.minOrder]);
  /**
   * The same number again, on its own timer, purely to say "saved".
   *
   * Kept apart from `confirmedMinOrder` because the two answer different
   * questions: that one is *what the minimum is* and lives until the server
   * says it again, this one is *something just happened* and has to stop saying
   * so. Folding them together would either drop the confirmed value after four
   * seconds or leave a green line on the screen for the rest of the shift.
   */
  const [justSaved, setJustSaved] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (justSaved === null) return;
    const timer = setTimeout(() => setJustSaved(null), 4_000);
    return () => clearTimeout(timer);
  }, [justSaved]);

  const [confirmSignOut, setConfirmSignOut] = React.useState(false);

  if (!ready) return <Loading />;

  // Ready, and still no shop: the gate normally settles this before any tab
  // mounts, but a seller who backed out of the picker can land here. A
  // permanent skeleton would read as a hung screen, so the screen says what is
  // missing and offers the one thing that fixes it.
  if (!shop) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: theme.spacing[2],
          padding: theme.spacing[6],
          backgroundColor: theme.color.background,
        }}
      >
        <Ionicons name="storefront-outline" size={30} color={theme.color.textFaint} />
        <Text variant="title3" align="center">
          {t("shop.choose.title")}
        </Text>
        <Text variant="footnote" color="textMuted" align="center">
          {t("shop.choose.detail")}
        </Text>
        <Button
          label={t("shop.switch")}
          full={false}
          onPress={() => router.push("/shop-picker")}
          style={{ marginTop: theme.spacing[3] }}
        />
      </View>
    );
  }

  const minOrder = confirmedMinOrder ?? shop.minOrder;
  const blockers = shop.storefront.blockers;

  const setOpen = (next: boolean) => {
    setShutterError(null);
    // No local mirror of `isOpen`: the hook patches the cached shop row before
    // the request leaves and puts back exactly what the server last confirmed
    // if it fails. A second copy here would fight it on a slow connection.
    shutter.mutate(
      { isOpen: next },
      { onError: () => setShutterError(t("common.somethingWrong")) },
    );
  };

  const saveMinOrder = async (next: number) => {
    if (!shopId) return;
    setMinOrderError(null);
    try {
      // `row.minOrder` — the column as the server stored it — not `next`. The
      // two are the same number in every ordinary case, and the one case where
      // they are not is the one worth being right about.
      const row = await minOrderSave.mutateAsync({ minOrder: next });
      setConfirmedMinOrder(row.minOrder);
      setJustSaved(row.minOrder);
      setEditingMinOrder(false);
    } catch {
      setMinOrderError(t("common.somethingWrong"));
    }
  };

  const doSignOut = async () => {
    setConfirmSignOut(false);
    await signOut();
    // `replace`, not `push`: the counter must not be behind a back gesture once
    // the session is gone.
    router.replace("/");
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing[3],
          paddingHorizontal: theme.spacing[4],
          paddingBottom: theme.spacing[10] + insets.bottom,
          gap: theme.spacing[4],
        }}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text variant="title1">{t("shop.title")}</Text>
          <Text variant="footnote" color="textMuted" numberOfLines={1}>
            {shop.area?.trim() ? `${shop.name} · ${shop.area.trim()}` : shop.name}
          </Text>
        </View>

        <ShopShutter
          isOpen={shop.isOpen}
          busy={shutter.isPending}
          error={shutterError}
          onOpen={() => setOpen(true)}
          onRequestClose={() => setConfirmClose(true)}
        />

        {/* Open and still invisible is the question this app gets asked most
            often and can actually answer — `storefront.blockers` is the API's
            own list of reasons, rendered verbatim rather than guessed at from
            `status` and `isOpen`, which between them cannot express
            "approved, open, and stocking nothing deliverable". */}
        {shop.isOpen && !shop.storefront.visible ? (
          <Animated.View entering={FadeIn.duration(160)}>
            <Card style={{ borderColor: theme.color.warning }}>
              <View style={{ flexDirection: "row", gap: theme.spacing[3] }}>
                <Ionicons name="eye-off-outline" size={18} color={theme.color.warning} />
                <View style={{ flex: 1, minWidth: 0, gap: theme.spacing[1] }}>
                  <Text variant="callout">{t("shop.hidden.title")}</Text>
                  {blockers.map((blocker) => (
                    <Text key={blocker} variant="footnote" color="textSecondary">
                      {t(BLOCKER_COPY[blocker])}
                    </Text>
                  ))}
                  {/* GoPasal's own words to the owner, not a string of ours. */}
                  {shop.statusReason ? (
                    <Text variant="footnote" color="textMuted">
                      {shop.statusReason}
                    </Text>
                  ) : null}
                </View>
              </View>
            </Card>
          </Animated.View>
        ) : null}

        <Card padded={false}>
          <View style={{ paddingHorizontal: theme.spacing[4] }}>
            <ShopRow
              icon="pricetag-outline"
              label={t("shop.minOrder")}
              detail={t("shop.minOrderDetail")}
              accessibilityLabel={t("shop.minOrder.a11yRow", { amount: minOrder })}
              value={
                minOrder > 0 ? (
                  <Price value={minOrder} variant="callout" color="textSecondary" />
                ) : (
                  <Text variant="callout" color="textSecondary">
                    {t("shop.minOrder.noneShort")}
                  </Text>
                )
              }
              onPress={() => {
                setMinOrderError(null);
                setEditingMinOrder(true);
              }}
            />
            {justSaved !== null ? (
              <Animated.View
                entering={FadeIn.duration(140)}
                style={{ paddingBottom: theme.spacing[3] }}
              >
                <Text variant="caption" color="success">
                  {t("shop.minOrder.saved", { amount: justSaved })}
                </Text>
              </Animated.View>
            ) : null}

            <ShopRowDivider />

            <ShopRow
              icon="star-outline"
              label={t("shop.reviews")}
              detail={
                shop.ratingCount > 0
                  ? t("shop.reviewsDetail", {
                      rating: shop.ratingAvg.toFixed(1),
                      count: shop.ratingCount,
                    })
                  : t("reviews.empty.title")
              }
              onPress={() => router.push("/reviews")}
            />
          </View>
        </Card>

        {/* The roster, read-only. Availability is the rider's own app to set and
            the assign transaction's to move; there is no seller route for it,
            so nothing here offers a control over it. */}
        <Card>
          <Text variant="title3">{t("shop.riders")}</Text>
          <View style={{ marginTop: theme.spacing[3] }}>
            <ShopRiderRoster
              riders={riders.data ?? []}
              loading={riders.isPending}
              failed={riders.isError}
            />
          </View>
          {can("delivery.view") ? (
            <Button
              label={t("shop.riders.manage")}
              variant="secondary"
              size="sm"
              full={false}
              align="start"
              onPress={() => router.push("/delivery")}
              style={{ marginTop: theme.spacing[3] }}
            />
          ) : null}
        </Card>

        {/* Language sits above the destructive rows, not below them: somebody
            who needs this switch cannot read the rows around it. */}
        <Card>
          <Text variant="title3">{t("language.title")}</Text>
          <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
            {t("language.detail")}
          </Text>
          <View
            style={{ flexDirection: "row", gap: theme.spacing[2], marginTop: theme.spacing[3] }}
          >
            {languages.map((option) => {
              const on = option.code === language;
              return (
                <Touchable
                  key={option.code}
                  haptic="selection"
                  onPress={() => setLanguage(option.code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t("language.a11y.use", { language: option.english })}
                  style={{
                    flex: 1,
                    paddingVertical: theme.spacing[3],
                    borderRadius: theme.radii.lg,
                    borderWidth: 1,
                    borderColor: on ? theme.color.brand : theme.color.border,
                    backgroundColor: on ? theme.color.brandSoft : theme.color.surface,
                    alignItems: "center",
                  }}
                >
                  <Text
                    variant="callout"
                    script={option.code === "np" ? "np" : undefined}
                    color={on ? "brand" : "text"}
                  >
                    {option.label}
                  </Text>
                </Touchable>
              );
            })}
          </View>
        </Card>

        {/* Running the shop. This card used to say "everything else is on the
            web console"; the phone can do all of it now, so it lists the doors
            instead. Each row is drawn only for a role that can open it. */}
        {manageRows.length > 0 ? (
          <Card padded={false}>
            <View style={{ paddingHorizontal: theme.spacing[4] }}>
              {manageRows.map((row, index) => (
                <React.Fragment key={row.route}>
                  {index > 0 ? <ShopRowDivider /> : null}
                  <ShopRow
                    icon={row.icon}
                    label={row.label}
                    detail={row.detail}
                    onPress={() => router.push(row.route)}
                  />
                </React.Fragment>
              ))}
            </View>
          </Card>
        ) : null}

        <Card padded={false}>
          <View style={{ paddingHorizontal: theme.spacing[4] }}>
            {/* Only when there is somewhere to switch to. A seller with one
                shop would land on a list of one and have to come back. */}
            {shops.length > 1 ? (
              <>
                <ShopRow
                  icon="swap-horizontal-outline"
                  label={t("shop.switch")}
                  detail={t("shop.switchDetail", { count: shops.length })}
                  onPress={() => router.push("/shop-picker")}
                />
                <ShopRowDivider />
              </>
            ) : null}

            <ShopRow
              icon="enter-outline"
              label={t("join.another")}
              detail={t("join.anotherDetail")}
              onPress={() => router.push("/join")}
            />
            <ShopRowDivider />

            <ShopRow
              icon="log-out-outline"
              label={t("shop.signOut")}
              detail={user?.phone ?? null}
              tone="danger"
              onPress={() => setConfirmSignOut(true)}
            />
          </View>
        </Card>

        <Text variant="caption" color="textFaint" align="center">
          {`GoPasal ${Constants.expoConfig?.version ?? ""}`}
        </Text>
      </ScrollView>

      <ShopMinOrderSheet
        visible={editingMinOrder}
        current={minOrder}
        busy={minOrderSave.isPending}
        error={minOrderError}
        onSubmit={(next) => void saveMinOrder(next)}
        onClose={() => {
          setEditingMinOrder(false);
          setMinOrderError(null);
        }}
      />

      {/* Closing is the one change on this screen that costs money while
          nobody is looking, so it is the one that asks. The message is the
          exact promise the shutter makes: hidden from the app, and the orders
          already placed still have to be finished. */}
      <Confirm
        visible={confirmClose}
        title={t("shop.close.confirm")}
        message={t("shop.closedDetail")}
        confirmLabel={t("shop.closeAction")}
        cancelLabel={t("shop.stayOpen")}
        destructive
        busy={shutter.isPending}
        onConfirm={() => {
          setConfirmClose(false);
          setOpen(false);
        }}
        onCancel={() => setConfirmClose(false)}
      />

      <Confirm
        visible={confirmSignOut}
        title={t("shop.signOut.confirm")}
        message={t("shop.signOut.detail")}
        confirmLabel={t("shop.signOut")}
        cancelLabel={t("shop.stay")}
        destructive
        onConfirm={() => void doSignOut()}
        onCancel={() => setConfirmSignOut(false)}
      />
    </View>
  );
}

/**
 * The frame, while the stored shop id and the shop list are still being read.
 *
 * Shaped like the screen it is standing in for — a shutter-sized block, then
 * rows — so nothing jumps when the real thing arrives.
 */
function Loading() {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.color.background,
        paddingTop: insets.top + theme.spacing[5],
        paddingHorizontal: theme.spacing[4],
        gap: theme.spacing[4],
      }}
    >
      <Skeleton width="40%" height={26} />
      <Skeleton width="100%" height={112} radius={theme.radii.xl} delay={60} />
      <Skeleton width="100%" height={56} radius={theme.radii.lg} delay={120} />
      <Skeleton width="100%" height={140} radius={theme.radii.lg} delay={180} />
    </View>
  );
}
