import * as React from "react";
import { View } from "react-native";
import { Redirect } from "expo-router";
import { useGopasal } from "@gopasal/native-data";
import { useRiderProfile } from "@gopasal/native-data/rider";
import { Skeleton, theme } from "@gopasal/native-ui";

/**
 * The first screen, which is not a screen: signed in? a rider? then the jobs.
 *
 * "A rider" is the server's answer, not the app's guess — `GET /rider/me`
 * either returns a rider or says this number is not one. A shop adds its riders
 * by phone number from the seller app, so the second case is a person who
 * signed in before the shop added them, or with the wrong SIM; they get a
 * screen that says exactly that.
 */
export default function Gate() {
  const { user, ready } = useGopasal();
  const profile = useRiderProfile();

  if (!ready) return <Waiting />;
  if (!user) return <Redirect href="/auth/phone" />;
  if (profile.isPending) return <Waiting />;
  if (profile.data === null) return <Redirect href="/not-rider" />;
  return <Redirect href="/(tabs)/jobs" />;
}

function Waiting() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.color.background,
        padding: theme.spacing[4],
        gap: theme.spacing[3],
        paddingTop: theme.spacing[16],
      }}
    >
      <Skeleton width="52%" height={22} />
      <Skeleton width="100%" height={120} radius={theme.radii.lg} delay={60} />
      <Skeleton width="100%" height={96} radius={theme.radii.lg} delay={120} />
    </View>
  );
}
