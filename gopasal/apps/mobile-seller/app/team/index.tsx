import * as React from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useGopasal } from "@gopasal/native-data";
import { useSelectedShop } from "@gopasal/native-data/seller";
import {
  INVITE_TTL_DAYS,
  TEAM_PERMISSIONS,
  groupStaff,
  memberDisplayName,
  useInviteActions,
  useShopInvites,
  useShopPermissions,
  useShopStaff,
  useStaffActions,
  type InviteIssued,
  type ShopInvite,
  type StaffMember,
} from "@gopasal/native-data/seller-team";
import {
  Button,
  Card,
  Confirm,
  ConnectionBanner,
  Sunken,
  Text,
  haptic,
  theme,
  useT,
} from "@gopasal/native-ui";
import { ShopRow } from "../../components/ShopRow";
import {
  TeamError,
  TeamHeader,
  TeamLoading,
  TeamNoAccess,
  TeamNotice,
  useFailureText,
} from "../../components/TeamFrame";
import { TeamInviteCard } from "../../components/TeamInviteCard";
import { useTeamLeaveGuard } from "../../components/TeamLeaveGuard";
import { TeamMemberCard } from "../../components/TeamMemberCard";
import { TeamShareOnce } from "../../components/TeamShareOnce";
import { roleName } from "../../lib/role-name";

/**
 * The people who work at this shop, and the people who have been asked to.
 *
 * Read in the order a shopkeeper asks about it: **who can work here right
 * now** — the owner, then everyone active — then who has been locked out, then
 * who has been invited and not turned up. `groupStaff` does that split, so a
 * suspended teammate never sits among the active ones answering the question
 * wrongly.
 *
 * What the screen offers follows `useShopPermissions`, never a guess. The API
 * is coarse here — one grant, `team.invite`, covers inviting, re-roling,
 * suspending and removing — so a teammate either sees every control or none,
 * and one who sees none is told why once, at the top, rather than finding out
 * by tapping. Controls the *server* would refuse on a particular person (the
 * owner, mostly) are drawn locked with the server's own sentence.
 *
 * **A resend re-rolls the code, and the new one exists only in the answer.** So
 * it is shown here, at the top, the moment it arrives, and the screen will not
 * let itself be left while it is on screen or on its way.
 */

type Pending =
  | { kind: "role"; member: StaffMember; role: { id: string; name: string } }
  | { kind: "status"; member: StaffMember; status: "ACTIVE" | "SUSPENDED" }
  | { kind: "remove"; member: StaffMember }
  | { kind: "resend"; invite: ShopInvite }
  | { kind: "revoke"; invite: ShopInvite };

export default function TeamScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const failureText = useFailureText();
  const { user } = useGopasal();
  const { shopId, shop, ready } = useSelectedShop();
  const permissions = useShopPermissions(shopId);

  const canView = permissions.has(TEAM_PERMISSIONS.view);
  const canManage = permissions.has(TEAM_PERMISSIONS.manageStaff);
  const canRoles = permissions.has(TEAM_PERMISSIONS.manageRoles);

  // Not asked for at all without `team.view`: a guaranteed 403 on every visit
  // is a request spent to learn what `/auth/me` already said.
  const readable = permissions.ready && canView ? shopId : null;
  const staff = useShopStaff(readable);
  const invites = useShopInvites(readable);
  const staffActions = useStaffActions(shopId);
  const inviteActions = useInviteActions(shopId);

  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [issued, setIssued] = React.useState<InviteIssued | null>(null);
  const [resendingId, setResendingId] = React.useState<string | null>(null);

  const scroller = React.useRef<ScrollView>(null);
  const leave = useTeamLeaveGuard({
    pending: inviteActions.resend.isPending,
    showing: issued !== null,
  });

  const busy =
    staffActions.changeRole.isPending ||
    staffActions.setStatus.isPending ||
    staffActions.remove.isPending ||
    inviteActions.resend.isPending ||
    inviteActions.revoke.isPending;

  const run = async () => {
    if (!pending) return;
    const action = pending;
    setError(null);
    try {
      switch (action.kind) {
        case "role":
          await staffActions.changeRole.mutateAsync({
            membershipId: action.member.id,
            roleId: action.role.id,
          });
          break;
        case "status":
          await staffActions.setStatus.mutateAsync({
            membershipId: action.member.id,
            status: action.status,
          });
          break;
        case "remove":
          await staffActions.remove.mutateAsync(action.member.id);
          setExpanded(null);
          break;
        case "resend": {
          setResendingId(action.invite.id);
          // Closed before the request rather than after, so the answer lands on
          // a screen with nothing in front of it.
          setPending(null);
          const result = await inviteActions.resend.mutateAsync(action.invite.id);
          // Copied out of the mutation at once: `data` is reset by the next
          // mutation, and this is the only copy of the code there will ever be.
          setIssued(result);
          scroller.current?.scrollTo({ y: 0, animated: true });
          break;
        }
        case "revoke":
          await inviteActions.revoke.mutateAsync(action.invite.id);
          break;
      }
      haptic("success");
    } catch (cause) {
      setError(failureText(cause));
    } finally {
      setPending(null);
      setResendingId(null);
    }
  };

  const body = (() => {
    if (!ready || !permissions.ready) return <TeamLoading />;
    if (!shop) {
      return (
        <TeamNotice
          icon="storefront-outline"
          title={t("shop.choose.title")}
          detail={t("shop.choose.detail")}
          actionLabel={t("shop.switch")}
          onAction={() => router.push("/shop-picker")}
        />
      );
    }
    if (!canView) {
      return <TeamNoAccess permissions={permissions} what={t("team.what.roster")} />;
    }
    return null;
  })();

  const members = staff.data ?? [];
  const groups = groupStaff(members);
  const waiting = invites.data ?? [];
  const aloneSoFar = staff.isSuccess && groups.active.length + groups.suspended.length === 0;
  let cardIndex = 0;

  const memberCard = (member: StaffMember) => (
    <TeamMemberCard
      key={member.id}
      member={member}
      shopId={shopId}
      isSelf={member.userId === user?.id}
      expanded={expanded === member.id}
      canManage={canManage}
      index={cardIndex++}
      onToggle={() => {
        setError(null);
        setExpanded((open) => (open === member.id ? null : member.id));
      }}
      onChangeRole={(role) => setPending({ kind: "role", member, role })}
      onSetStatus={(status) => setPending({ kind: "status", member, status })}
      onRemove={() => setPending({ kind: "remove", member })}
      onOpenRoles={canRoles ? () => router.push("/team/roles") : undefined}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
      <TeamHeader title={t("team.title")} subtitle={shop?.name ?? null} />

      <ScrollView
        ref={scroller}
        contentContainerStyle={{
          padding: theme.spacing[4],
          paddingBottom: theme.spacing[10] + insets.bottom,
          gap: theme.spacing[4],
        }}
        refreshControl={
          canView ? (
            <RefreshControl
              refreshing={(staff.isRefetching || invites.isRefetching) && !staff.isLoading}
              onRefresh={() => {
                void staff.refetch();
                void invites.refetch();
              }}
              tintColor={theme.color.brand}
            />
          ) : undefined
        }
      >
        {body ?? (
          <>
            {issued && shop ? (
              <TeamShareOnce
                issued={issued}
                shopName={shop.name}
                doneLabel={t("team.share.done")}
                onDone={() => {
                  leave.release();
                  setIssued(null);
                }}
              />
            ) : null}

            <TeamError message={error} />

            {canManage ? (
              <Button
                label={t("team.inviteButton")}
                leading={
                  <Ionicons name="person-add-outline" size={18} color={theme.color.onBrand} />
                }
                onPress={() => router.push("/team/invite")}
              />
            ) : (
              <Sunken style={{ flexDirection: "row", gap: theme.spacing[3] }}>
                <Ionicons name="eye-outline" size={16} color={theme.color.textMuted} />
                <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                  {t("team.readOnly")}
                </Text>
              </Sunken>
            )}

            {canRoles ? (
              <Card padded={false}>
                <View style={{ paddingHorizontal: theme.spacing[4] }}>
                  <ShopRow
                    icon="key-outline"
                    label={t("team.roles.row")}
                    detail={t("team.roles.rowDetail")}
                    onPress={() => router.push("/team/roles")}
                  />
                </View>
              </Card>
            ) : null}

            {staff.isLoading ? (
              <TeamLoading />
            ) : staff.isError ? (
              <TeamNotice
                icon="cloud-offline-outline"
                title={t("team.failed.title")}
                detail={t("shop.picker.failed.detail")}
                actionLabel={t("common.retry")}
                onAction={() => void staff.refetch()}
              />
            ) : (
              <>
                <Section
                  title={t("team.section.working")}
                  count={groups.owners.length + groups.active.length}
                >
                  {groups.owners.map(memberCard)}
                  {groups.active.map(memberCard)}
                </Section>

                {aloneSoFar ? (
                  <Sunken style={{ gap: theme.spacing[2] }}>
                    <Text variant="callout">{t("team.empty.title")}</Text>
                    <Text variant="caption" color="textSecondary">
                      {t("team.empty.detail")}
                    </Text>
                  </Sunken>
                ) : null}

                {groups.suspended.length > 0 ? (
                  <Section
                    title={t("team.section.suspended")}
                    count={groups.suspended.length}
                    note={t("team.section.suspendedNote")}
                  >
                    {groups.suspended.map(memberCard)}
                  </Section>
                ) : null}
              </>
            )}

            {waiting.length > 0 ? (
              <Section title={t("team.section.invited")} count={waiting.length}>
                {waiting.map((invite) => (
                  <TeamInviteCard
                    key={invite.id}
                    invite={invite}
                    canManage={canManage}
                    busy={resendingId === invite.id}
                    index={cardIndex++}
                    onResend={() => {
                      setError(null);
                      setPending({ kind: "resend", invite });
                    }}
                    onRevoke={() => {
                      setError(null);
                      setPending({ kind: "revoke", invite });
                    }}
                  />
                ))}
              </Section>
            ) : invites.isError ? (
              <Text variant="caption" color="textMuted">
                {t("team.invites.failed")}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>

      <PendingConfirm
        pending={pending}
        selfId={user?.id ?? null}
        busy={busy}
        onConfirm={() => void run()}
        onCancel={() => setPending(null)}
      />
      {leave.guard}
    </View>
  );
}

function Section({
  title,
  count,
  note,
  children,
}: {
  title: string;
  count: number;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: theme.spacing[2] }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: theme.spacing[2] }}>
        <Text variant="overline" color="textMuted">
          {title}
        </Text>
        <Text variant="overline" color="textFaint" tabular>
          {String(count)}
        </Text>
      </View>
      {note ? (
        <Text variant="caption" color="textMuted">
          {note}
        </Text>
      ) : null}
      <View style={{ gap: theme.spacing[3] }}>{children}</View>
    </View>
  );
}

/**
 * The one confirmation, worded for whatever is about to happen.
 *
 * Each message states what changes *for the other person* and when — straight
 * away, in every case, because none of these are queued — and whether it can
 * be taken back. Removing somebody cannot, and the dialog says what bringing
 * them back would take. Doing any of this to yourself gets its own sentence,
 * because "they lose access" reads very differently once "they" is you.
 */
function PendingConfirm({
  pending,
  selfId,
  busy,
  onConfirm,
  onCancel,
}: {
  pending: Pending | null;
  selfId: string | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();

  // Held so the dialog keeps its words while it animates away.
  const [shown, setShown] = React.useState<Pending | null>(pending);
  React.useEffect(() => {
    if (pending) setShown(pending);
  }, [pending]);

  const copy = ((): {
    title: string;
    message: string;
    confirm: string;
    destructive: boolean;
  } | null => {
    if (!shown) return null;
    switch (shown.kind) {
      case "role": {
        const name = memberDisplayName(shown.member);
        return {
          title: t("team.confirm.role.title", { name, role: shown.role.name }),
          message: t("team.confirm.role.detail", {
            role: shown.role.name,
            current: roleName(shown.member.role, t),
          }),
          confirm: t("team.confirm.role.yes"),
          destructive: false,
        };
      }
      case "status": {
        const name = memberDisplayName(shown.member);
        const self = shown.member.userId === selfId;
        if (shown.status === "SUSPENDED") {
          return {
            title: t("team.confirm.suspend.title", { name }),
            message: self ? t("team.confirm.suspend.self") : t("team.confirm.suspend.detail"),
            confirm: t("team.confirm.suspend.yes"),
            destructive: true,
          };
        }
        return {
          title: t("team.confirm.reactivate.title", { name }),
          message: t("team.confirm.reactivate.detail", { role: roleName(shown.member.role, t) }),
          confirm: t("team.confirm.reactivate.yes"),
          destructive: false,
        };
      }
      case "remove": {
        const name = memberDisplayName(shown.member);
        const self = shown.member.userId === selfId;
        return {
          title: t("team.confirm.remove.title", { name }),
          message: self ? t("team.confirm.remove.self") : t("team.confirm.remove.detail"),
          confirm: t("team.confirm.remove.yes"),
          destructive: true,
        };
      }
      case "resend": {
        const who = shown.invite.name?.trim() || shown.invite.phone;
        return {
          title: t("team.confirm.resend.title", { who }),
          message: t("team.confirm.resend.detail", { days: INVITE_TTL_DAYS }),
          confirm: t("team.confirm.resend.yes"),
          destructive: false,
        };
      }
      case "revoke": {
        const who = shown.invite.name?.trim() || shown.invite.phone;
        return {
          title: t("team.confirm.revoke.title", { who }),
          message: t("team.confirm.revoke.detail"),
          confirm: t("team.confirm.revoke.yes"),
          destructive: true,
        };
      }
    }
  })();

  return (
    <Confirm
      visible={pending !== null}
      title={copy?.title ?? ""}
      message={copy?.message}
      confirmLabel={copy?.confirm}
      cancelLabel={t("common.notNow")}
      destructive={copy?.destructive ?? false}
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
