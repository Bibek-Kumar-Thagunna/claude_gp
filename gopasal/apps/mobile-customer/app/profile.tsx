import * as React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useGopasal, useUpdateProfile } from "@gopasal/native-data";
import {
  Button,
  Card,
  ConnectionBanner,
  Sunken,
  Text,
  Touchable,
  fontFamily,
  haptic,
  theme,
  useT,
} from "@gopasal/native-ui";

/**
 * The profile.
 *
 * Short on purpose. The phone number is the account and cannot be edited here —
 * it is the thing the OTP proved, the thing orders and coins hang off, and a
 * field that silently failed to change it would be worse than no field. The
 * name matters because it is what the rider asks for at the gate.
 */
export default function ProfileScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useGopasal();
  const update = useUpdateProfile();

  const [name, setName] = React.useState(user?.name ?? "");
  const [email, setEmail] = React.useState(user?.email ?? "");
  // The session can arrive a frame after this screen (a cold start straight
  // into it): fill the fields when it does, unless the person has already typed.
  const touched = React.useRef(false);
  React.useEffect(() => {
    if (touched.current || !user) return;
    setName(user.name ?? "");
    setEmail(user.email ?? "");
  }, [user]);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const dirty = name !== (user?.name ?? "") || email !== (user?.email ?? "");

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError(t("profile.error.name"));
    try {
      await update.mutateAsync({ name: name.trim(), email: email.trim() || undefined });
      haptic("success");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("profile.error.save"));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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
            <Text variant="title2">{t("profile.title")}</Text>
          </View>

          <Card>
            <Text variant="caption" color="textMuted">
              {t("profile.name")}
            </Text>
            <View
              style={{
                marginTop: 6,
                height: 48,
                justifyContent: "center",
                paddingHorizontal: theme.spacing[4],
                borderRadius: theme.radii.lg,
                borderWidth: 1,
                borderColor: theme.color.border,
                backgroundColor: theme.color.surfaceSunken,
              }}
            >
              <TextInput
                value={name}
                onChangeText={(v) => {
                  touched.current = true;
                  setName(v);
                }}
                placeholder={t("profile.name.placeholder")}
                placeholderTextColor={theme.color.textFaint}
                autoCapitalize="words"
                maxLength={80}
                accessibilityLabel={t("profile.name")}
                style={{ fontFamily: fontFamily.body, fontSize: 15, color: theme.color.text }}
              />
            </View>

            <Text variant="caption" color="textMuted" style={{ marginTop: theme.spacing[4] }}>
              {t("profile.email")}
            </Text>
            <View
              style={{
                marginTop: 6,
                height: 48,
                justifyContent: "center",
                paddingHorizontal: theme.spacing[4],
                borderRadius: theme.radii.lg,
                borderWidth: 1,
                borderColor: theme.color.border,
                backgroundColor: theme.color.surfaceSunken,
              }}
            >
              <TextInput
                value={email}
                onChangeText={(v) => {
                  touched.current = true;
                  setEmail(v);
                }}
                placeholder="you@example.com"
                placeholderTextColor={theme.color.textFaint}
                autoCapitalize="none"
                keyboardType="email-address"
                maxLength={120}
                accessibilityLabel={t("profile.emailShort")}
                style={{ fontFamily: fontFamily.body, fontSize: 15, color: theme.color.text }}
              />
            </View>

            <Text variant="caption" color="textMuted" style={{ marginTop: theme.spacing[4] }}>
              {t("profile.phone")}
            </Text>
            <Sunken style={{ marginTop: 6, flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
              <Ionicons name="shield-checkmark" size={16} color={theme.color.success} />
              <Text variant="callout" style={{ flex: 1 }}>
                {user?.phone ?? "—"}
              </Text>
              <Text variant="overline" color="textFaint">
                {t("profile.verified")}
              </Text>
            </Sunken>
            <Text variant="caption" color="textFaint" style={{ marginTop: 6 }}>
              {t("profile.phone.note")}
            </Text>

            {error ? (
              <Sunken
                style={{
                  flexDirection: "row",
                  gap: theme.spacing[3],
                  marginTop: theme.spacing[4],
                  backgroundColor: theme.color.dangerSoft,
                }}
              >
                <Ionicons name="alert-circle" size={16} color={theme.color.danger} />
                <Text variant="caption" style={{ color: theme.color.danger, flex: 1 }}>
                  {error}
                </Text>
              </Sunken>
            ) : null}

            <Button
              label={saved ? t("profile.saved") : t("profile.saveChanges")}
              loading={update.isPending}
              disabled={!dirty || update.isPending}
              onPress={save}
              style={{ marginTop: theme.spacing[5] }}
            />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
