import * as React from "react";
import { Linking, View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  useGopasal,
  useGroupOrderActions,
  useSavedIds,
  useToggleSavedShop,
  type Shop,
} from "@gopasal/native-data";
import {
  CategoryArt,
  Text,
  Thumb,
  Touchable,
  categoryTint,
  haptic,
  palette,
  theme,
  useT,
} from "@gopasal/native-ui";

/**
 * The top of a shop page.
 *
 * A shop is a business someone runs, so this is the part of the app where that
 * has to come across — not a heading with a list under it. The cover carries the
 * shop's own picture when it has uploaded one and its category's colours when it
 * has not, and the identity card overlaps the cover so the two read as one
 * object rather than as two stacked bands.
 *
 * The three actions are the ones a customer actually wants here: save it for
 * next time, ask the shopkeeper something, and phone them. Everything else
 * belongs further down the page.
 */

function ActionButton({
  icon,
  label,
  onPress,
  tone = "neutral",
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  tone?: "neutral" | "brand";
  accessibilityLabel?: string;
}) {
  const brand = tone === "brand";
  return (
    <Touchable
      haptic="light"
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? label}
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: theme.spacing[2],
        height: 40,
        borderRadius: theme.radii.full,
        backgroundColor: brand ? theme.color.brandSoft : theme.color.surface,
        borderWidth: 1,
        borderColor: brand ? theme.color.brandBorder : theme.color.border,
      }}
    >
      <Ionicons
        name={icon}
        size={15}
        color={brand ? theme.color.brand : theme.color.textSecondary}
      />
      <Text variant="caption" style={{ color: brand ? theme.color.brand : theme.color.textSecondary }}>
        {label}
      </Text>
    </Touchable>
  );
}

function Meta({
  icon,
  label,
  tone = "textSecondary",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone?: "success" | "textMuted" | "textSecondary";
}) {
  const color = tone === "success" ? theme.color.success : theme.color[tone];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <Ionicons name={icon} size={13} color={color} />
      <Text variant="caption" style={{ color }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function ShopHero({ shop }: { shop: Shop }) {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useGopasal();
  const saved = useSavedIds();
  const toggleSaved = useToggleSavedShop();
  const { start } = useGroupOrderActions();

  const tint = categoryTint(shop.category?.hue);
  const isSaved = (saved.data?.shopIds ?? []).includes(shop.id);
  const rated = (shop.ratingCount ?? 0) > 0;

  const onSave = () => {
    if (!user) {
      router.push("/auth/phone");
      return;
    }
    haptic(isSaved ? "light" : "success");
    toggleSaved.mutate({ shopId: shop.id, saved: isSaved });
  };

  const onMessage = () => {
    if (!user) {
      router.push("/auth/phone");
      return;
    }
    router.push({
      pathname: "/chat/[id]",
      params: { id: "new", shopId: shop.id, shopName: shop.name },
    });
  };

  const onGroup = async () => {
    if (!user) {
      router.push("/auth/phone");
      return;
    }
    try {
      const group = await start.mutateAsync(shop.id);
      haptic("success");
      router.push({ pathname: "/group/[id]", params: { id: group.id } });
    } catch {
      // Falling back to the hub rather than swallowing it: they can join an
      // existing group from there, which is the likely reason a start failed.
      router.push("/group");
    }
  };

  const onCall = () => {
    if (!shop.phone) return;
    void Linking.openURL(`tel:${shop.phone}`);
  };

  return (
    <View>
      {/* cover */}
      <View style={{ height: 168 + insets.top, marginHorizontal: -theme.spacing[4] }}>
        {shop.coverImage ? (
          <Thumb uri={shop.coverImage} size="fill" radius={0} />
        ) : (
          <LinearGradient
            colors={[tint.bg, theme.color.background]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            {/* The category drawing as a watermark, so a shop with no
                photography still gets a cover that belongs to this app rather
                than a grey rectangle. */}
            <View style={{ opacity: 0.28, transform: [{ scale: 2.4 }], marginTop: insets.top / 2 }}>
              <CategoryArt slug={shop.category?.slug} hue={shop.category?.hue} size={64} />
            </View>
          </LinearGradient>
        )}

        <View
          style={{
            position: "absolute",
            top: insets.top + theme.spacing[2],
            left: theme.spacing[4],
            right: theme.spacing[4],
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Touchable
            haptic="light"
            onPress={() => router.back()}
            accessibilityLabel={t("common.back")}
            style={{
              width: 40,
              height: 40,
              borderRadius: theme.radii.full,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.color.surface,
              ...theme.shadows.sm,
            }}
          >
            <Ionicons name="arrow-back" size={20} color={theme.color.text} />
          </Touchable>

          <Touchable
            haptic="none"
            onPress={onSave}
            accessibilityLabel={isSaved ? "Remove from saved shops" : "Save this shop"}
            style={{
              width: 40,
              height: 40,
              borderRadius: theme.radii.full,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.color.surface,
              ...theme.shadows.sm,
            }}
          >
            <Ionicons
              name={isSaved ? "heart" : "heart-outline"}
              size={20}
              color={isSaved ? theme.color.brand : theme.color.textSecondary}
            />
          </Touchable>
        </View>
      </View>

      {/* identity card, riding over the cover */}
      <Animated.View
        entering={FadeIn.duration(280)}
        style={{
          marginTop: -theme.spacing[8],
          backgroundColor: theme.color.surface,
          borderRadius: theme.radii.xl,
          borderWidth: 1,
          borderColor: theme.color.border,
          padding: theme.spacing[4],
          ...theme.shadows.sm,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
          <Thumb
            uri={shop.logoImage}
            size={56}
            tint={tint.bg}
            fallback={
              shop.category ? (
                <CategoryArt slug={shop.category.slug} hue={shop.category.hue} size={34} />
              ) : undefined
            }
            emoji={shop.emoji ?? "🏪"}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
              <Text variant="title2" numberOfLines={1} style={{ flexShrink: 1 }}>
                {shop.name}
              </Text>
              {shop.verified && (
                <Ionicons name="checkmark-circle" size={16} color={theme.color.info} />
              )}
            </View>
            {shop.nameNp ? (
              <Text variant="footnote" color="textMuted" script="np" numberOfLines={1}>
                {shop.nameNp}
              </Text>
            ) : null}
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: theme.spacing[3],
            marginTop: theme.spacing[4],
          }}
        >
          <Meta
            icon={shop.isOpen ? "time-outline" : "moon-outline"}
            label={
              shop.isOpen
                ? (shop.hours ?? t("shop.open"))
                : shop.hours
                  ? `${t("shop.closed")} · ${shop.hours}`
                  : t("shop.closed")
            }
            tone={shop.isOpen ? "success" : "textMuted"}
          />
          {rated ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="star" size={13} color={palette.marigold[500]} />
              <Text variant="caption" color="textSecondary" tabular>
                {(shop.ratingAvg ?? 0).toFixed(1)}
              </Text>
              <Text variant="caption" color="textFaint">
                ({shop.ratingCount})
              </Text>
            </View>
          ) : (
            <Text variant="caption" color="textFaint">
              {t("shop.newShop")}
            </Text>
          )}
          <Meta icon="location-outline" label={shop.area} />
          {shop.minOrder > 0 && (
            <Meta icon="basket-outline" label={t("shop.minOrder", { amount: shop.minOrder })} />
          )}
          {shop.codEnabled && <Meta icon="cash-outline" label={t("shop.cod")} />}
        </View>

        {shop.description ? (
          <Text variant="footnote" color="textSecondary" style={{ marginTop: theme.spacing[3] }}>
            {shop.description}
          </Text>
        ) : null}

        <View style={{ flexDirection: "row", gap: theme.spacing[3], marginTop: theme.spacing[4] }}>
          <ActionButton
            icon="chatbubble-ellipses-outline"
            label={t("shop.message")}
            tone="brand"
            onPress={onMessage}
          />
          {shop.phone ? (
            <ActionButton
              icon="call-outline"
              label={t("shop.call")}
              onPress={onCall}
              accessibilityLabel={`Call ${shop.name}`}
            />
          ) : null}
        </View>

        {/* Ordering together belongs here, at the shop, because that is the
            decision it depends on — a group is tied to one shop and cannot be
            started without picking it first. */}
        <View style={{ height: theme.spacing[3] }} />
        <ActionButton
          icon="people-outline"
          label={start.isPending ? t("common.working") : t("shop.groupOrder")}
          onPress={onGroup}
          accessibilityLabel={`Start a group order at ${shop.name}`}
        />
      </Animated.View>
    </View>
  );
}
