import * as React from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import {
  useCloseTicket,
  useGopasal,
  useTicket,
  useTicketReply,
  type TicketAttachment,
  type TicketFile,
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
  haptic,
  theme,
  useT,
} from "@gopasal/native-ui";

/**
 * One support ticket, the whole conversation.
 *
 * Before this screen a ticket could be opened and never read again: the list
 * showed the subject and a status, and GoPasal's answers lived only in the
 * console. Now the customer reads the replies, answers them, attaches a photo
 * (a damaged parcel is easier shown than described), and closes the ticket
 * when it is settled.
 */
const MAX_BODY = 4000;

function stamp(iso: string): string {
  return new Date(iso).toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TicketScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ticket = useTicket(id);
  const reply = useTicketReply(id);
  const close = useCloseTicket(id);
  const [draft, setDraft] = React.useState("");
  const [file, setFile] = React.useState<TicketAttachment | null>(null);
  const [confirmClose, setConfirmClose] = React.useState(false);
  const [pickError, setPickError] = React.useState<string | null>(null);
  const scroll = React.useRef<ScrollView>(null);

  const data = ticket.data;
  const closed = data?.status === "CLOSED";
  const body = draft.trim();

  const pick = async (camera: boolean) => {
    setPickError(null);
    const permission = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPickError(camera ? t("ticket.cameraDenied") : t("ticket.libraryDenied"));
      return;
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const type = asset.mimeType ?? "image/jpeg";
    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    setFile({ uri: asset.uri, name: asset.fileName ?? `photo.${ext}`, type });
  };

  const send = () => {
    if (!body || reply.isPending) return;
    reply.mutate(
      { body, file },
      {
        onSuccess: () => {
          haptic("success");
          setDraft("");
          setFile(null);
          setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 120);
        },
      },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
      <View
        style={{
          paddingTop: insets.top + theme.spacing[2],
          paddingBottom: theme.spacing[3],
          paddingHorizontal: theme.spacing[4],
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
        }}
      >
        <Touchable
          haptic="light"
          onPress={() => router.back()}
          accessibilityLabel={t("common.back")}
          style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="arrow-back" size={20} color={theme.color.text} />
        </Touchable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="title3" numberOfLines={1}>
            {data?.subject ?? t("ticket.title")}
          </Text>
          {data ? (
            <Text variant="caption" color="textMuted">
              {data.code} · {t(`support.status.${data.status}`, undefined, data.status)}
            </Text>
          ) : null}
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scroll}
          contentContainerStyle={{
            paddingHorizontal: theme.spacing[4],
            paddingBottom: theme.spacing[6],
            gap: theme.spacing[3],
          }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        >
          {!data
            ? [0, 1, 2].map((i) => (
                <Skeleton key={i} width="80%" height={64} radius={theme.radii.lg} delay={i * 80} />
              ))
            : data.messages.map((message) => (
                <View
                  key={message.id}
                  style={{
                    alignSelf: message.isStaff ? "flex-start" : "flex-end",
                    maxWidth: "86%",
                    gap: theme.spacing[1],
                  }}
                >
                  <Card
                    style={{
                      backgroundColor: message.isStaff
                        ? theme.color.surface
                        : theme.color.brandSoft,
                      borderColor: message.isStaff ? theme.color.border : theme.color.brandBorder,
                      gap: theme.spacing[2],
                    }}
                  >
                    {message.isStaff ? (
                      <Text variant="overline" color="brand">
                        {t("ticket.fromGopasal")}
                      </Text>
                    ) : null}
                    <Text variant="body">{message.body}</Text>
                    {(message.files ?? []).map((f) => (
                      <Attachment key={f.id} ticketId={id} file={f} />
                    ))}
                  </Card>
                  <Text
                    variant="caption"
                    color="textFaint"
                    style={{ alignSelf: message.isStaff ? "flex-start" : "flex-end" }}
                  >
                    {stamp(message.createdAt)}
                  </Text>
                </View>
              ))}

          {closed ? (
            <Sunken style={{ gap: theme.spacing[1] }}>
              <Text variant="bodyStrong">{t("ticket.closed")}</Text>
              <Text variant="footnote" color="textSecondary">
                {t("ticket.closedDetail")}
              </Text>
            </Sunken>
          ) : data ? (
            <Button
              label={t("ticket.close")}
              variant="ghost"
              size="sm"
              full={false}
              onPress={() => setConfirmClose(true)}
              style={{ alignSelf: "center" }}
            />
          ) : null}
        </ScrollView>

        {data && !closed ? (
          <View
            style={{
              paddingHorizontal: theme.spacing[4],
              paddingTop: theme.spacing[3],
              paddingBottom: insets.bottom + theme.spacing[3],
              borderTopWidth: 1,
              borderTopColor: theme.color.border,
              backgroundColor: theme.color.surface,
              gap: theme.spacing[2],
            }}
          >
            {file ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
                <Image
                  source={{ uri: file.uri }}
                  style={{ width: 44, height: 44, borderRadius: theme.radii.md }}
                />
                <Text variant="caption" color="textSecondary" style={{ flex: 1 }} numberOfLines={1}>
                  {file.name}
                </Text>
                <Touchable
                  haptic="light"
                  onPress={() => setFile(null)}
                  accessibilityLabel={t("ticket.removeFile")}
                  style={{ padding: theme.spacing[2] }}
                >
                  <Ionicons name="close-circle" size={20} color={theme.color.textMuted} />
                </Touchable>
              </View>
            ) : null}
            {(pickError ?? (reply.error instanceof Error ? reply.error.message : null)) ? (
              <Text variant="caption" color="danger">
                {pickError ?? (reply.error as Error).message}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: theme.spacing[2] }}>
              <Touchable
                haptic="light"
                onPress={() => void pick(true)}
                accessibilityLabel={t("ticket.takePhoto")}
                style={{ padding: theme.spacing[2] }}
              >
                <Ionicons name="camera-outline" size={22} color={theme.color.textSecondary} />
              </Touchable>
              <Touchable
                haptic="light"
                onPress={() => void pick(false)}
                accessibilityLabel={t("ticket.choosePhoto")}
                style={{ padding: theme.spacing[2] }}
              >
                <Ionicons name="image-outline" size={22} color={theme.color.textSecondary} />
              </Touchable>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={t("ticket.placeholder")}
                placeholderTextColor={theme.color.textFaint}
                accessibilityLabel={t("ticket.placeholder")}
                multiline
                maxLength={MAX_BODY}
                style={{
                  flex: 1,
                  minHeight: 44,
                  maxHeight: 120,
                  paddingHorizontal: theme.spacing[3],
                  paddingVertical: theme.spacing[2],
                  borderRadius: theme.radii.lg,
                  backgroundColor: theme.color.surfaceSunken,
                  color: theme.color.text,
                  fontSize: 16,
                }}
              />
              <Touchable
                haptic="light"
                onPress={send}
                disabled={!body || reply.isPending}
                accessibilityRole="button"
                accessibilityLabel={t("ticket.send")}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: theme.radii.full,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: body ? theme.color.brand : theme.color.surfaceSunken,
                }}
              >
                <Ionicons
                  name={reply.isPending ? "hourglass-outline" : "send"}
                  size={18}
                  color={body ? theme.color.onBrand : theme.color.textFaint}
                />
              </Touchable>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <Confirm
        visible={confirmClose}
        title={t("ticket.closeConfirm")}
        message={t("ticket.closeDetail")}
        confirmLabel={t("ticket.close")}
        cancelLabel={t("common.cancel")}
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          close.mutate(undefined, { onSettled: () => void ticket.refetch() });
        }}
      />
    </View>
  );
}

/** A file on a message: a photo is shown on tap; a PDF is named. */
function Attachment({ ticketId, file }: { ticketId: string; file: TicketFile }) {
  const t = useT();
  const { http } = useGopasal();
  const [uri, setUri] = React.useState<string | null>(null);
  const [state, setState] = React.useState<"idle" | "loading" | "failed">("idle");
  const image = file.mimeType.startsWith("image/");

  const load = async () => {
    setState("loading");
    try {
      const data = await http.requestDataUri(
        `/support/tickets/${encodeURIComponent(ticketId)}/files/${encodeURIComponent(file.id)}`,
      );
      if (!data) return setState("failed");
      setUri(data);
      setState("idle");
    } catch {
      setState("failed");
    }
  };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        resizeMode="cover"
        accessibilityLabel={file.fileName}
        style={{ width: "100%", height: 180, borderRadius: theme.radii.md }}
      />
    );
  }
  return (
    <Touchable
      haptic="light"
      onPress={image ? () => void load() : undefined}
      disabled={!image}
      accessibilityRole={image ? "button" : "text"}
      accessibilityLabel={image ? t("ticket.showPhoto") : file.fileName}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[2],
        padding: theme.spacing[2],
        borderRadius: theme.radii.md,
        backgroundColor: theme.color.surfaceSunken,
      }}
    >
      <Ionicons
        name={image ? "image-outline" : "document-outline"}
        size={17}
        color={theme.color.textMuted}
      />
      <Text variant="caption" color="textSecondary" style={{ flex: 1 }} numberOfLines={1}>
        {state === "loading"
          ? t("ticket.loadingPhoto")
          : state === "failed"
            ? t("ticket.photoFailed")
            : image
              ? t("ticket.showPhoto")
              : file.fileName}
      </Text>
    </Touchable>
  );
}
