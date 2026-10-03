import * as React from "react";
import { Platform, ScrollView, Share, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  useAccountDeletion,
  useDataExport,
  useDeletionEligibility,
  useGopasal,
} from "@gopasal/native-data";
import {
  Button,
  Card,
  Confirm,
  ConnectionBanner,
  Skeleton,
  Sunken,
  Text,
  Touchable,
  fontFamily,
  haptic,
  theme,
  useT,
} from "@gopasal/native-ui";

/**
 * Your data, and the end of the account.
 *
 * This used to be a link into the web console, on the grounds that deleting an
 * account needs a second factor and a typed confirmation and a half-built
 * version of that on a phone is worse than an honest handover. The server has
 * all three steps, so the app can do it properly instead:
 *
 *  1. It asks whether the account *can* be closed and says plainly what is in
 *     the way — an open order, a shop you own — rather than failing at the end.
 *  2. A code goes to the login number, which is the same proof that opened the
 *     account.
 *  3. The words are typed out in full and the retention notice is shown, not
 *     pre-ticked, because deleting an account should take a moment's thought.
 *
 * The export is deliberately next to it: the sensible order is to take your
 * data with you and then close the account.
 */

const CONFIRMATION = "DELETE MY ACCOUNT";

export default function PrivacyScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useGopasal();

  const [closing, setClosing] = React.useState(false);
  const eligibility = useDeletionEligibility(closing);
  const { requestCode, confirm } = useAccountDeletion();
  const exportData = useDataExport();

  const [code, setCode] = React.useState("");
  const [typed, setTyped] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [devCode, setDevCode] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const download = async () => {
    setError(null);
    try {
      const data = await exportData.mutateAsync();
      haptic("success");
      // Handing it to the share sheet rather than writing a file: the customer
      // picks where their own data goes — mail, Drive, a notes app — and
      // nothing is left sitting in the app's storage afterwards.
      await Share.share({
        title: t("privacy.export.shareTitle"),
        message: JSON.stringify(data, null, 2).slice(0, 900_000),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("privacy.error.export"));
    }
  };

  const sendCode = async () => {
    setError(null);
    try {
      const result = await requestCode.mutateAsync();
      setSent(true);
      setDevCode(result.developmentCode ?? null);
      haptic("success");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("privacy.error.sendCode"),
      );
    }
  };

  const [asking, setAsking] = React.useState(false);

  const destroy = () => {
    if (typed.trim().toUpperCase() !== CONFIRMATION) {
      setError(t("privacy.error.typeExactly", { phrase: CONFIRMATION }));
      return;
    }
    setAsking(true);
  };

  const reallyDestroy = async () => {
    setAsking(false);
    setError(null);
    try {
      await confirm.mutateAsync({ code: code.trim(), reason: reason.trim() || undefined });
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("privacy.error.confirm"));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing[2],
          paddingHorizontal: theme.spacing[4],
          paddingBottom: theme.spacing[10],
          gap: theme.spacing[4],
        }}
        keyboardShouldPersistTaps="handled"
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
          <Text variant="title2" style={{ flex: 1 }}>
            {t("account.data")}
          </Text>
        </View>

        <Card>
          <Text variant="title3">{t("privacy.export.title")}</Text>
          <Text variant="footnote" color="textSecondary" style={{ marginTop: theme.spacing[2] }}>
            {t("privacy.export.detail", { phone: user?.phone ?? t("privacy.yourNumber") })}
          </Text>
          <Button
            label={exportData.isPending ? t("privacy.export.preparing") : t("privacy.export.download")}
            variant="secondary"
            loading={exportData.isPending}
            onPress={download}
            style={{ marginTop: theme.spacing[4] }}
          />
        </Card>

        <Card>
          <Text variant="title3">{t("privacy.delete.title")}</Text>
          <Text variant="footnote" color="textSecondary" style={{ marginTop: theme.spacing[2] }}>
            {t("privacy.delete.detail")}
          </Text>

          {!closing ? (
            <Button
              label={t("privacy.delete.start")}
              variant="ghost"
              onPress={() => setClosing(true)}
              style={{ marginTop: theme.spacing[3] }}
            />
          ) : (
            <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: theme.spacing[4] }}>
              {eligibility.isLoading ? (
                <Skeleton width="100%" height={60} radius={theme.radii.md} />
              ) : eligibility.data && !eligibility.data.eligible ? (
                <Sunken style={{ backgroundColor: theme.color.warningSoft, gap: theme.spacing[2] }}>
                  <Text variant="callout">{t("privacy.delete.blocked")}</Text>
                  {eligibility.data.blockers.map((blocker) => (
                    <View
                      key={blocker.code}
                      style={{ flexDirection: "row", gap: theme.spacing[2], alignItems: "flex-start" }}
                    >
                      <Ionicons
                        name="ellipse"
                        size={6}
                        color={theme.color.textMuted}
                        style={{ marginTop: 7 }}
                      />
                      <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                        {blocker.message}
                        {blocker.count > 1 ? ` (${blocker.count})` : ""}
                      </Text>
                    </View>
                  ))}
                </Sunken>
              ) : (
                <>
                  {(eligibility.data?.retained ?? []).length > 0 && (
                    <Sunken style={{ gap: theme.spacing[2] }}>
                      <Text variant="caption" color="textSecondary">
                        {t("privacy.delete.retained")}
                      </Text>
                      {eligibility.data!.retained.map((line) => (
                        <Text key={line} variant="caption" color="textMuted">
                          · {line}
                        </Text>
                      ))}
                    </Sunken>
                  )}

                  {!sent ? (
                    <Button
                      label={requestCode.isPending ? t("privacy.code.sending") : t("privacy.code.send")}
                      loading={requestCode.isPending}
                      onPress={sendCode}
                      style={{ marginTop: theme.spacing[4] }}
                    />
                  ) : (
                    <View style={{ marginTop: theme.spacing[4], gap: theme.spacing[3] }}>
                      <Text variant="caption" color="textMuted">
                        {t("privacy.code.sentTo", { phone: user?.phone ?? "" })}
                        {devCode ? ` · development code is ${devCode}` : ""}
                      </Text>

                      <Field
                        label={t("privacy.code.label")}
                        value={code}
                        onChangeText={setCode}
                        placeholder="000000"
                        keyboardType="number-pad"
                        maxLength={8}
                      />
                      <Field
                        label={t("privacy.confirm.label", { phrase: CONFIRMATION })}
                        value={typed}
                        onChangeText={setTyped}
                        placeholder={CONFIRMATION}
                        autoCapitalize="characters"
                        maxLength={40}
                      />
                      <Field
                        label={t("privacy.reason.label")}
                        value={reason}
                        onChangeText={setReason}
                        placeholder={t("privacy.reason.placeholder")}
                        maxLength={500}
                      />

                      <Button
                        label={confirm.isPending ? t("privacy.delete.deleting") : t("privacy.delete.action")}
                        variant="danger"
                        loading={confirm.isPending}
                        disabled={code.trim().length < 4 || confirm.isPending}
                        onPress={destroy}
                      />
                    </View>
                  )}
                </>
              )}

              <Button
                label={t("common.cancel")}
                variant="ghost"
                onPress={() => {
                  setClosing(false);
                  setSent(false);
                  setCode("");
                  setTyped("");
                  setError(null);
                }}
                style={{ marginTop: theme.spacing[2] }}
              />
            </Animated.View>
          )}

          {error ? (
            <Sunken
              style={{
                flexDirection: "row",
                gap: theme.spacing[3],
                marginTop: theme.spacing[3],
                backgroundColor: theme.color.dangerSoft,
              }}
            >
              <Ionicons name="alert-circle" size={16} color={theme.color.danger} />
              <Text variant="caption" style={{ color: theme.color.danger, flex: 1 }}>
                {error}
              </Text>
            </Sunken>
          ) : null}
        </Card>
      </ScrollView>

      <Confirm
        visible={asking}
        title={t("privacy.confirm.title")}
        message={t("privacy.confirm.message")}
        confirmLabel={t("privacy.confirm.yes")}
        cancelLabel={t("privacy.confirm.no")}
        destructive
        busy={confirm.isPending}
        onConfirm={reallyDestroy}
        onCancel={() => setAsking(false)}
      />
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  maxLength,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad";
  maxLength?: number;
  autoCapitalize?: "none" | "characters" | "sentences";
}) {
  return (
    <View>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <View
        style={{
          marginTop: 6,
          borderRadius: theme.radii.lg,
          borderWidth: 1,
          borderColor: theme.color.border,
          backgroundColor: theme.color.surfaceSunken,
          paddingHorizontal: theme.spacing[4],
          height: 48,
          justifyContent: "center",
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.color.textFaint}
          keyboardType={keyboardType}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize ?? "sentences"}
          autoCorrect={false}
          accessibilityLabel={label}
          style={{
            fontFamily: fontFamily.body,
            fontSize: 15,
            color: theme.color.text,
            ...(Platform.OS === "web" ? { outlineStyle: "none" as never } : null),
          }}
        />
      </View>
    </View>
  );
}
