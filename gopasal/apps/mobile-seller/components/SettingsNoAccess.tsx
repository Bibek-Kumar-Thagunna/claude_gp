import * as React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button, Text, theme, useT } from "@gopasal/native-ui";

/**
 * What a screen shows when the whole of it is out of this person's reach.
 *
 * Calm on purpose. A teammate who opens the delivery screen without the grant
 * for it has done nothing wrong — the shop's owner decided what their role
 * covers — so this is a statement of fact and a way back, not an error. When the
 * shop itself is the reason (a suspended shop withholds keys a role would
 * otherwise carry), the API's own sentence is shown, because it says what to do
 * and a paraphrase would not.
 */
export function SettingsNoAccess({
  title,
  detail,
  restrictionReason,
}: {
  title: string;
  detail: string;
  restrictionReason?: string | null;
}) {
  const t = useT();
  const router = useRouter();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: theme.spacing[2],
        padding: theme.spacing[6],
      }}
    >
      <Ionicons name="lock-closed-outline" size={28} color={theme.color.textFaint} />
      <Text variant="title3" align="center">
        {title}
      </Text>
      <Text variant="footnote" color="textMuted" align="center">
        {detail}
      </Text>
      {restrictionReason ? (
        <Text variant="footnote" color="textSecondary" align="center">
          {restrictionReason}
        </Text>
      ) : null}
      <Button
        label={t("common.back")}
        variant="secondary"
        full={false}
        onPress={() => router.back()}
        style={{ marginTop: theme.spacing[3] }}
      />
    </View>
  );
}
