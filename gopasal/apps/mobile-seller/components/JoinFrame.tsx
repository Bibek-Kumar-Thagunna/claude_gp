import * as React from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useSelectedShop } from "@gopasal/native-data/seller";
import type { InviteAccepted } from "@gopasal/native-data/seller-team";
import { ConnectionBanner, Text, Touchable, theme, useT } from "@gopasal/native-ui";

/** The frame both join screens share: a back arrow, a title, and room. */
export function JoinFrame({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
      <View
        style={{
          paddingTop: insets.top + theme.spacing[2],
          paddingBottom: theme.spacing[3],
          paddingHorizontal: theme.spacing[4],
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
        }}
      >
        <Touchable
          haptic="light"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          accessibilityLabel={t("common.back")}
          style={{
            width: 40,
            height: 40,
            borderRadius: theme.radii.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.color.surface,
            borderWidth: 1,
            borderColor: theme.color.border,
          }}
        >
          <Ionicons name="chevron-back" size={20} color={theme.color.text} />
        </Touchable>
        <Text variant="title3" style={{ flex: 1 }} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: theme.spacing[4],
          paddingBottom: insets.bottom + theme.spacing[10],
          gap: theme.spacing[4],
        }}
      >
        {children}
      </ScrollView>
    </View>
  );
}

/**
 * After an accepted invite: make the new shop the current one, then go through
 * the gate. Selecting first matters for somebody who already works at another
 * shop — without it they would join, and land back on the counter they came
 * from.
 */
export function useAfterJoin() {
  const router = useRouter();
  const { select, refetch } = useSelectedShop();
  return React.useCallback(
    async (result: InviteAccepted) => {
      // The shop list first: selecting a shop the cached list does not contain
      // yet is undone by the store's own "is this still one of yours" check.
      await refetch();
      if (result.shopId) await select(result.shopId);
      router.replace("/");
    },
    [router, select, refetch],
  );
}
