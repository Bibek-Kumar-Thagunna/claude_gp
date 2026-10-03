import * as React from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { usePolicy } from "@gopasal/native-data";
import { ConnectionBanner, Skeleton, Text, Touchable, theme, useT } from "@gopasal/native-ui";

/**
 * One policy document.
 *
 * The server stores these as plain text with blank lines between paragraphs and
 * the occasional heading line, so that is what is rendered: paragraphs, at a
 * readable measure, with the version and effective date at the top where a
 * reader can see which text they are looking at.
 */

function Paragraph({ text }: { text: string }) {
  const trimmed = text.trim();
  // A short line with no full stop is a heading in this corpus. Treating it as
  // one is a guess, but an unformatted wall of text is a worse one.
  const heading = trimmed.length < 60 && !trimmed.endsWith(".") && !trimmed.startsWith("-");
  if (heading) {
    return (
      <Text variant="title3" style={{ marginTop: theme.spacing[5] }}>
        {trimmed}
      </Text>
    );
  }
  return (
    <Text variant="body" color="textSecondary" style={{ marginTop: theme.spacing[3] }}>
      {trimmed}
    </Text>
  );
}

export default function PolicyScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { key } = useLocalSearchParams<{ key: string }>();
  const policy = usePolicy(String(key ?? ""));

  const paragraphs = (policy.data?.content ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing[2],
          paddingHorizontal: theme.spacing[4],
          paddingBottom: theme.spacing[10],
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
          <Text variant="callout" color="textMuted" style={{ flex: 1 }} numberOfLines={1}>
            {policy.data?.title ?? t("legal.fallbackTitle")}
          </Text>
        </View>

        {policy.isLoading ? (
          <View style={{ gap: theme.spacing[3], marginTop: theme.spacing[4] }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} width={i % 3 === 2 ? "70%" : "100%"} height={14} delay={i * 60} />
            ))}
          </View>
        ) : policy.isError ? (
          <Text variant="body" color="textMuted" style={{ marginTop: theme.spacing[6] }}>
            {t("legal.error")}
          </Text>
        ) : (
          <View style={{ marginTop: theme.spacing[4] }}>
            <Text variant="title1">
              {policy.data ? t(`legal.title.${policy.data.key ?? key}`, undefined, policy.data.title) : null}
            </Text>
            <Text variant="caption" color="textMuted" style={{ marginTop: theme.spacing[1] }}>
              {t("legal.version", {
                version: policy.data?.version ?? "",
                date: policy.data
                  ? new Date(policy.data.effectiveAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })
                  : "",
              })}
            </Text>

            {paragraphs.map((text, i) => (
              <Paragraph key={i} text={text} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
