import * as React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  INVITE_MAX_ATTEMPTS,
  canResendInvite,
  canRevokeInvite,
  inviteDelivery,
  isInviteLapsed,
  type ShopInvite,
} from "@gopasal/native-data/seller-team";
import { Button, Card, Text, theme, useT } from "@gopasal/native-ui";
import { TeamLocked, shortDate, useVerdictText } from "./TeamFrame";
import { TeamPill } from "./TeamMemberCard";
import { roleName } from "../lib/role-name";

/**
 * An invitation somebody has not accepted yet.
 *
 * The code is not here and cannot be: the server holds only its hash. So the
 * card is about the two things that can still go wrong — **the text message
 * never arrived**, and **the invitation ran out** — and each is shown next to
 * the button that fixes it, which is Resend in both cases.
 *
 * Wrong-code tries are shown only once somebody has made one. A counter reading
 * "8 tries left" on every fresh invite is noise; "3 tries left" is the owner's
 * cue that the person at the counter is mistyping and should be handed the
 * link instead.
 */
export function TeamInviteCard({
  invite,
  canManage,
  busy,
  onResend,
  onRevoke,
  index,
}: {
  invite: ShopInvite;
  canManage: boolean;
  busy: boolean;
  onResend: () => void;
  onRevoke: () => void;
  index: number;
}) {
  const t = useT();
  const verdictText = useVerdictText();
  const lapsed = isInviteLapsed(invite);
  const delivery = inviteDelivery(invite);
  const who = invite.name?.trim() || invite.phone;
  const resend = canResendInvite(invite);
  const revoke = canRevokeInvite(invite);
  const triesUsed = invite.attemptsRemaining < INVITE_MAX_ATTEMPTS;

  return (
    <Card index={index} style={{ gap: theme.spacing[3] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: theme.radii.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.color.surfaceSunken,
          }}
        >
          <Ionicons name="mail-unread-outline" size={17} color={theme.color.textMuted} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="callout" numberOfLines={1}>
            {who}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {invite.name?.trim()
              ? `${roleName(invite.role, t)} · ${invite.phone}`
              : roleName(invite.role, t)}
          </Text>
        </View>
        <TeamPill
          label={lapsed ? t("team.invite.expired") : t("team.invite.waiting")}
          tone={lapsed ? "muted" : "warning"}
        />
      </View>

      <View style={{ gap: 2 }}>
        <Text variant="caption" color="textSecondary">
          {lapsed
            ? t("team.invite.lapsedLine")
            : t("team.invite.untilLine", {
                date: shortDate(invite.expiresAt),
                sent: shortDate(invite.lastSentAt),
              })}
        </Text>
        {delivery.state === "failed" ? (
          <Text variant="caption" style={{ color: theme.palette.marigold[600] }}>
            {t("team.invite.smsFailed")}
          </Text>
        ) : null}
        {triesUsed ? (
          <Text variant="caption" color="textMuted">
            {t("team.invite.triesLeft", { count: invite.attemptsRemaining })}
          </Text>
        ) : null}
      </View>

      {canManage ? (
        <View style={{ gap: theme.spacing[2] }}>
          <View style={{ flexDirection: "row", gap: theme.spacing[2] }}>
            <Button
              label={t("team.invite.resend")}
              size="sm"
              variant="secondary"
              full={false}
              loading={busy}
              disabled={!resend.allowed}
              accessibilityLabel={t("team.invite.a11yResend", { who })}
              onPress={onResend}
              style={{ flex: 1 }}
            />
            <Button
              label={t("team.invite.revoke")}
              size="sm"
              variant="danger"
              full={false}
              disabled={!revoke.allowed || busy}
              accessibilityLabel={t("team.invite.a11yRevoke", { who })}
              onPress={onRevoke}
              style={{ flex: 1 }}
            />
          </View>
          <TeamLocked reason={verdictText(resend) ?? verdictText(revoke)} />
        </View>
      ) : null}
    </Card>
  );
}
