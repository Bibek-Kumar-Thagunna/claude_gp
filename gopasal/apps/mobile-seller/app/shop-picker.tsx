import * as React from "react";
import { ScrollView, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useGopasal } from "@gopasal/native-data";
import { useSelectedShop } from "@gopasal/native-data/seller";
import {
  Button,
  Confirm,
  ConnectionBanner,
  Skeleton,
  Text,
  Touchable,
  theme,
  useT,
} from "@gopasal/native-ui";
import { ShopChoiceCard } from "../components/ShopChoiceCard";

/**
 * Which shop is this phone working?
 *
 * The screen is reached in two moods and has to be right in both:
 *
 *  - **On launch**, when the seller runs several shops and none is chosen. The
 *    gate sends them here before anything else can be asked for, because every
 *    seller route is `/seller/shops/:shopId/…` and there is no queue to show
 *    until this is settled. Nothing is selected, and there is nowhere to go
 *    back to.
 *  - **Mid-shift**, from the shop tab, to switch counters. Something *is*
 *    selected, and saying which one is the whole point — a switcher that does
 *    not show where you are standing makes you tap one to find out.
 *
 * Choosing invalidates every shop-scoped answer in the cache, so the queue,
 * the shelf, the messages and the money on the next screen are about the shop
 * whose name is at the top of it. That is why this replaces rather than pushes:
 * the previous shop's queue must not be one back-gesture away.
 *
 * A seller with exactly one shop never sees this. `useSelectedShop` selects it
 * for them and persists the choice, and this screen waits for that to land and
 * then forwards — a list of one is a question with no answer to give.
 *
 * The failure states are loud on purpose. This runs before the rest of the app
 * works, so a blank list here is indistinguishable from a broken app unless it
 * says which one it is.
 */
export default function ShopPicker() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { shopId, shops, ready, select, error, refetch } = useSelectedShop();
  const { user, signOut } = useGopasal();

  /** The row being switched to, so only that row shows the spinner. */
  const [picking, setPicking] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const switching = shopId !== null;
  const canGoBack = router.canGoBack();

  const choose = async (nextShopId: string) => {
    if (nextShopId === shopId) {
      // Already standing at this counter. Going back is what was meant.
      if (canGoBack) router.back();
      else router.replace("/(tabs)/queue");
      return;
    }
    setFailed(null);
    setPicking(nextShopId);
    try {
      await select(nextShopId);
      router.replace("/(tabs)/queue");
    } catch {
      setPicking(null);
      setFailed(t("common.somethingWrong"));
    }
  };

  const retry = () => {
    setFailed(null);
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  };

  const doSignOut = async () => {
    setConfirmSignOut(false);
    await signOut();
    router.replace("/");
  };

  // One shop: chosen for them by the hook, which persists it so the next launch
  // does not repeat the reasoning. Wait the frame that takes, then forward —
  // never bounce back to the gate, which would send them straight here again.
  if (ready && !error && shops.length === 1) {
    return shopId ? <Redirect href="/(tabs)/queue" /> : <Waiting />;
  }

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
        {/* Only offered when there is somewhere to go back to. On launch there
            is not, and a back arrow that does nothing is worse than none. */}
        {canGoBack ? (
          <Touchable
            haptic="light"
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            style={{
              width: 38,
              height: 38,
              borderRadius: theme.radii.full,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.color.surface,
              borderWidth: 1,
              borderColor: theme.color.border,
            }}
          >
            <Ionicons name="chevron-back" size={19} color={theme.color.text} />
          </Touchable>
        ) : null}

        <View style={{ gap: theme.spacing[2] }}>
          <Text variant="title1">{switching ? t("shop.switch") : t("shop.choose.title")}</Text>
          <Text variant="footnote" color="textSecondary">
            {switching ? t("shop.switch.detail") : t("shop.choose.detail")}
          </Text>
        </View>

        {failed ? (
          <Animated.View
            entering={FadeIn.duration(140)}
            style={{
              padding: theme.spacing[3],
              borderRadius: theme.radii.md,
              backgroundColor: theme.color.dangerSoft,
            }}
          >
            <Text variant="footnote" color="danger">
              {failed}
            </Text>
          </Animated.View>
        ) : null}

        {/* The list could not be fetched. Stated, with the one button that can
            do anything about it — this screen has no cached answer to fall
            back on and a silent empty list would read as "you have no shops". */}
        {error ? (
          <Panel
            icon="cloud-offline-outline"
            title={t("shop.picker.failed.title")}
            detail={t("shop.picker.failed.detail")}
            action={{ label: t("common.retry"), loading: refreshing, onPress: retry }}
          />
        ) : !ready ? (
          <View style={{ gap: theme.spacing[3] }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} width="100%" height={86} radius={theme.radii.lg} delay={i * 80} />
            ))}
          </View>
        ) : shops.length === 0 ? (
          // A signed-in account with no shop on it. This used to be the end of
          // the road — "apply on the website" — which is a strange thing for a
          // seller app to say to somebody who has just installed it and signed
          // in. Registering is now the offer, and retrying is the smaller one
          // underneath for the seller whose shop list merely failed to load.
          <Panel
            icon="storefront-outline"
            title={t("register.noShop.title")}
            detail={t("register.noShop.detail")}
            action={{
              label: t("register.start"),
              loading: false,
              onPress: () => router.push("/register"),
            }}
            secondary={{ label: t("common.retry"), loading: refreshing, onPress: retry }}
          />
        ) : (
          <View style={{ gap: theme.spacing[3] }}>
            {shops.map((item, index) => (
              <ShopChoiceCard
                key={item.id}
                shop={item}
                index={index}
                current={item.id === shopId}
                busy={picking === item.id}
                onPress={() => void choose(item.id)}
              />
            ))}
          </View>
        )}

        {/* Staff at a second shop, or at their first one: the code a shop
            owner gave them goes in on the join screen. */}
        {ready && !error ? (
          <Button
            label={t("join.haveCode")}
            variant="secondary"
            onPress={() => router.push("/join")}
          />
        ) : null}

        {/* The way out of the wrong account. This screen can be the only one a
            seller ever reaches — no shops, or a list that will not load — so
            it cannot be the one screen with no exit. */}
        <View style={{ alignItems: "center", marginTop: theme.spacing[2] }}>
          <Button
            label={t("shop.signOut")}
            variant="ghost"
            size="sm"
            full={false}
            onPress={() => setConfirmSignOut(true)}
          />
          {user?.phone ? (
            <Text variant="caption" color="textFaint">
              {user.phone}
            </Text>
          ) : null}
        </View>
      </ScrollView>

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

/** An honest dead end: what happened, and the one thing that can be done. */
function Panel({
  icon,
  title,
  detail,
  action,
  secondary,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  action: { label: string; loading: boolean; onPress: () => void };
  /** A quieter second way out, under the main one. */
  secondary?: { label: string; loading: boolean; onPress: () => void };
}) {
  return (
    <View
      style={{
        alignItems: "center",
        gap: theme.spacing[2],
        padding: theme.spacing[5],
        borderRadius: theme.radii.lg,
        borderWidth: 1,
        borderColor: theme.color.border,
        backgroundColor: theme.color.surface,
      }}
    >
      <Ionicons name={icon} size={28} color={theme.color.textFaint} />
      <Text variant="title3" align="center">
        {title}
      </Text>
      <Text variant="footnote" color="textMuted" align="center">
        {detail}
      </Text>
      <Button
        label={action.label}
        variant={secondary ? "primary" : "secondary"}
        full={false}
        loading={action.loading}
        onPress={action.onPress}
        style={{ marginTop: theme.spacing[2] }}
      />
      {secondary ? (
        <Touchable
          haptic="light"
          onPress={secondary.onPress}
          disabled={secondary.loading}
          accessibilityRole="button"
          accessibilityLabel={secondary.label}
          style={{ padding: theme.spacing[3] }}
        >
          <Text variant="caption" color="textMuted">
            {secondary.label}
          </Text>
        </Touchable>
      ) : null}
    </View>
  );
}

/**
 * The frame while a single shop is being selected for the seller.
 *
 * A placeholder rather than a spinner: this resolves in a frame or two from
 * disk, and a spinner that appears and vanishes that fast reads as a flicker.
 */
function Waiting() {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.color.background,
        paddingTop: insets.top + theme.spacing[10],
        paddingHorizontal: theme.spacing[4],
        gap: theme.spacing[3],
      }}
    >
      <Skeleton width="52%" height={22} />
      <Skeleton width="100%" height={86} radius={theme.radii.lg} delay={60} />
      <Skeleton width="100%" height={86} radius={theme.radii.lg} delay={120} />
    </View>
  );
}
