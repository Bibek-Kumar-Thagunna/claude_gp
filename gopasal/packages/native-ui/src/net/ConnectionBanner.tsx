import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInUp, FadeOutUp, Layout } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme/theme";
import { Text } from "../components/Text";
import { Touchable } from "../components/Pressable";
import { useNetwork, type NetStatus } from "./NetworkProvider";
import { useT } from "../i18n/i18n";

/**
 * The strip that tells the truth about the connection.
 *
 * Three decisions here matter more than how it looks:
 *
 *  - **Each state gets its own sentence.** "No internet" when the phone has no
 *    link, "GoPasal isn't responding" when the link is up but our API is not —
 *    because the second one is not the user's fault and telling them to check
 *    their wifi wastes their time. "Slow connection" is a heads-up, not an
 *    error, and is styled as one.
 *  - **It never covers content.** It pushes the screen down and animates the
 *    layout, rather than floating over the first row. A banner that hides the
 *    thing you were reading is worse than the problem it reports.
 *  - **Recovery is not automatic-only.** There is always a Retry, because a
 *    person who has just walked to the window wants to act, not wait for the
 *    next poll. It shows a spinner while probing so the tap is visibly doing
 *    something.
 *
 * It is deliberately absent when everything is fine. Persistent connection
 * chrome trains people to ignore it, and then it is ignored on the day it
 * matters.
 */

/**
 * The English here is the fallback, not the source.
 *
 * This package ships with no dictionary of its own — the app supplies one —
 * so each entry carries both the key the app will have translated and the
 * sentence to show if it has not. A banner rendered inside a storybook, a test
 * or an app that never set up `I18nProvider` still reads as English prose
 * rather than as `net.offline.title`.
 */
const COPY: Record<
  Exclude<NetStatus, "online">,
  {
    titleKey: string;
    title: string;
    detailKey: string;
    detail: string;
    icon: keyof typeof Ionicons.glyphMap;
    tone: "danger" | "warning";
  }
> = {
  offline: {
    titleKey: "net.offline.title",
    title: "No internet",
    detailKey: "net.offline.detail",
    detail: "You can still browse what's already loaded.",
    icon: "cloud-offline-outline",
    tone: "danger",
  },
  unreachable: {
    titleKey: "net.unreachable.title",
    title: "GoPasal isn't responding",
    detailKey: "net.unreachable.detail",
    detail: "Your connection looks fine — we're retrying.",
    icon: "alert-circle-outline",
    tone: "danger",
  },
  slow: {
    titleKey: "net.slow.title",
    title: "Slow connection",
    detailKey: "net.slow.detail",
    detail: "Things may take a little longer than usual.",
    icon: "cellular-outline",
    tone: "warning",
  },
};

export function ConnectionBanner({ topInset = true }: { topInset?: boolean }) {
  const t = useT();
  const net = useNetwork();
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = React.useState(false);

  if (net.status === "online") return null;
  const copy = COPY[net.status];
  const soft = copy.tone === "danger" ? theme.color.dangerSoft : theme.color.warningSoft;
  const ink = copy.tone === "danger" ? theme.color.danger : theme.palette.marigold[600];

  return (
    <Animated.View
      entering={FadeInUp.duration(220)}
      exiting={FadeOutUp.duration(160)}
      layout={Layout.duration(220)}
      accessibilityLiveRegion="polite"
      style={{
        backgroundColor: soft,
        paddingTop: topInset ? insets.top + theme.spacing[2] : theme.spacing[2],
        paddingBottom: theme.spacing[3],
        paddingHorizontal: theme.spacing[4],
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[3],
      }}
    >
      <Ionicons name={copy.icon} size={20} color={ink} />
      <View style={{ flex: 1 }}>
        <Text variant="footnote" style={{ color: ink, fontWeight: "700" }}>
          {t(copy.titleKey, undefined, copy.title)}
        </Text>
        <Text variant="caption" color="textSecondary" style={{ marginTop: 1 }}>
          {t(copy.detailKey, undefined, copy.detail)}
        </Text>
      </View>
      <Touchable
        haptic="selection"
        scaleTo={0.94}
        accessibilityLabel={t("net.a11y.retry", undefined, "Retry connection")}
        onPress={async () => {
          setChecking(true);
          try {
            await net.recheck();
          } finally {
            setChecking(false);
          }
        }}
        style={{
          minWidth: 64,
          height: 32,
          borderRadius: theme.radii.full,
          backgroundColor: theme.color.surface,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: theme.spacing[3],
        }}
      >
        {checking ? (
          <ActivityIndicator size="small" color={ink} />
        ) : (
          <Text variant="caption" style={{ color: ink }}>
            {t("net.retry", undefined, "Retry")}
          </Text>
        )}
      </Touchable>
    </Animated.View>
  );
}
