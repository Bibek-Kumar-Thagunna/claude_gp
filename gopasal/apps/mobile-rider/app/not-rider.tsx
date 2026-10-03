import * as React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useGopasal } from "@gopasal/native-data";
import { useRiderProfile } from "@gopasal/native-data/rider";
import { Button, Card, Text, palette, theme, useT } from "@gopasal/native-ui";
import { rider } from "../lib/rider-theme";

/**
 * Signed in, but this number is not a rider.
 *
 * Riders are added by a shop, by phone number, from the seller app — there is
 * no self sign-up, because a rider carries a shop's goods and its cash. So the
 * screen says who to ask and what to ask for, keeps a way to check again once
 * they have, and a way out to a different number.
 */
export default function NotRider() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useGopasal();
  const profile = useRiderProfile();

  React.useEffect(() => {
    if (profile.data) router.replace("/(tabs)/jobs");
  }, [profile.data, router]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.color.background,
        paddingTop: insets.top + theme.spacing[12],
        paddingHorizontal: theme.spacing[5],
        paddingBottom: insets.bottom + theme.spacing[6],
        gap: theme.spacing[5],
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: rider.amberSoft,
        }}
      >
        <Ionicons name="bicycle" size={30} color={palette.ink[900]} />
      </View>
      <View style={{ gap: theme.spacing[2] }}>
        <Text variant="title1">{t("notRider.title")}</Text>
        <Text variant="body" color="textSecondary">
          {t("notRider.detail", { phone: user?.phone ?? "" })}
        </Text>
      </View>
      <Card style={{ gap: theme.spacing[3] }}>
        {["notRider.step1", "notRider.step2", "notRider.step3"].map((key, i) => (
          <View key={key} style={{ flexDirection: "row", gap: theme.spacing[3] }}>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: palette.ink[900],
              }}
            >
              <Text variant="caption" style={{ color: palette.white }}>
                {String(i + 1)}
              </Text>
            </View>
            <Text variant="callout" style={{ flex: 1 }}>
              {t(key, { phone: user?.phone ?? "" })}
            </Text>
          </View>
        ))}
      </Card>
      <View style={{ flex: 1 }} />
      <Button
        label={t("notRider.check")}
        size="lg"
        loading={profile.isFetching}
        onPress={() => void profile.refetch()}
      />
      <Button
        label={t("notRider.other")}
        variant="ghost"
        onPress={() => void signOut().then(() => router.dismissTo("/auth/phone"))}
      />
    </View>
  );
}
