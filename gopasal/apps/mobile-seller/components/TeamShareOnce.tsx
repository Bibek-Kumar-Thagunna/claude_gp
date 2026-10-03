import * as React from "react";
import { Share, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { inviteDelivery, type InviteIssued } from "@gopasal/native-data/seller-team";
import { Button, Card, Sunken, Text, haptic, theme, useT } from "@gopasal/native-ui";
import { shortDate } from "./TeamFrame";
import { roleName } from "../lib/role-name";

/**
 * An invitation's link and code, the one time they exist.
 *
 * The server stores only hashes, so this card is the whole life of the
 * plaintext. It is built for the situation it is actually used in: the owner is
 * standing next to the new teammate. So the **code is the biggest thing on the
 * card** — it gets read out loud across a counter — and the share button hands
 * the link and the code to whatever the two of them already use to message each
 * other.
 *
 * Copying goes through the share sheet too, which offers Copy on both
 * platforms; there is no clipboard module in this app. The code and the link
 * are also selectable, so a long-press copies either on its own.
 *
 * **Whether the text message went is read from `delivery`, never assumed from
 * the 201.** The API creates the invitation whether or not the SMS landed. A
 * failure here is not a dead end — the owner is next to the person — so it is
 * said plainly, next to the button that fixes it.
 */
export function TeamShareOnce({
  issued,
  shopName,
  onDone,
  doneLabel,
}: {
  issued: InviteIssued;
  shopName: string;
  onDone: () => void;
  doneLabel: string;
}) {
  const t = useT();
  const { invite, shareOnce } = issued;
  const delivery = inviteDelivery(invite);
  const who = invite.name?.trim() || invite.phone;
  const until = shortDate(shareOnce.expiresAt);

  const [shareFailed, setShareFailed] = React.useState(false);

  // Spaced in threes so it can be read out and typed back without losing
  // place. The spaces are for the eye only; the message carries the raw code.
  const spokenCode = shareOnce.code.replace(/(.{3})(?=.)/g, "$1 ");

  const share = async () => {
    setShareFailed(false);
    try {
      await Share.share({
        message: t("team.share.message", {
          shop: shopName,
          role: roleName(invite.role, t),
          link: shareOnce.link,
          code: shareOnce.code,
          date: until,
        }),
      });
    } catch {
      // No share sheet — a browser without the Web Share API. The code is
      // still on screen and selectable, which is the thing that matters.
      setShareFailed(true);
    }
  };

  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <Card style={{ gap: theme.spacing[4] }}>
        <View style={{ flexDirection: "row", gap: theme.spacing[3], alignItems: "center" }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: theme.radii.md,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.color.successSoft,
            }}
          >
            <Ionicons name="checkmark" size={18} color={theme.color.success} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="title3">{t("team.share.title", { who })}</Text>
            <Text variant="caption" color="textMuted">
              {t("team.share.as", { role: roleName(invite.role, t) })}
            </Text>
          </View>
        </View>

        <Delivery state={delivery.state} detail={delivery.detail} phone={invite.phone} />

        <Sunken
          style={{ alignItems: "center", gap: theme.spacing[1], paddingVertical: theme.spacing[4] }}
        >
          <Text variant="overline" color="textMuted">
            {t("team.share.codeLabel")}
          </Text>
          <Text
            variant="display"
            tabular
            selectable
            accessibilityLabel={t("team.share.a11yCode", {
              code: shareOnce.code.split("").join(" "),
            })}
          >
            {spokenCode}
          </Text>
          <Text variant="caption" color="textSecondary" align="center">
            {t("team.share.codeHow", { phone: invite.phone })}
          </Text>
        </Sunken>

        <View style={{ gap: theme.spacing[1] }}>
          <Text variant="caption" color="textMuted">
            {t("team.share.linkLabel")}
          </Text>
          <Text variant="footnote" color="textSecondary" selectable numberOfLines={3}>
            {shareOnce.link}
          </Text>
        </View>

        <Button
          label={t("team.share.button")}
          leading={<Ionicons name="share-outline" size={18} color={theme.color.onBrand} />}
          onPress={() => {
            haptic("light");
            void share();
          }}
        />
        {shareFailed ? (
          <Text variant="caption" color="textMuted" align="center">
            {t("team.share.unavailable")}
          </Text>
        ) : null}

        {/* Said before Done rather than after it: this is the last moment it
            can change what somebody does. */}
        <View style={{ flexDirection: "row", gap: theme.spacing[2], alignItems: "flex-start" }}>
          <Ionicons
            name="eye-outline"
            size={14}
            color={theme.palette.marigold[600]}
            style={{ marginTop: 1 }}
          />
          <Text variant="caption" style={{ flex: 1, color: theme.palette.marigold[600] }}>
            {t("team.share.once", { date: until })}
          </Text>
        </View>

        <Button label={doneLabel} variant="secondary" onPress={onDone} />
      </Card>
    </Animated.View>
  );
}

function Delivery({
  state,
  detail,
  phone,
}: {
  state: "sent" | "failed" | "unknown";
  detail: string | null;
  phone: string;
}) {
  const t = useT();
  if (state === "sent") {
    return (
      <Text variant="footnote" color="textSecondary">
        {t("team.share.sent", { phone })}
      </Text>
    );
  }
  return (
    <Sunken
      style={{
        flexDirection: "row",
        gap: theme.spacing[2],
        backgroundColor: theme.color.warningSoft,
      }}
    >
      <Ionicons name="chatbox-ellipses-outline" size={15} color={theme.palette.marigold[600]} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="caption" style={{ color: theme.palette.marigold[600] }}>
          {state === "failed"
            ? t("team.share.notSent", { phone })
            : t("team.share.unknownSent", { phone })}
        </Text>
        {detail ? (
          <Text variant="caption" color="textMuted">
            {detail}
          </Text>
        ) : null}
      </View>
    </Sunken>
  );
}
