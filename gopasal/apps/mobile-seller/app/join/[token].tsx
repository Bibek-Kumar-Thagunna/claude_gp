import * as React from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useGopasal } from "@gopasal/native-data";
import { useAcceptInvite, useInvitePreview } from "@gopasal/native-data/seller-team";
import { Button, Card, Skeleton, Sunken, Text, theme, useT } from "@gopasal/native-ui";
import { JoinFrame, useAfterJoin } from "../../components/JoinFrame";
import { rememberJoin } from "../../lib/pending-join";
import { roleDescription, roleName } from "../../lib/role-name";

/**
 * The invite link, opened on the phone.
 *
 * The preview is public and masked, so it is shown before anything else — who
 * is inviting, to which shop, as what, and the last digits of the number it was
 * sent to. Accepting needs a session on *that* number; somebody not signed in is
 * sent through sign-in with the token held in memory, and brought back here.
 *
 * Only a pending, shop-scoped invitation gets a button. A revoked, expired or
 * already-used one previews perfectly well and would then fail on accept, so it
 * is told what happened instead; a platform (admin) invitation belongs to the
 * admin console and is pointed there.
 */
export default function JoinByLink() {
  const t = useT();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { user } = useGopasal();
  const preview = useInvitePreview(token);
  const accept = useAcceptInvite();
  const afterJoin = useAfterJoin();
  const invite = preview.data;

  const signIn = () => {
    if (token) rememberJoin(token);
    router.push("/auth/phone");
  };

  const status = invite?.status;
  const usable = invite && status === "PENDING" && invite.scope === "SHOP";

  return (
    <JoinFrame title={t("join.title")}>
      {preview.isPending ? (
        <Skeleton width="100%" height={160} radius={theme.radii.lg} />
      ) : !invite ? (
        <Sunken style={{ gap: theme.spacing[2] }}>
          <Text variant="bodyStrong">{t("join.link.bad")}</Text>
          <Text variant="footnote" color="textSecondary">
            {t("join.link.badDetail")}
          </Text>
        </Sunken>
      ) : (
        <>
          <Card style={{ gap: theme.spacing[3] }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: theme.radii.full,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.color.brandSoft,
                }}
              >
                <Ionicons name="storefront-outline" size={21} color={theme.color.brand} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="title3" numberOfLines={2}>
                  {invite.shop?.name ?? t("join.aShop")}
                </Text>
                <Text variant="caption" color="textMuted">
                  {t("join.asRole", { role: roleName(invite.role, t) })}
                </Text>
              </View>
            </View>
            {roleDescription(invite.role, t) ? (
              <Text variant="footnote" color="textSecondary">
                {roleDescription(invite.role, t)}
              </Text>
            ) : null}
            {invite.invitedBy ? (
              <Text variant="caption" color="textMuted">
                {t("join.link.from", { name: invite.invitedBy })}
              </Text>
            ) : null}
            {invite.note ? (
              <Sunken>
                <Text variant="footnote" color="textSecondary">
                  {invite.note}
                </Text>
              </Sunken>
            ) : null}
            <Text variant="caption" color="textFaint">
              {t("join.link.sentTo", { phone: invite.phoneMasked })}
            </Text>
          </Card>

          {usable ? (
            user ? (
              <>
                {accept.error instanceof Error ? (
                  <Text variant="caption" color="danger">
                    {accept.error.message}
                  </Text>
                ) : null}
                <Button
                  label={t("join.link.accept")}
                  size="lg"
                  loading={accept.isPending}
                  onPress={() =>
                    accept.mutate({ token }, { onSuccess: (result) => void afterJoin(result) })
                  }
                />
                <Text variant="caption" color="textFaint" align="center">
                  {t("join.link.signedInAs", { phone: user.phone })}
                </Text>
              </>
            ) : (
              <>
                <Button label={t("join.link.signIn")} size="lg" onPress={signIn} />
                <Text variant="caption" color="textFaint" align="center">
                  {t("join.link.signInHint", { phone: invite.phoneMasked })}
                </Text>
              </>
            )
          ) : (
            <Sunken style={{ gap: theme.spacing[1] }}>
              <Text variant="bodyStrong">
                {invite.scope !== "SHOP"
                  ? t("join.link.platform")
                  : status === "ACCEPTED"
                    ? t("join.link.used")
                    : status === "REVOKED"
                      ? t("join.link.revoked")
                      : t("join.link.expired")}
              </Text>
              <Text variant="footnote" color="textSecondary">
                {invite.scope !== "SHOP" ? t("join.link.platformDetail") : t("join.link.askAgain")}
              </Text>
            </Sunken>
          )}
        </>
      )}
    </JoinFrame>
  );
}
