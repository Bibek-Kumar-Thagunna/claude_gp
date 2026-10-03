import * as React from "react";
import { Linking, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import {
  useGopasal,
  useLoyalty,
  useNotifications,
  useUnreadConversations,
} from "@gopasal/native-data";
import {
  Button,
  Card,
  CoinIcon,
  Confirm,
  useI18n,
  ConnectionBanner,
  Text,
  Touchable,
  palette,
  theme,
} from "@gopasal/native-ui";

/**
 * Account.
 *
 * A hub, not a settings screen. Everything the customer owns — their addresses,
 * their saved shops, their coins, their conversations — is reachable from here
 * in one tap, because the tab bar only has room for five things and this is
 * where the rest live.
 *
 * The destructive items sit at the bottom behind their own confirmations.
 * Account deletion lives one tap further in, on its own screen, where the
 * second factor, the typed confirmation and the retention notice have room to
 * be read rather than dismissed.
 */

function Row({
  icon,
  label,
  detail,
  badge,
  onPress,
  tone = "text",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string | null;
  badge?: number;
  onPress: () => void;
  tone?: "text" | "danger";
}) {
  const color = tone === "danger" ? theme.color.danger : theme.color.text;
  return (
    <Touchable
      haptic="light"
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[3],
        paddingVertical: theme.spacing[4],
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: theme.radii.md,
          backgroundColor: tone === "danger" ? theme.color.dangerSoft : theme.color.surfaceSunken,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={17} color={tone === "danger" ? theme.color.danger : theme.color.textSecondary} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="callout" style={{ color }}>
          {label}
        </Text>
        {detail ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>

      {badge != null && badge > 0 && (
        <View
          style={{
            minWidth: 20,
            height: 20,
            paddingHorizontal: 6,
            borderRadius: theme.radii.full,
            backgroundColor: theme.color.brand,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text variant="overline" style={{ color: palette.white, letterSpacing: 0 }} tabular>
            {badge > 9 ? "9+" : badge}
          </Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={theme.color.textFaint} />
    </Touchable>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: theme.color.border }} />;
}

export default function AccountTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, session } = useGopasal();
  const { t, language, setLanguage, languages } = useI18n();

  const loyalty = useLoyalty();
  const notifications = useNotifications();
  const unreadChats = useUnreadConversations();
  const unreadNotifications = (notifications.data ?? []).filter((n) => !n.readAt).length;

  // Our own dialog rather than Alert.alert: that one does nothing at all on
  // web, so this confirmation used to be a no-op in a browser.
  const [confirmSignOut, setConfirmSignOut] = React.useState(false);
  const signOut = async () => {
    setConfirmSignOut(false);
    await session.clear();
    router.replace("/");
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
          <Ionicons name="person-outline" size={28} color={theme.color.brand} />
        </View>
        <Text variant="title3" style={{ marginTop: theme.spacing[4] }}>
          {t("account.signIn.title")}
        </Text>
        <Text
          variant="footnote"
          color="textMuted"
          align="center"
          style={{ marginTop: theme.spacing[2], maxWidth: 260 }}
        >
          {t("account.signIn.detail")}
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
          paddingTop: insets.top + theme.spacing[3],
          paddingHorizontal: theme.spacing[4],
          paddingBottom: theme.spacing[10],
          gap: theme.spacing[4],
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="title1">{t("account.title")}</Text>

        {/* who */}
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[4] }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: theme.radii.full,
                backgroundColor: theme.color.brandSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* An initial when there is a name, a person otherwise — a "?"
                  where your own initial should be reads as an error, and a new
                  account has no name until they set one. */}
              {user.name?.trim() ? (
                <Text variant="title2" style={{ color: theme.color.brand }}>
                  {user.name.trim().slice(0, 1).toUpperCase()}
                </Text>
              ) : (
                <Ionicons name="person" size={24} color={theme.color.brand} />
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="title3" numberOfLines={1}>
                {user.name?.trim() || t("account.addName")}
              </Text>
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {user.phone}
              </Text>
            </View>
            <Touchable
              haptic="light"
              onPress={() => router.push("/profile")}
              accessibilityLabel={t("account.a11y.editProfile")}
              style={{ padding: theme.spacing[2] }}
            >
              <Text variant="caption" color="brand">
                {t("account.edit")}
              </Text>
            </Touchable>
          </View>

          <Touchable
            haptic="selection"
            onPress={() => router.push("/rewards")}
            accessibilityLabel={t("account.a11y.rewards")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.spacing[3],
              marginTop: theme.spacing[4],
              padding: theme.spacing[3],
              borderRadius: theme.radii.lg,
              backgroundColor: theme.color.brandSoft,
            }}
          >
            <CoinIcon size={20} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="callout" style={{ color: theme.color.brand }} tabular>
                {t("home.coins", { count: loyalty.data?.points ?? 0 })}
              </Text>
              <Text variant="caption" color="textMuted">
                {loyalty.data?.tier
                  ? `${t(`tier.${loyalty.data.tier}`, undefined, loyalty.data.tier)} · ${t("account.coins.spend")}`
                  : t("account.coins.spend")}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.color.brand} />
          </Touchable>
        </Card>

        {/* what's mine */}
        <Card padded={false}>
          <View style={{ paddingHorizontal: theme.spacing[4] }}>
            <Row
              icon="location-outline"
              label={t("account.addresses")}
              detail={t("account.addresses.detail")}
              onPress={() => router.push("/address")}
            />
            <Divider />
            <Row
              icon="heart-outline"
              label={t("account.saved")}
              detail={t("account.saved.detail")}
              onPress={() => router.push("/saved")}
            />
            <Divider />
            <Row
              icon="chatbubble-outline"
              label={t("account.messages")}
              detail={t("account.messages.detail")}
              badge={unreadChats}
              onPress={() => router.push("/(tabs)/messages")}
            />
            <Divider />
            <Row
              icon="notifications-outline"
              label={t("account.notifications")}
              badge={unreadNotifications}
              onPress={() => router.push("/notifications")}
            />
            <Divider />
            <Row
              icon="people-outline"
              label={t("account.group")}
              detail={t("account.group.detail")}
              onPress={() => router.push("/group")}
            />
          </View>
        </Card>

        {/* language — high up, because someone who needs it cannot read the
            rows below it */}
        <Card>
          <Text variant="title3">{t("language.title")}</Text>
          <View style={{ flexDirection: "row", gap: theme.spacing[2], marginTop: theme.spacing[3] }}>
            {languages.map((option) => {
              const on = option.code === language;
              return (
                <Touchable
                  key={option.code}
                  haptic="selection"
                  onPress={() => setLanguage(option.code)}
                  accessibilityLabel={`Use ${option.english}`}
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
                    style={{ color: on ? theme.color.brand : theme.color.text }}
                  >
                    {option.label}
                  </Text>
                </Touchable>
              );
            })}
          </View>
        </Card>

        {/* help and the small print */}
        <Card padded={false}>
          <View style={{ paddingHorizontal: theme.spacing[4] }}>
            <Row
              icon="help-circle-outline"
              label={t("account.help")}
              detail={t("account.help.detail")}
              onPress={() => router.push("/support")}
            />
            <Divider />
            <Row
              icon="document-text-outline"
              label={t("account.legal")}
              detail={t("account.legal.detail")}
              onPress={() => router.push("/legal")}
            />
            <Divider />
            <Row
              icon="star-outline"
              label={t("account.reviews")}
              detail={t("account.reviews.detail")}
              onPress={() => router.push("/reviews")}
            />
            <Divider />
            <Row
              icon="storefront-outline"
              label={t("account.sell")}
              detail={t("account.sell.detail")}
              onPress={() => Linking.openURL("https://seller.gopasal.com")}
            />
          </View>
        </Card>

        <Card padded={false}>
          <View style={{ paddingHorizontal: theme.spacing[4] }}>
            <Row
              icon="shield-outline"
              label={t("account.data")}
              detail={t("account.data.detail")}
              onPress={() => router.push("/privacy")}
            />
            <Divider />
            <Row icon="log-out-outline" label={t("account.signOut")} tone="danger" onPress={signOut} />
          </View>
        </Card>

        <Text variant="caption" color="textFaint" align="center">
          GoPasal {Constants.expoConfig?.version ?? ""} · Velayon Dynamics Pvt. Ltd.
        </Text>
      </ScrollView>

      <Confirm
        visible={confirmSignOut}
        title={t("account.signOut.confirm")}
        message={t("account.signOut.detail")}
        confirmLabel={t("account.signOut")}
        cancelLabel={t("account.stay")}
        destructive
        onConfirm={signOut}
        onCancel={() => setConfirmSignOut(false)}
      />
    </View>
  );
}
