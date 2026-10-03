import * as React from "react";
import { RefreshControl, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  useGopasal,
  useGroupOrderActions,
  useMyGroupOrders,
  type GroupOrder,
} from "@gopasal/native-data";
import {
  Button,
  Card,
  ConnectionBanner,
  Skeleton,
  Sunken,
  Text,
  Touchable,
  fontFamily,
  haptic,
  palette,
  theme,
  useT,
} from "@gopasal/native-ui";

/**
 * Order together.
 *
 * Three flatmates, one delivery fee, one minimum order met between them. The
 * host starts it at a shop, everyone else joins with a six-character code and
 * adds their own items, then the host locks it and pays once.
 *
 * The code is the whole product. It has to be enormous, copyable and shareable
 * in one tap, because the way this actually gets used is somebody reading it
 * aloud in a kitchen or pasting it into a group chat.
 */

const STATUS_LABEL: Record<string, string> = {
  OPEN: "group.status.OPEN",
  LOCKED: "group.status.LOCKED",
  PLACED: "group.status.PLACED",
  CANCELLED: "group.status.CANCELLED",
};

function GroupRow({ group, index }: { group: GroupOrder; index: number }) {
  const t = useT();
  const router = useRouter();
  const { user } = useGopasal();
  const isHost = group.hostId === user?.id;

  return (
    <Card
      index={index}
      padded={false}
      onPress={() => router.push({ pathname: "/group/[id]", params: { id: group.id } })}
    >
      <View style={{ padding: theme.spacing[4], gap: theme.spacing[2] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
          <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
            {group.shop.name}
          </Text>
          {isHost && (
            <View
              style={{
                paddingHorizontal: theme.spacing[2],
                paddingVertical: 2,
                borderRadius: theme.radii.full,
                backgroundColor: theme.color.brandSoft,
              }}
            >
              <Text variant="overline" color="brand">
                {t("group.hostBadge")}
              </Text>
            </View>
          )}
        </View>
        <Text variant="caption" color="textMuted">
          {group.participants.length === 1
            ? t("group.list.meta.one", { code: group.code, count: group.participants.length })
            : t("group.list.meta.other", { code: group.code, count: group.participants.length })}
        </Text>
        <Text
          variant="caption"
          style={{
            color: group.status === "OPEN" ? theme.color.success : theme.color.textMuted,
          }}
        >
          {STATUS_LABEL[group.status] ? t(STATUS_LABEL[group.status]) : group.status}
        </Text>
      </View>
    </Card>
  );
}

export default function GroupOrdersScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useGopasal();

  const groups = useMyGroupOrders();
  const { join } = useGroupOrderActions();
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const rows = groups.data ?? [];

  const onJoin = async () => {
    setError(null);
    const trimmed = code.trim().toUpperCase();
    if (!/^GRP-[A-HJ-NP-Z2-9]{6}$/.test(trimmed)) {
      // The server's own format, checked here so a typo is caught before a
      // round trip rather than after one.
      return setError(t("group.join.badCode"));
    }
    try {
      const group = await join.mutateAsync(trimmed);
      haptic("success");
      setCode("");
      router.push({ pathname: "/group/[id]", params: { id: group.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("group.join.failed"));
    }
  };

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
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={groups.isFetching && !groups.isLoading}
            onRefresh={groups.refetch}
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
          <Text variant="title2">{t("account.group")}</Text>
        </View>

        <Card>
          <Text variant="title3">{t("group.intro.title")}</Text>
          <Text variant="footnote" color="textSecondary" style={{ marginTop: theme.spacing[2] }}>
            {t("group.intro.detail")}
          </Text>
          <Button
            label={t("group.intro.start")}
            variant="secondary"
            onPress={() => router.push("/(tabs)/home")}
            style={{ marginTop: theme.spacing[4] }}
          />
        </Card>

        {user && (
          <Card>
            <Text variant="title3">{t("group.join.title")}</Text>
            <View style={{ flexDirection: "row", gap: theme.spacing[2], marginTop: theme.spacing[3] }}>
              <View
                style={{
                  flex: 1,
                  height: 48,
                  justifyContent: "center",
                  paddingHorizontal: theme.spacing[4],
                  borderRadius: theme.radii.lg,
                  borderWidth: 1,
                  borderColor: theme.color.border,
                  backgroundColor: theme.color.surfaceSunken,
                }}
              >
                <TextInput
                  value={code}
                  onChangeText={(text) => setCode(text.toUpperCase())}
                  placeholder="GRP-XXXXXX"
                  placeholderTextColor={theme.color.textFaint}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={10}
                  accessibilityLabel={t("group.join.a11y")}
                  style={{
                    fontFamily: fontFamily.body,
                    fontSize: 16,
                    letterSpacing: 1.6,
                    color: theme.color.text,
                  }}
                />
              </View>
              <Button
                label={t("group.join.action")}
                full={false}
                loading={join.isPending}
                disabled={code.trim().length === 0}
                onPress={onJoin}
              />
            </View>

            {error ? (
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
                  {error}
                </Text>
              </Sunken>
            ) : null}
          </Card>
        )}

        {!user ? (
          <Card>
            <Text variant="title3">{t("group.signIn.title")}</Text>
            <Button
              label={t("common.continue")}
              onPress={() => router.push("/auth/phone")}
              style={{ marginTop: theme.spacing[4] }}
            />
          </Card>
        ) : (
          <View style={{ gap: theme.spacing[3] }}>
            <Text variant="overline" color="textFaint">
              {t("group.mine.heading")}
            </Text>
            {groups.isLoading ? (
              [0, 1].map((i) => (
                <Skeleton key={i} width="100%" height={84} radius={theme.radii.lg} delay={i * 90} />
              ))
            ) : rows.length === 0 ? (
              <Animated.View entering={FadeIn.duration(240)}>
                <Text variant="footnote" color="textMuted">
                  {t("group.mine.empty")}
                </Text>
              </Animated.View>
            ) : (
              rows.map((group, index) => <GroupRow key={group.id} group={group} index={index} />)
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
