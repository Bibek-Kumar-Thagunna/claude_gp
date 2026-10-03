import * as React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { ApiError, useAuth } from "@gopasal/native-data";
import {
  Button,
  ConnectionBanner,
  Logo,
  Text,
  Touchable,
  haptic,
  theme,
  useNetwork,
  useT,
} from "@gopasal/native-ui";

/**
 * Step one of signing in: the phone number.
 *
 * Nepali mobile numbers are ten digits beginning 97 or 98, and that is the only
 * validation worth doing here — everything else the server decides. The rules
 * that matter are about the *keyboard*, because this is the screen where a
 * careless field costs the most users:
 *
 *  - `keyboardType="number-pad"` and `textContentType="telephoneNumber"` so the
 *    digits are large and the OS offers the number it already knows.
 *  - `autoComplete="tel"` so Android's autofill can supply it in one tap.
 *  - Digits stripped on entry, so a pasted `+977 98-1111-1111` becomes a valid
 *    number instead of a validation error the user has to decode.
 *  - `maxLength` enforced after stripping, never on the raw string, or pasting
 *    a formatted number silently truncates it.
 */

const NEPAL_MOBILE = /^9[678]\d{8}$/;

export default function PhoneScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const net = useNetwork();
  const { requestOtp } = useAuth();

  const [raw, setRaw] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const phone = raw.replace(/\D/g, "").slice(0, 10);
  const valid = NEPAL_MOBILE.test(phone);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await requestOtp(phone);
      haptic("success");
      router.push({
        pathname: "/auth/code",
        params: {
          phone,
          // Surfaced on the next screen when the dev transport is in use, so
          // nobody hunts through a log for a code during local testing. It is
          // absent in any deployment with a real SMS gateway.
          devCode: result.developmentCode ?? "",
          cooldown: String(result.cooldownSeconds ?? 60),
        },
      });
    } catch (cause) {
      haptic("error");
      setError(cause instanceof ApiError ? cause.message : t("auth.phone.sendFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: theme.spacing[6],
            paddingTop: insets.top + theme.spacing[4],
            paddingBottom: insets.bottom + theme.spacing[6],
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Touchable
            haptic="selection"
            onPress={() => router.back()}
            accessibilityLabel={t("common.back")}
            style={{
              width: 40,
              height: 40,
              borderRadius: theme.radii.full,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.color.surface,
              borderWidth: 1,
              borderColor: theme.color.border,
            }}
          >
            <Ionicons name="arrow-back" size={20} color={theme.color.text} />
          </Touchable>

          <Animated.View
            entering={FadeInDown.duration(380)}
            style={{ marginTop: theme.spacing[8] }}
          >
            <Logo size={40} />
            <Text variant="title1" style={{ marginTop: theme.spacing[5] }}>
              {t("auth.phone.title")}
            </Text>
            <Text variant="body" color="textMuted" style={{ marginTop: theme.spacing[2] }}>
              {t("auth.phone.detail")}
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(80).duration(380)}
            style={{ marginTop: theme.spacing[8] }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: theme.color.surface,
                borderRadius: theme.radii.lg,
                borderWidth: 1.5,
                borderColor: error
                  ? theme.color.danger
                  : valid
                    ? theme.color.brand
                    : theme.color.border,
                paddingHorizontal: theme.spacing[4],
                height: 60,
                gap: theme.spacing[3],
              }}
            >
              <Text variant="bodyStrong" color="textMuted">
                +977
              </Text>
              <View style={{ width: 1, height: 24, backgroundColor: theme.color.border }} />
              <TextInput
                value={phone}
                onChangeText={(next) => {
                  setRaw(next);
                  if (error) setError(null);
                }}
                placeholder={t("auth.phone.placeholder")}
                placeholderTextColor={theme.color.textFaint}
                keyboardType="number-pad"
                inputMode="numeric"
                textContentType="telephoneNumber"
                autoComplete="tel"
                autoFocus
                maxLength={14}
                returnKeyType="go"
                onSubmitEditing={submit}
                accessibilityLabel={t("auth.phone.a11yInput")}
                style={{
                  flex: 1,
                  fontSize: 20,
                  letterSpacing: 1.2,
                  color: theme.color.text,
                  fontWeight: "700",
                  paddingVertical: 0,
                }}
              />
              {valid && <Ionicons name="checkmark-circle" size={22} color={theme.color.success} />}
            </View>

            {error ? (
              <Text variant="footnote" color="danger" style={{ marginTop: theme.spacing[2] }}>
                {error}
              </Text>
            ) : (
              <Text variant="footnote" color="textFaint" style={{ marginTop: theme.spacing[2] }}>
                {t("auth.phone.hint")}
              </Text>
            )}
          </Animated.View>

          <View style={{ flex: 1 }} />

          <Animated.View entering={FadeInDown.delay(160).duration(380)}>
            <Button
              label={net.isConnected ? t("auth.phone.send") : t("auth.phone.waiting")}
              size="lg"
              loading={busy}
              disabled={!valid || !net.isConnected}
              onPress={submit}
            />
            <Text
              variant="caption"
              color="textFaint"
              align="center"
              style={{ marginTop: theme.spacing[4] }}
            >
              {t("auth.phone.terms")}
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
