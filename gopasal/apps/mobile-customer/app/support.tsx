import * as React from "react";
import { KeyboardAvoidingView, Linking, Platform, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  useAskAssistant,
  useAssistantSession,
  useCreateTicket,
  useEscalateAssistant,
  useGopasal,
  useTickets,
} from "@gopasal/native-data";
import {
  Button,
  Card,
  ConnectionBanner,
  Logo,
  Skeleton,
  Sunken,
  Text,
  Touchable,
  fontFamily,
  haptic,
  palette,
  theme,
  useT,
} from "@gopasal/native-ui";

/**
 * Help.
 *
 * The first thing on the screen is not a form — it is the advice that solves
 * most problems faster than we can: a question about an order in flight belongs
 * with the shop that is packing it, and they answer in minutes where a ticket
 * takes hours. Sending people to a queue when the shopkeeper is one tap away is
 * a support experience that feels like being handled.
 */
export default function SupportScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useGopasal();

  const tickets = useTickets();
  const create = useCreateTicket();

  const [open, setOpen] = React.useState(false);
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const rows = tickets.data ?? [];

  const submit = async () => {
    setError(null);
    if (subject.trim().length < 3) return setError(t("support.error.subject"));
    if (message.trim().length < 2) return setError(t("support.error.message"));
    try {
      await create.mutateAsync({ subject: subject.trim(), message: message.trim() });
      haptic("success");
      setOpen(false);
      setSubject("");
      setMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("support.error.create"));
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
            <Text variant="title2">{t("support.title")}</Text>
          </View>

          {/* The fastest route first. */}
          <Card style={{ borderColor: theme.color.brandBorder }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: theme.radii.md,
                  backgroundColor: theme.color.brandSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="chatbubble-ellipses" size={19} color={theme.color.brand} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodyStrong">{t("support.order.title")}</Text>
                <Text variant="caption" color="textMuted">
                  {t("support.order.detail")}
                </Text>
              </View>
            </View>
            <Button
              label={t("support.order.cta")}
              variant="secondary"
              onPress={() => router.push("/(tabs)/orders")}
              style={{ marginTop: theme.spacing[4] }}
            />
          </Card>

          {user && <Assistant />}

          {!user ? (
            <Card>
              <Text variant="title3">{t("support.signIn")}</Text>
              <Button
                label={t("common.continue")}
                onPress={() => router.push("/auth/phone")}
                style={{ marginTop: theme.spacing[4] }}
              />
            </Card>
          ) : open ? (
            <Card>
              <Text variant="title3">{t("support.form.title")}</Text>

              <Text variant="caption" color="textMuted" style={{ marginTop: theme.spacing[4] }}>
                {t("support.form.subject")}
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
                  value={subject}
                  onChangeText={setSubject}
                  placeholder={t("support.form.subject.placeholder")}
                  placeholderTextColor={theme.color.textFaint}
                  maxLength={140}
                  accessibilityLabel={t("support.form.subject")}
                  style={{ fontFamily: fontFamily.body, fontSize: 15, color: theme.color.text }}
                />
              </View>

              <Text variant="caption" color="textMuted" style={{ marginTop: theme.spacing[4] }}>
                {t("support.form.message")}
              </Text>
              <View
                style={{
                  marginTop: 6,
                  minHeight: 110,
                  paddingHorizontal: theme.spacing[4],
                  paddingVertical: theme.spacing[3],
                  borderRadius: theme.radii.lg,
                  borderWidth: 1,
                  borderColor: theme.color.border,
                  backgroundColor: theme.color.surfaceSunken,
                }}
              >
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  placeholder={t("support.form.message.placeholder")}
                  placeholderTextColor={theme.color.textFaint}
                  multiline
                  maxLength={4000}
                  accessibilityLabel={t("support.form.message")}
                  style={{
                    fontFamily: fontFamily.body,
                    fontSize: 15,
                    lineHeight: 21,
                    color: theme.color.text,
                    textAlignVertical: "top",
                  }}
                />
              </View>

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
                label={t("support.form.submit")}
                loading={create.isPending}
                onPress={submit}
                style={{ marginTop: theme.spacing[5] }}
              />
              <Button
                label={t("common.cancel")}
                variant="ghost"
                onPress={() => setOpen(false)}
                style={{ marginTop: theme.spacing[2] }}
              />
            </Card>
          ) : (
            <Button
              label={t("support.openTicket")}
              leading={<Ionicons name="add" size={17} color={theme.color.onBrand} />}
              onPress={() => setOpen(true)}
            />
          )}

          {user && (
            <View style={{ gap: theme.spacing[3] }}>
              <Text variant="overline" color="textFaint">
                {t("support.tickets")}
              </Text>

              {tickets.isLoading ? (
                [0, 1].map((i) => (
                  <Skeleton
                    key={i}
                    width="100%"
                    height={72}
                    radius={theme.radii.lg}
                    delay={i * 80}
                  />
                ))
              ) : rows.length === 0 ? (
                <Animated.View entering={FadeIn.duration(240)}>
                  <Text variant="footnote" color="textMuted">
                    {t("support.tickets.empty")}
                  </Text>
                </Animated.View>
              ) : (
                rows.map((ticket, index) => (
                  <Card
                    key={ticket.id}
                    index={index}
                    padded={false}
                    onPress={() =>
                      router.push({ pathname: "/ticket/[id]", params: { id: ticket.id } })
                    }
                  >
                    <View style={{ padding: theme.spacing[4] }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: theme.spacing[2],
                        }}
                      >
                        <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                          {ticket.subject}
                        </Text>
                        <View
                          style={{
                            paddingHorizontal: theme.spacing[2],
                            paddingVertical: 2,
                            borderRadius: theme.radii.full,
                            backgroundColor:
                              ticket.status === "CLOSED"
                                ? theme.color.surfaceSunken
                                : theme.color.successSoft,
                          }}
                        >
                          <Text
                            variant="overline"
                            style={{
                              color:
                                ticket.status === "CLOSED"
                                  ? theme.color.textMuted
                                  : theme.color.success,
                            }}
                          >
                            {t(`support.status.${ticket.status}`, undefined, ticket.status)}
                          </Text>
                        </View>
                      </View>
                      <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                        {ticket.code} ·{" "}
                        {new Date(ticket.createdAt).toLocaleDateString([], {
                          day: "numeric",
                          month: "short",
                        })}
                      </Text>
                    </View>
                  </Card>
                ))
              )}
            </View>
          )}

          <Touchable
            haptic="light"
            onPress={() => Linking.openURL("mailto:hello@gopasal.com")}
            accessibilityLabel={t("support.email.a11y")}
            style={{ alignSelf: "center", padding: theme.spacing[3] }}
          >
            <Text variant="caption" color="textMuted">
              {t("support.email")}
            </Text>
          </Touchable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * The GoPasal assistant.
 *
 * Source-grounded: every answer carries the approved articles it was drawn
 * from, shown as chips under the reply. That is not decoration — it is the
 * difference between an assistant and a plausible-sounding guess, and it lets
 * a customer check the actual policy rather than take a chat bubble's word for
 * what a refund window is.
 *
 * "Talk to a person" attaches the whole transcript to a ticket, so nobody has
 * to retype what they already explained.
 */
function Assistant() {
  const t = useT();
  const session = useAssistantSession();
  const ask = useAskAssistant();
  const escalate = useEscalateAssistant();
  const [draft, setDraft] = React.useState("");
  const data = session.data;
  const messages = data?.messages ?? [];

  const send = async (text: string) => {
    const body = text.trim();
    if (!body || ask.isPending) return;
    setDraft("");
    haptic("light");
    try {
      await ask.mutateAsync({ message: body, sessionId: data?.id });
    } catch {
      setDraft(body);
    }
  };

  const QUICK = [t("support.ai.q.order"), t("support.ai.q.refund"), t("support.ai.q.address")];

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
        <Logo size={26} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="title3">{t("support.ai.title")}</Text>
          <Text variant="caption" color="textMuted">
            {t("support.ai.detail")}
          </Text>
        </View>
      </View>

      {session.isLoading ? (
        <View style={{ gap: theme.spacing[2], marginTop: theme.spacing[4] }}>
          <Skeleton width="70%" height={32} radius={theme.radii.md} />
          <Skeleton width="85%" height={32} radius={theme.radii.md} delay={90} />
        </View>
      ) : messages.length === 0 ? (
        <View style={{ gap: theme.spacing[2], marginTop: theme.spacing[4] }}>
          {QUICK.map((question) => (
            <Touchable
              key={question}
              haptic="selection"
              onPress={() => send(question)}
              accessibilityLabel={question}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing[3],
                padding: theme.spacing[3],
                borderRadius: theme.radii.lg,
                borderWidth: 1,
                borderColor: theme.color.border,
                backgroundColor: theme.color.surfaceSunken,
              }}
            >
              <Ionicons name="help-circle-outline" size={16} color={theme.color.textMuted} />
              <Text variant="callout" color="textSecondary" style={{ flex: 1 }}>
                {question}
              </Text>
            </Touchable>
          ))}
        </View>
      ) : (
        <View style={{ gap: theme.spacing[3], marginTop: theme.spacing[4] }}>
          {messages.map((message) => {
            const mine = message.role === "CUSTOMER";
            return (
              <View
                key={message.id}
                style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "88%" }}
              >
                <View
                  style={{
                    paddingHorizontal: theme.spacing[4],
                    paddingVertical: theme.spacing[3],
                    borderRadius: theme.radii.lg,
                    backgroundColor: mine ? theme.color.brand : theme.color.surfaceSunken,
                    opacity: message.pending ? 0.7 : 1,
                  }}
                >
                  <Text
                    variant="callout"
                    style={{ color: mine ? palette.white : theme.color.text }}
                  >
                    {message.body}
                  </Text>
                </View>

                {(message.sources ?? []).length > 0 && (
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 6,
                      marginTop: 6,
                    }}
                  >
                    {(message.sources ?? []).map((source) => (
                      <View
                        key={source.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          paddingHorizontal: theme.spacing[2],
                          paddingVertical: 3,
                          borderRadius: theme.radii.sm,
                          backgroundColor: theme.color.infoSoft,
                        }}
                      >
                        <Ionicons name="document-text-outline" size={11} color={theme.color.info} />
                        <Text variant="overline" style={{ color: theme.color.info }}>
                          {source.title}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}

          {ask.isPending && (
            <Text variant="caption" color="textFaint">
              {t("support.ai.thinking")}
            </Text>
          )}
        </View>
      )}

      <View style={{ flexDirection: "row", gap: theme.spacing[2], marginTop: theme.spacing[4] }}>
        <View
          style={{
            flex: 1,
            minHeight: 46,
            justifyContent: "center",
            paddingHorizontal: theme.spacing[4],
            borderRadius: theme.radii.lg,
            borderWidth: 1,
            borderColor: theme.color.border,
            backgroundColor: theme.color.surfaceSunken,
          }}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t("support.ai.placeholder")}
            placeholderTextColor={theme.color.textFaint}
            maxLength={1200}
            accessibilityLabel={t("support.ai.input.a11y")}
            style={{ fontFamily: fontFamily.body, fontSize: 15, color: theme.color.text }}
          />
        </View>
        <Button
          label={t("support.ai.ask")}
          full={false}
          loading={ask.isPending}
          disabled={draft.trim().length === 0 || ask.isPending}
          onPress={() => send(draft)}
        />
      </View>

      {data?.ticket ? (
        <Sunken
          style={{ flexDirection: "row", gap: theme.spacing[3], marginTop: theme.spacing[3] }}
        >
          <Ionicons name="person-outline" size={16} color={theme.color.textMuted} />
          <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
            {t("support.ai.escalated", { code: data.ticket.code })}
          </Text>
        </Sunken>
      ) : messages.length > 0 ? (
        <Touchable
          haptic="light"
          onPress={() => data && escalate.mutate(data.id)}
          accessibilityLabel={t("support.ai.escalate")}
          style={{ alignSelf: "center", padding: theme.spacing[3] }}
        >
          <Text variant="caption" color="brand">
            {escalate.isPending ? t("support.ai.escalating") : t("support.ai.escalate")}
          </Text>
        </Touchable>
      ) : null}
    </Card>
  );
}
