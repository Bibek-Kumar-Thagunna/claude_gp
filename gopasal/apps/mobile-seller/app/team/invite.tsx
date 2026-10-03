import * as React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelectedShop } from "@gopasal/native-data/seller";
import {
  INVITE_NAME_MAX,
  INVITE_NOTE_MAX,
  INVITE_TTL_DAYS,
  TEAM_PERMISSIONS,
  useAssignableRoles,
  useInviteActions,
  useShopPermissions,
  type InviteIssued,
} from "@gopasal/native-data/seller-team";
import { Button, ConnectionBanner, Text, haptic, theme, useT } from "@gopasal/native-ui";
import { RegisterField } from "../../components/RegisterField";
import {
  TeamError,
  TeamHeader,
  TeamLoading,
  TeamNoAccess,
  TeamNotice,
  useFailureText,
} from "../../components/TeamFrame";
import { useTeamLeaveGuard } from "../../components/TeamLeaveGuard";
import { TeamRolePicker } from "../../components/TeamRolePicker";
import { TeamShareOnce } from "../../components/TeamShareOnce";

/**
 * Asking somebody to join the shop.
 *
 * Adding a teammate is an invitation, never an account the owner creates: they
 * name a phone number and a role, GoPasal texts that number, and the person
 * joins by signing in with their *own* number and code. Nobody's password or
 * OTP changes hands, and the screen says so, because "give them your login" is
 * what a lot of shops do today.
 *
 * The form is short on purpose — number, role, and two optional lines — and the
 * screen's real job starts after Send. **The link and code in the answer exist
 * once.** They replace the form the instant they arrive, the back arrow, swipe
 * and hardware back all ask before leaving while they are showing (or while the
 * request is still in the air), and the only quiet way out is the Done button
 * under them.
 *
 * The phone number is sent as typed. The API normalises Nepali numbers itself,
 * and reformatting it here would be a second opinion that can disagree.
 */
export default function InviteScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const failureText = useFailureText();
  const { shopId, shop, ready } = useSelectedShop();
  const permissions = useShopPermissions(shopId);
  const canInvite = permissions.has(TEAM_PERMISSIONS.manageStaff);
  const canRoles = permissions.has(TEAM_PERMISSIONS.manageRoles);
  const assignable = useAssignableRoles(shopId);
  const { create } = useInviteActions(shopId);

  const [phone, setPhone] = React.useState("");
  const [name, setName] = React.useState("");
  const [note, setNote] = React.useState("");
  const [role, setRole] = React.useState<{ id: string; name: string } | null>(null);
  const [tried, setTried] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [issued, setIssued] = React.useState<InviteIssued | null>(null);

  const leave = useTeamLeaveGuard({ pending: create.isPending, showing: issued !== null });

  // Only once Send has been pressed. A half-typed number is the normal state of
  // this field for the first ten seconds, not a mistake.
  const phoneProblem = tried ? phoneIssue(phone, t) : null;
  const roleProblem = tried && !role ? t("team.inviteForm.roleNeeded") : null;

  const send = async () => {
    setTried(true);
    setError(null);
    if (phoneIssue(phone, t) || !role) return;
    try {
      const result = await create.mutateAsync({
        phone: phone.trim(),
        roleId: role.id,
        // Omitted rather than sent empty: an empty string is still a key, and
        // the join screen would show a blank line where a name should be.
        ...(name.trim() ? { name: name.trim() } : null),
        ...(note.trim() ? { note: note.trim() } : null),
      });
      haptic("success");
      setIssued(result);
    } catch (cause) {
      setError(failureText(cause));
    }
  };

  const startAgain = () => {
    leave.release();
    setIssued(null);
    setPhone("");
    setName("");
    setNote("");
    setTried(false);
    setError(null);
  };

  const done = () => {
    leave.release();
    router.back();
  };

  const gate = (() => {
    if (!ready || !permissions.ready) return <TeamLoading />;
    if (!shop) {
      return (
        <TeamNotice
          icon="storefront-outline"
          title={t("shop.choose.title")}
          detail={t("shop.choose.detail")}
        />
      );
    }
    if (!canInvite) {
      return <TeamNoAccess permissions={permissions} what={t("team.what.invite")} />;
    }
    // No roles to invite *into* is a dead end for the whole form, not for one
    // field. Said instead of the form, rather than under an empty picker.
    if (assignable.needsRbacManage || assignable.empty) {
      return (
        <View style={{ gap: theme.spacing[4] }}>
          <TeamRolePicker
            shopId={shopId}
            selected={null}
            onSelect={setRole}
            onOpenRoles={canRoles ? () => router.push("/team/roles") : undefined}
            purpose="invite"
          />
        </View>
      );
    }
    return null;
  })();

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      {/* Belt and braces with the guard: the iOS edge swipe is the one exit a
          thumb takes without meaning to. */}
      <Stack.Screen options={{ gestureEnabled: !leave.hold }} />
      <ConnectionBanner />
      <TeamHeader title={t("team.inviteForm.title")} subtitle={shop?.name ?? null} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            padding: theme.spacing[4],
            paddingBottom: insets.bottom + theme.spacing[12],
            gap: theme.spacing[5],
          }}
          keyboardShouldPersistTaps="handled"
        >
          {gate ??
            (issued && shop ? (
              <>
                <TeamShareOnce
                  issued={issued}
                  shopName={shop.name}
                  doneLabel={t("team.share.done")}
                  onDone={done}
                />
                <Button label={t("team.inviteForm.another")} variant="ghost" onPress={startAgain} />
              </>
            ) : (
              <>
                <Text variant="footnote" color="textSecondary">
                  {t("team.inviteForm.intro", { days: INVITE_TTL_DAYS })}
                </Text>

                <RegisterField
                  label={t("team.inviteForm.phone")}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder={t("auth.phone.placeholder")}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  maxLength={16}
                  problem={phoneProblem}
                  hint={t("team.inviteForm.phoneHint")}
                />

                <RegisterField
                  label={t("team.inviteForm.name")}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  maxLength={INVITE_NAME_MAX}
                  hint={t("team.inviteForm.nameHint")}
                />

                <View style={{ gap: theme.spacing[2] }}>
                  <Text variant="footnote" color="textSecondary">
                    {t("team.inviteForm.role")}
                  </Text>
                  <TeamRolePicker
                    shopId={shopId}
                    selected={role?.id ?? null}
                    onSelect={setRole}
                    onOpenRoles={canRoles ? () => router.push("/team/roles") : undefined}
                    purpose="invite"
                  />
                  {roleProblem ? (
                    <Text variant="caption" style={{ color: theme.color.danger }}>
                      {roleProblem}
                    </Text>
                  ) : null}
                </View>

                <RegisterField
                  label={t("team.inviteForm.note")}
                  value={note}
                  onChangeText={setNote}
                  multiline
                  maxLength={INVITE_NOTE_MAX}
                  placeholder={t("team.inviteForm.notePlaceholder")}
                  hint={t("team.inviteForm.noteHint")}
                />

                <TeamError message={error} />

                <Button
                  label={t("team.inviteForm.send")}
                  size="lg"
                  loading={create.isPending}
                  onPress={() => void send()}
                />
              </>
            ))}
        </ScrollView>
      </KeyboardAvoidingView>
      {leave.guard}
    </View>
  );
}

/**
 * A light check, only to catch the obvious before a round trip.
 *
 * The server normalises and is the judge — `98XXXXXXXX`, `+977 98…` and
 * `977-98…` are all fine there — so this only asks whether the digits could be
 * a Nepali mobile number at all. Anything subtler would be a second rule that
 * can disagree with the first.
 */
function phoneIssue(phone: string, t: ReturnType<typeof useT>): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) {
    return t("team.inviteForm.phoneNeeded");
  }
  const local = digits.startsWith("977") && digits.length === 13 ? digits.slice(3) : digits;
  if (local.length !== 10 || !local.startsWith("9")) {
    return t("auth.phone.invalid");
  }
  return null;
}
