import * as React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ApplicationDraftHandle } from "@gopasal/native-data/seller-onboarding";
import { ConnectionBanner, Sunken, Text, Touchable, theme, useT } from "@gopasal/native-ui";

/**
 * The frame every registration step sits in.
 *
 * It exists for one thing the steps must not each reinvent: **saying whether
 * the typing is safe.** The draft autosaves, which is the right behaviour and
 * also an invisible one — a shopkeeper who has typed their PAN number and is
 * about to put the phone in a drawer has no way to know it went anywhere.
 *
 * So the header carries the save state, honestly and in three words:
 *
 *  - saving, while a request is in the air;
 *  - saved, with the tick, once the server has it;
 *  - a warning, if the last save failed — and this is the important one,
 *    because the alternative is a form that has quietly stopped working while
 *    continuing to accept input.
 *
 * There is no Continue button. Back is the only way out, and it is always safe.
 */
export function RegisterShell({
  title,
  subtitle,
  draft,
  children,
}: {
  title: string;
  subtitle?: string;
  draft: ApplicationDraftHandle;
  children: React.ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Flush before leaving rather than trusting the debounce to beat the
  // navigation. `save()` is awaitable for exactly this.
  const leave = React.useCallback(() => {
    void draft.save().finally(() => router.back());
  }, [draft, router]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing[3],
            paddingHorizontal: theme.spacing[4],
            paddingTop: insets.top + theme.spacing[2],
            paddingBottom: theme.spacing[3],
          }}
        >
          <Touchable
            haptic="light"
            onPress={leave}
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="arrow-back" size={20} color={theme.color.text} />
          </Touchable>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="title3" numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          <SaveState draft={draft} />
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: theme.spacing[4],
            paddingBottom: insets.bottom + theme.spacing[12],
            gap: theme.spacing[5],
          }}
          keyboardShouldPersistTaps="handled"
        >
          {draft.readOnly ? (
            <Sunken style={{ flexDirection: "row", gap: theme.spacing[3] }}>
              <Ionicons name="lock-closed-outline" size={16} color={theme.color.textMuted} />
              <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                {t("register.readOnly")}
              </Text>
            </Sunken>
          ) : null}

          {draft.error ? (
            <Sunken
              style={{
                flexDirection: "row",
                gap: theme.spacing[3],
                backgroundColor: theme.color.dangerSoft,
              }}
            >
              <Ionicons name="cloud-offline-outline" size={16} color={theme.color.danger} />
              <Text variant="caption" style={{ color: theme.color.danger, flex: 1 }}>
                {/* Named as a *saving* failure rather than a generic error: the
                    shopkeeper's next question is "did I lose what I typed", and
                    the answer is no — it is still on the screen and will go the
                    next time this succeeds. */}
                {t("register.saveFailed")}
              </Text>
            </Sunken>
          ) : null}

          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function SaveState({ draft }: { draft: ApplicationDraftHandle }) {
  const t = useT();

  if (draft.readOnly) return null;

  if (draft.saving) {
    return (
      <Text variant="caption" color="textMuted">
        {t("register.saving")}
      </Text>
    );
  }

  if (draft.error) {
    return <Ionicons name="alert-circle" size={17} color={theme.color.danger} />;
  }

  if (draft.dirty) {
    // Typed, not yet sent. Deliberately not called "unsaved": it is about to
    // be saved, and alarming somebody about a state that resolves in a second
    // is how a form teaches people to distrust it.
    return (
      <Text variant="caption" color="textFaint">
        {t("register.pending")}
      </Text>
    );
  }

  if (draft.savedAt !== null) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Ionicons name="checkmark" size={14} color={theme.color.success} />
        <Text variant="caption" style={{ color: theme.color.success }}>
          {t("register.saved")}
        </Text>
      </View>
    );
  }

  return null;
}
