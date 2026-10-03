import * as React from "react";
import { KeyboardAvoidingView, Platform, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { ApiError, useAuth } from "@gopasal/native-data";
import {
  Button,
  ConnectionBanner,
  Sunken,
  Text,
  Touchable,
  haptic,
  theme,
  useT,
} from "@gopasal/native-ui";

/**
 * Step two: the six-digit code.
 *
 * The visible boxes are not six inputs. They are six *views* rendered from one
 * hidden `TextInput` laid over them, which is the only arrangement that behaves
 * correctly: six real fields fight the OS over focus, break backspace across a
 * boundary, and — the one that matters most — defeat SMS autofill, because
 * iOS and Android hand the whole code to a single field with
 * `textContentType="oneTimeCode"` / `autoComplete="sms-otp"`. Users expect to
 * tap the keyboard suggestion once and be in.
 *
 * The code is submitted automatically on the sixth digit. Making someone press
 * a button after typing the last digit of a code they just read from a text
 * message is a step with no purpose.
 */

const LENGTH = 6;

export default function CodeScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ phone: string; devCode?: string; cooldown?: string }>();
  const { verifyOtp, requestOtp } = useAuth();

  const phone = String(params.phone ?? "");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [seconds, setSeconds] = React.useState(() => Number(params.cooldown ?? 60));
  const inputRef = React.useRef<TextInput>(null);

  // The shake is the whole error affordance for a wrong code: it is faster to
  // read than a sentence and it puts the feedback where the eyes already are.
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  React.useEffect(() => {
    if (seconds <= 0) return;
    const id = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [seconds]);

  const submit = React.useCallback(
    async (value: string) => {
      if (value.length !== LENGTH || busy) return;
      setBusy(true);
      setError(null);
      try {
        await verifyOtp(phone, value);
        haptic("success");
        router.replace("/(tabs)/home");
      } catch (cause) {
        haptic("error");
        shake.value = withSequence(
          withTiming(-9, { duration: 55 }),
          withTiming(9, { duration: 55 }),
          withTiming(-6, { duration: 55 }),
          withTiming(0, { duration: 55 }),
        );
        setError(cause instanceof ApiError ? cause.message : t("auth.code.wrong"));
        setCode("");
        inputRef.current?.focus();
      } finally {
        setBusy(false);
      }
    },
    [busy, phone, router, shake, t, verifyOtp],
  );

  const onChange = (next: string) => {
    const digits = next.replace(/\D/g, "").slice(0, LENGTH);
    setCode(digits);
    if (error) setError(null);
    if (digits.length === LENGTH) void submit(digits);
  };

  const resend = async () => {
    if (seconds > 0) return;
    try {
      const result = await requestOtp(phone);
      setSeconds(result.cooldownSeconds ?? 60);
      setCode("");
      haptic("light");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t("auth.code.resendFailed"));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
      <KeyboardAvoidingView
        style={{
          flex: 1,
          paddingHorizontal: theme.spacing[6],
          paddingTop: insets.top + theme.spacing[4],
          paddingBottom: insets.bottom + theme.spacing[6],
        }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Touchable
          haptic="selection"
          onPress={() => router.back()}
          accessibilityLabel={t("auth.code.changeNumber")}
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

        <Animated.View entering={FadeInDown.duration(380)} style={{ marginTop: theme.spacing[8] }}>
          <Text variant="title1">{t("auth.code.title")}</Text>
          <Text variant="body" color="textMuted" style={{ marginTop: theme.spacing[2] }}>
            {t("auth.code.sentTo", { phone })}
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(80).duration(380)}
          style={[{ marginTop: theme.spacing[8] }, shakeStyle]}
        >
          <Touchable
            haptic="none"
            scaleTo={1}
            onPress={() => inputRef.current?.focus()}
            accessibilityLabel={t("auth.code.a11yBoxes", { entered: code.length, total: LENGTH })}
            style={{ flexDirection: "row", gap: theme.spacing[2], justifyContent: "space-between" }}
          >
            {Array.from({ length: LENGTH }, (_, i) => {
              const filled = i < code.length;
              const active = i === code.length;
              return (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    height: 58,
                    borderRadius: theme.radii.md,
                    backgroundColor: theme.color.surface,
                    borderWidth: active || filled ? 1.5 : 1,
                    borderColor: error
                      ? theme.color.danger
                      : active
                        ? theme.color.brand
                        : filled
                          ? theme.color.brandBorder
                          : theme.color.border,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text variant="title2" tabular>
                    {code[i] ?? ""}
                  </Text>
                </View>
              );
            })}
          </Touchable>

          {/* One real field, invisible, covering the boxes — so the OS sees a
              single OTP input and can autofill it from the SMS. */}
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={onChange}
            keyboardType="number-pad"
            inputMode="numeric"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            autoFocus
            maxLength={LENGTH}
            caretHidden
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 58,
              opacity: 0,
              color: "transparent",
            }}
          />
        </Animated.View>

        {error && (
          <Animated.View entering={FadeIn.duration(180)}>
            <Text variant="footnote" color="danger" style={{ marginTop: theme.spacing[3] }}>
              {error}
            </Text>
          </Animated.View>
        )}

        {params.devCode ? (
          <Sunken style={{ marginTop: theme.spacing[5], flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
            <Ionicons name="construct-outline" size={16} color={theme.color.textMuted} />
            <Text variant="footnote" color="textSecondary" style={{ flex: 1 }}>
              Development build — no SMS was sent. Your code is{" "}
              <Text variant="footnote" style={{ fontWeight: "700" }} tabular>
                {params.devCode}
              </Text>
              .
            </Text>
          </Sunken>
        ) : null}

        <View style={{ flex: 1 }} />

        <View style={{ gap: theme.spacing[3] }}>
          <Button
            label={t("auth.code.verify")}
            size="lg"
            loading={busy}
            disabled={code.length !== LENGTH}
            onPress={() => submit(code)}
          />
          <Button
            label={seconds > 0 ? t("auth.code.resendIn", { seconds }) : t("auth.code.resend")}
            variant="ghost"
            size="md"
            haptic="selection"
            disabled={seconds > 0}
            onPress={resend}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
