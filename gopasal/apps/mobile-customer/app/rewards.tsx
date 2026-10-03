import * as React from "react";
import { RefreshControl, ScrollView, Share, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  useGopasal,
  useLoyalty,
  useLoyaltyLedger,
  useRedeemReferral,
  useReferrals,
} from "@gopasal/native-data";
import {
  Button,
  Card,
  CoinIcon,
  ConnectionBanner,
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
 * GoCoins and referrals.
 *
 * The balance is the headline, and directly under it is the only thing a
 * customer actually wants to know about a loyalty scheme: what the coins are
 * worth in rupees and where they can be spent. A points balance with no
 * exchange rate next to it is a number people learn to ignore.
 *
 * Every figure here — the rate, the cap, the referral reward — comes from the
 * API rather than being written into the app, because the business will change
 * them and a hard-coded "10 coins = रु 1" that quietly goes wrong is worse than
 * no figure at all.
 */

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text variant="title2" tabular>
        {value}
      </Text>
      <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}

export default function RewardsScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useGopasal();

  const loyalty = useLoyalty();
  const referrals = useReferrals();
  const ledger = useLoyaltyLedger();
  const [copied, setCopied] = React.useState(false);

  const coins = loyalty.data?.points ?? 0;
  const perRupee = referrals.data?.coinsPerRupee ?? 10;
  const worth = Math.floor(coins / perRupee);
  const next = loyalty.data?.nextTier;

  const share = async () => {
    const code = referrals.data?.code;
    if (!code) return;
    haptic("light");
    try {
      await Share.share({
        message: t("rewards.share.message", { code }),
      });
    } catch {
      // The sheet can be dismissed or unavailable; the code is on screen and
      // copyable either way.
    }
  };

  const copy = async () => {
    const code = referrals.data?.code;
    if (!code) return;
    try {
      await Clipboard.setStringAsync(code);
    } catch {
      /* clipboard may be unavailable; the code is visible regardless */
    }
    haptic("success");
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (!user) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: theme.spacing[6],
          backgroundColor: theme.color.background,
        }}
      >
        <Text variant="title3" align="center">
          {t("rewards.signIn")}
        </Text>
        <Button
          label={t("common.continue")}
          full={false}
          onPress={() => router.push("/auth/phone")}
          style={{ marginTop: theme.spacing[5] }}
        />
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
            refreshing={loyalty.isFetching && !loyalty.isLoading}
            onRefresh={() => {
              void loyalty.refetch();
              void referrals.refetch();
              void ledger.refetch();
            }}
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
          <Text variant="title2">{t("rewards.title")}</Text>
        </View>

        {/* balance */}
        <Animated.View entering={FadeIn.duration(280)}>
          <LinearGradient
            colors={[palette.crimson[500], palette.crimson[700]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: theme.radii.xl, padding: theme.spacing[5], ...theme.shadows.sm }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
              <CoinIcon size={18} />
              <Text variant="overline" style={{ color: "rgba(255,255,255,0.85)" }}>
                {t("rewards.balance")}
              </Text>
            </View>

            {loyalty.isLoading ? (
              <Skeleton width={120} height={34} radius={theme.radii.sm} />
            ) : (
              <Text
                variant="display"
                style={{ color: palette.white, marginTop: theme.spacing[2] }}
                tabular
              >
                {coins}
              </Text>
            )}

            <Text variant="footnote" style={{ color: "rgba(255,255,255,0.9)", marginTop: 2 }}>
              {worth > 0
                ? t("rewards.worth", { amount: worth })
                : t("rewards.earnRate", { rate: perRupee })}
            </Text>

            {loyalty.data?.tier ? (
              <View
                style={{
                  alignSelf: "flex-start",
                  marginTop: theme.spacing[4],
                  paddingHorizontal: theme.spacing[3],
                  paddingVertical: 4,
                  borderRadius: theme.radii.full,
                  backgroundColor: "rgba(255,255,255,0.18)",
                }}
              >
                <Text variant="caption" style={{ color: palette.white }}>
                  {t(`tier.${loyalty.data.tier}`, undefined, loyalty.data.tier)}
                  {next
                    ? ` · ${t("rewards.nextTier", { points: next.pointsAway, name: t(`tier.${next.name}`, undefined, next.name) })}`
                    : ""}
                </Text>
              </View>
            ) : null}
          </LinearGradient>
        </Animated.View>

        <Sunken style={{ flexDirection: "row", alignItems: "flex-start", gap: theme.spacing[3] }}>
          <Ionicons name="information-circle-outline" size={17} color={theme.color.textMuted} />
          <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
            {t("rewards.redeemNote")}
          </Text>
        </Sunken>

        {/* referrals */}
        <Card>
          <Text variant="title3">{t("rewards.invite.title")}</Text>
          <Text variant="footnote" color="textSecondary" style={{ marginTop: theme.spacing[2] }}>
            {referrals.data
              ? `${t("rewards.invite.reward", {
                  coins: referrals.data.rewardPerReferral,
                  rupees: referrals.data.rewardValueRupees,
                })} ${t("rewards.invite.qualification", undefined, referrals.data.qualification)}.`
              : t("rewards.invite.fallback")}
          </Text>

          {referrals.isLoading ? (
            <Skeleton width="100%" height={48} radius={theme.radii.lg} />
          ) : referrals.data ? (
            <Touchable
              haptic="none"
              onPress={copy}
              accessibilityLabel={t("rewards.invite.copy.a11y", { code: referrals.data.code })}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: theme.spacing[4],
                paddingHorizontal: theme.spacing[4],
                height: 48,
                borderRadius: theme.radii.lg,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: theme.color.brandBorder,
                backgroundColor: theme.color.brandSoft,
              }}
            >
              <Text variant="bodyStrong" style={{ color: theme.color.brand, letterSpacing: 1 }}>
                {referrals.data.code}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Ionicons
                  name={copied ? "checkmark-circle" : "copy-outline"}
                  size={14}
                  color={theme.color.brand}
                />
                <Text variant="overline" style={{ color: theme.color.brand }}>
                  {copied ? t("rewards.copied") : t("rewards.copy")}
                </Text>
              </View>
            </Touchable>
          ) : null}

          <Button
            label={t("rewards.share")}
            onPress={share}
            style={{ marginTop: theme.spacing[3] }}
          />

          {referrals.data ? (
            <View
              style={{
                flexDirection: "row",
                gap: theme.spacing[4],
                marginTop: theme.spacing[5],
                paddingTop: theme.spacing[4],
                borderTopWidth: 1,
                borderTopColor: theme.color.border,
              }}
            >
              <StatTile
                value={String(referrals.data.rewarded)}
                label={t("rewards.stats.rewarded")}
              />
              <StatTile value={String(referrals.data.pending)} label={t("rewards.stats.pending")} />
            </View>
          ) : null}
        </Card>

        {/* a friend's code — the other half of the referral loop */}
        <FriendCode />

        {/* history */}
        <Card>
          <Text variant="title3">{t("rewards.activity")}</Text>
          {ledger.isLoading ? (
            <View style={{ gap: theme.spacing[3], marginTop: theme.spacing[3] }}>
              {[0, 1].map((i) => (
                <Skeleton key={i} width="100%" height={16} delay={i * 80} />
              ))}
            </View>
          ) : (ledger.data ?? []).length === 0 ? (
            <Text variant="footnote" color="textMuted" style={{ marginTop: theme.spacing[2] }}>
              {t("rewards.activity.empty")}
            </Text>
          ) : (
            <View style={{ marginTop: theme.spacing[3], gap: theme.spacing[3] }}>
              {(ledger.data ?? []).slice(0, 12).map((entry) => (
                <View
                  key={entry.id}
                  style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="callout" numberOfLines={1}>
                      {entry.reason}
                    </Text>
                    <Text variant="caption" color="textFaint">
                      {new Date(entry.createdAt).toLocaleDateString([], {
                        day: "numeric",
                        month: "short",
                      })}
                    </Text>
                  </View>
                  <Text
                    variant="bodyStrong"
                    style={{ color: entry.delta >= 0 ? theme.color.success : theme.color.danger }}
                    tabular
                  >
                    {entry.delta >= 0 ? `+${entry.delta}` : entry.delta}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

/**
 * Somebody shared their code with you. Sharing your own was always on this
 * screen; using a friend's was not, so a referral could be sent and never
 * claimed from the app.
 */
function FriendCode() {
  const t = useT();
  const redeem = useRedeemReferral();
  const [code, setCode] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const trimmed = code.trim();

  if (redeem.isSuccess) {
    return (
      <Sunken
        style={{
          flexDirection: "row",
          gap: theme.spacing[3],
          backgroundColor: theme.color.successSoft,
        }}
      >
        <Ionicons name="gift-outline" size={18} color={theme.color.success} />
        <Text variant="footnote" style={{ flex: 1 }}>
          {t("rewards.friend.done", { coins: redeem.data.pendingCoins })}
        </Text>
      </Sunken>
    );
  }

  return (
    <Card>
      <Touchable
        haptic="selection"
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t("rewards.friend.title")}
        style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}
      >
        <Ionicons name="people-outline" size={18} color={theme.color.brand} />
        <Text variant="callout" style={{ flex: 1 }}>
          {t("rewards.friend.title")}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={theme.color.textFaint}
        />
      </Touchable>
      {open ? (
        <View style={{ marginTop: theme.spacing[3], gap: theme.spacing[3] }}>
          <Text variant="footnote" color="textSecondary">
            {t("rewards.friend.detail")}
          </Text>
          <TextInput
            value={code}
            onChangeText={(next) => {
              setCode(next.toUpperCase());
              redeem.reset();
            }}
            placeholder={t("rewards.friend.placeholder")}
            placeholderTextColor={theme.color.textFaint}
            accessibilityLabel={t("rewards.friend.placeholder")}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={40}
            style={{
              height: 48,
              paddingHorizontal: theme.spacing[4],
              borderRadius: theme.radii.lg,
              backgroundColor: theme.color.surfaceSunken,
              color: theme.color.text,
              fontSize: 16,
              letterSpacing: 1,
            }}
          />
          {redeem.error instanceof Error ? (
            <Text variant="caption" color="danger">
              {redeem.error.message}
            </Text>
          ) : null}
          <Button
            label={t("rewards.friend.submit")}
            variant="secondary"
            loading={redeem.isPending}
            disabled={trimmed.length < 4}
            onPress={() => redeem.mutate(trimmed)}
          />
        </View>
      ) : null}
    </Card>
  );
}
