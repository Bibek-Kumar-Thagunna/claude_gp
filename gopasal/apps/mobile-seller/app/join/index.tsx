import * as React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useGopasal } from "@gopasal/native-data";
import { useAcceptInvite, useMyPendingInvites } from "@gopasal/native-data/seller-team";
import { Button, Card, Skeleton, Sunken, Text, Touchable, theme, useT } from "@gopasal/native-ui";
import { JoinFrame, useAfterJoin } from "../../components/JoinFrame";
import { RegisterField } from "../../components/RegisterField";
import { roleName } from "../../lib/role-name";

/**
 * Joining a shop somebody invited you to.
 *
 * The owner's side of an invitation has been on the phone since the team
 * screens: they name a number and a role, and GoPasal texts a link and a
 * six-digit code. This is the other side, which did not exist — so an invited
 * shop assistant who installed the app, signed in with their own number, and
 * found themselves on "Sell on GoPasal" had no way in except a laptop.
 *
 * The code is the path that works everywhere, because a link opened from a
 * text message goes to whatever browser the phone prefers. The server looks the
 * code up by the signed-in number, so the only thing asked for here is the six
 * digits. Invitations already waiting for this number are listed above the box
 * — shop, role, and the owner's note — so the person knows what they are
 * accepting before they type.
 */
const CODE_LENGTH = 6;

export default function JoinScreen() {
  const t = useT();
  const router = useRouter();
  const { user } = useGopasal();
  const pending = useMyPendingInvites();
  const accept = useAcceptInvite();
  const afterJoin = useAfterJoin();
  const [code, setCode] = React.useState("");
  const [tried, setTried] = React.useState(false);

  const invites = (pending.data ?? []).filter((invite) => invite.scope === "SHOP");
  const digits = code.replace(/\D/g, "").slice(0, CODE_LENGTH);
  const complete = digits.length === CODE_LENGTH;

  const submit = () => {
    setTried(true);
    if (!complete || accept.isPending) return;
    accept.mutate(
      { code: digits, scope: "SHOP" },
      { onSuccess: (result) => void afterJoin(result) },
    );
  };

  return (
    <JoinFrame title={t("join.title")}>
      <Text variant="body" color="textSecondary">
        {t("join.intro")}
      </Text>

      {pending.isPending ? (
        <Skeleton width="100%" height={92} radius={theme.radii.lg} />
      ) : invites.length > 0 ? (
        <View style={{ gap: theme.spacing[3] }}>
          <Text variant="overline" color="textMuted">
            {invites.length === 1
              ? t("join.waiting.one")
              : t("join.waiting.many", { count: invites.length })}
          </Text>
          {invites.map((invite) => (
            <Card key={invite.id} style={{ gap: theme.spacing[2] }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: theme.radii.full,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: theme.color.brandSoft,
                  }}
                >
                  <Ionicons name="storefront-outline" size={19} color={theme.color.brand} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {invite.shop?.name ?? t("join.aShop")}
                  </Text>
                  <Text variant="caption" color="textMuted" numberOfLines={1}>
                    {t("join.asRole", { role: roleName({ name: invite.role }, t) })}
                  </Text>
                </View>
              </View>
              {invite.note ? (
                <Sunken>
                  <Text variant="footnote" color="textSecondary">
                    {invite.note}
                  </Text>
                </Sunken>
              ) : null}
              <Text variant="caption" color="textFaint">
                {t("join.until", {
                  date: new Date(invite.expiresAt).toLocaleDateString([], {
                    day: "numeric",
                    month: "short",
                  }),
                })}
              </Text>
            </Card>
          ))}
        </View>
      ) : null}

      <RegisterField
        label={t("join.code")}
        value={digits}
        onChangeText={(next) => {
          setCode(next);
          setTried(false);
          accept.reset();
        }}
        placeholder="123456"
        keyboardType="number-pad"
        autoCapitalize="none"
        maxLength={CODE_LENGTH + 2}
        hint={user?.phone ? t("join.codeHint", { phone: user.phone }) : undefined}
        problem={tried && !complete ? t("join.codeShort") : null}
      />

      {accept.error instanceof Error ? (
        <Text variant="caption" color="danger">
          {accept.error.message}
        </Text>
      ) : null}

      <Button label={t("join.submit")} size="lg" loading={accept.isPending} onPress={submit} />

      <Touchable
        haptic="light"
        onPress={() => router.push("/register")}
        accessibilityRole="button"
        accessibilityLabel={t("join.ownShop")}
        style={{ alignSelf: "center", paddingVertical: theme.spacing[3] }}
      >
        <Text variant="callout" color="brand">
          {t("join.ownShop")}
        </Text>
      </Touchable>
    </JoinFrame>
  );
}
