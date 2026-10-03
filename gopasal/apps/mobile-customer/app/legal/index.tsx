import * as React from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { usePolicies } from "@gopasal/native-data";
import {
  Card,
  ConnectionBanner,
  Skeleton,
  Text,
  Touchable,
  theme,
  useT,
} from "@gopasal/native-ui";

/**
 * The small print, in the app.
 *
 * These used to be links to the website, which meant leaving GoPasal to read
 * the rules of GoPasal — and on a patchy connection often not reading them at
 * all. The server publishes them as versioned documents, so the app can show
 * the same text the customer agreed to, with the version they agreed to it at.
 */

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  terms: "document-text-outline",
  privacy: "lock-closed-outline",
  refund: "cash-outline",
  delivery: "bicycle-outline",
  cookies: "browsers-outline",
};

export default function LegalIndexScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const policies = usePolicies();

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
          <Text variant="title2" style={{ flex: 1 }}>
            {t("account.legal")}
          </Text>
        </View>

        {policies.isLoading ? (
          <View style={{ gap: theme.spacing[3] }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} width="100%" height={56} radius={theme.radii.lg} delay={i * 80} />
            ))}
          </View>
        ) : (
          <Card padded={false}>
            <View style={{ paddingHorizontal: theme.spacing[4] }}>
              {(policies.data ?? []).map((policy, index) => (
                <View key={policy.id}>
                  {index > 0 && <View style={{ height: 1, backgroundColor: theme.color.border }} />}
                  <Touchable
                    haptic="light"
                    onPress={() =>
                      router.push({ pathname: "/legal/[key]", params: { key: policy.key } })
                    }
                    accessibilityLabel={t("legal.read.a11y", { title: t(`legal.title.${policy.key}`, undefined, policy.title) })}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: theme.spacing[3],
                      paddingVertical: theme.spacing[4],
                    }}
                  >
                    <Ionicons
                      name={ICONS[policy.key] ?? "document-outline"}
                      size={18}
                      color={theme.color.textSecondary}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="callout" numberOfLines={1}>
                        {t(`legal.title.${policy.key}`, undefined, policy.title)}
                      </Text>
                      <Text variant="caption" color="textMuted">
                        {t("legal.version", {
                          version: policy.version,
                          date: new Date(policy.effectiveAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          }),
                        })}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.color.textFaint} />
                  </Touchable>
                </View>
              ))}
            </View>
          </Card>
        )}

        <Text variant="caption" color="textFaint" align="center">
          {t("legal.operator")}
        </Text>
      </ScrollView>
    </View>
  );
}
