import * as React from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import {
  applicationStanding,
  useApplication,
  useRemoveApplicationDocument,
  useUploadApplicationDocument,
  DOCUMENT_MAX_BYTES,
  type ApplicationDocument,
  type DocumentKind,
} from "@gopasal/native-data/seller-onboarding";
import {
  Card,
  Confirm,
  ConnectionBanner,
  Sunken,
  Text,
  Touchable,
  haptic,
  theme,
  useT,
} from "@gopasal/native-ui";

/**
 * The papers, photographed.
 *
 * This is the step that makes registering on a phone better than registering on
 * a laptop, and the reason is mundane: the certificates are in a drawer in the
 * shop, and the phone is already in the shop with a camera in it. On a desktop
 * this same step means finding a scanner, or emailing yourself a photo taken on
 * the phone anyway.
 *
 * So the camera is the primary action on every row, not an option behind a
 * menu. Choosing from the gallery is there for the papers already photographed
 * last month.
 *
 * **The checks happen before the bytes leave.** `checkDocumentPick` inside the
 * upload hook refuses an over-size or wrong-type file up front, which matters
 * on a prepaid connection: finding out a 14 MB photo was too big *after*
 * uploading it costs real money in a country where data is bought in packets.
 */

/**
 * The documents GoPasal asks for, in the order a shopkeeper can produce them.
 *
 * Citizenship first because it is in their pocket; the shopfront photo last
 * because it needs them to step outside. `OTHER` is deliberately absent — it is
 * a reviewer's escape hatch for something they asked for by name, not a row to
 * offer unprompted.
 */
const KINDS: {
  kind: DocumentKind;
  labelKey: string;
  labelEn: string;
  hintKey: string;
  hintEn: string;
}[] = [
  {
    kind: "CITIZENSHIP_FRONT",
    labelKey: "register.doc.CITIZENSHIP_FRONT",
    labelEn: "Citizenship — front",
    hintKey: "register.doc.citizenship.hint",
    hintEn: "The side with your photograph",
  },
  {
    kind: "CITIZENSHIP_BACK",
    labelKey: "register.doc.CITIZENSHIP_BACK",
    labelEn: "Citizenship — back",
    hintKey: "register.doc.citizenshipBack.hint",
    hintEn: "The reverse side",
  },
  {
    kind: "PAN_CERTIFICATE",
    labelKey: "register.doc.PAN_CERTIFICATE",
    labelEn: "PAN certificate",
    hintKey: "register.doc.pan.hint",
    hintEn: "Your business PAN document",
  },
  {
    kind: "VAT_CERTIFICATE",
    labelKey: "register.doc.VAT_CERTIFICATE",
    labelEn: "VAT certificate",
    hintKey: "register.doc.vat.hint",
    hintEn: "Only if you are VAT registered",
  },
  {
    kind: "BUSINESS_LICENCE",
    labelKey: "register.doc.BUSINESS_LICENCE",
    labelEn: "Business licence",
    hintKey: "register.doc.licence.hint",
    hintEn: "Your registration certificate",
  },
  {
    kind: "REGULATORY_LICENCE",
    labelKey: "register.doc.REGULATORY_LICENCE",
    labelEn: "Regulatory licence",
    hintKey: "register.doc.regulatory.hint",
    hintEn: "If you sell medicines or anything licensed",
  },
  {
    kind: "BANK_PROOF",
    labelKey: "register.doc.BANK_PROOF",
    labelEn: "Bank proof",
    hintKey: "register.doc.bank.hint",
    hintEn: "A passbook page or a cheque, showing the account number",
  },
  {
    kind: "OWNER_PHOTO",
    labelKey: "register.doc.OWNER_PHOTO",
    labelEn: "Your photograph",
    hintKey: "register.doc.owner.hint",
    hintEn: "A clear photo of your face",
  },
  {
    kind: "SHOP_PHOTO",
    labelKey: "register.doc.SHOP_PHOTO",
    labelEn: "Your shopfront",
    hintKey: "register.doc.shop.hint",
    hintEn: "Stand across the road so the whole front and the sign are in it",
  },
];

export default function RegisterDocumentsStep() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const application = useApplication(id ?? null).data ?? null;
  const upload = useUploadApplicationDocument(id ?? null);
  const remove = useRemoveApplicationDocument(id ?? null);

  const [busyKind, setBusyKind] = React.useState<DocumentKind | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = React.useState<ApplicationDocument | null>(null);

  const standing = application ? applicationStanding(application) : null;
  const readOnly = standing ? !standing.editable : true;
  const documents = application?.documents ?? [];

  const latestFor = (kind: DocumentKind): ApplicationDocument | null =>
    documents.filter((d) => d.kind === kind).at(-1) ?? null;

  const send = async (kind: DocumentKind, from: "camera" | "library") => {
    setError(null);
    setBusyKind(kind);
    try {
      const permission =
        from === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError(
          from === "camera" ? t("register.doc.cameraDenied") : t("register.doc.libraryDenied"),
        );
        return;
      }

      const picked =
        from === "camera"
          ? await ImagePicker.launchCameraAsync({ quality: 0.8, exif: false })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              quality: 0.8,
              exif: false,
            });

      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (!asset) return;

      await upload.mutateAsync({
        kind,
        file: {
          uri: asset.uri,
          name: asset.fileName ?? null,
          mimeType: asset.mimeType ?? null,
          size: asset.fileSize ?? null,
        },
      });
      haptic("success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("common.somethingWrong"));
    } finally {
      setBusyKind(null);
    }
  };

  const drop = async () => {
    const doc = confirmRemove;
    if (!doc) return;
    setConfirmRemove(null);
    setError(null);
    try {
      await remove.mutateAsync(doc.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("common.somethingWrong"));
    }
  };

  const megabytes = Math.floor(DOCUMENT_MAX_BYTES / (1024 * 1024));

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
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
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="arrow-back" size={20} color={theme.color.text} />
        </Touchable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="title3" numberOfLines={1}>
            {t("register.step.documents")}
          </Text>
          {application ? (
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {application.reference}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing[4],
          paddingBottom: insets.bottom + theme.spacing[12],
          gap: theme.spacing[3],
        }}
      >
        <Sunken style={{ flexDirection: "row", gap: theme.spacing[3] }}>
          <Ionicons name="camera-outline" size={16} color={theme.color.textMuted} />
          <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
            {t("register.doc.intro", { megabytes })}
          </Text>
        </Sunken>

        {error ? (
          <Sunken
            style={{
              flexDirection: "row",
              gap: theme.spacing[3],
              backgroundColor: theme.color.dangerSoft,
            }}
          >
            <Ionicons name="alert-circle" size={16} color={theme.color.danger} />
            <Text variant="caption" style={{ color: theme.color.danger, flex: 1 }}>
              {error}
            </Text>
          </Sunken>
        ) : null}

        {KINDS.map((row) => {
          const doc = latestFor(row.kind);
          const required = standing?.blockers.documents.includes(row.kind) ?? false;
          const rejected = standing?.rejectedDocuments.find((r) => r.kind === row.kind) ?? null;
          return (
            <DocumentRow
              key={row.kind}
              label={t(row.labelKey, undefined, row.labelEn)}
              hint={t(row.hintKey, undefined, row.hintEn)}
              document={doc}
              required={required}
              rejectedReason={rejected?.reason ?? null}
              busy={busyKind === row.kind}
              readOnly={readOnly}
              onCamera={() => void send(row.kind, "camera")}
              onLibrary={() => void send(row.kind, "library")}
              onRemove={doc ? () => setConfirmRemove(doc) : undefined}
            />
          );
        })}
      </ScrollView>

      <Confirm
        visible={confirmRemove !== null}
        title={t("register.doc.remove.title")}
        message={t("register.doc.remove.detail")}
        confirmLabel={t("register.doc.remove.yes")}
        cancelLabel={t("common.notNow")}
        destructive
        busy={remove.isPending}
        onConfirm={drop}
        onCancel={() => setConfirmRemove(null)}
      />
    </View>
  );
}

function DocumentRow({
  label,
  hint,
  document,
  required,
  rejectedReason,
  busy,
  readOnly,
  onCamera,
  onLibrary,
  onRemove,
}: {
  label: string;
  hint: string;
  document: ApplicationDocument | null;
  required: boolean;
  rejectedReason: string | null;
  busy: boolean;
  readOnly: boolean;
  onCamera: () => void;
  onLibrary: () => void;
  onRemove?: () => void;
}) {
  const t = useT();
  const held = document !== null && !rejectedReason;

  return (
    <Card style={{ gap: theme.spacing[3] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: theme.radii.md,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: rejectedReason
              ? theme.color.dangerSoft
              : held
                ? theme.color.successSoft
                : theme.color.surfaceSunken,
          }}
        >
          <Ionicons
            name={rejectedReason ? "close" : held ? "checkmark" : "document-outline"}
            size={17}
            color={
              rejectedReason
                ? theme.color.danger
                : held
                  ? theme.color.success
                  : theme.color.textMuted
            }
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
            <Text variant="callout" numberOfLines={1} style={{ flexShrink: 1 }}>
              {label}
            </Text>
            {required ? (
              <Text variant="overline" style={{ color: theme.color.danger }}>
                {t("register.doc.needed")}
              </Text>
            ) : null}
          </View>
          <Text variant="caption" color="textMuted">
            {/* The reviewer's reason replaces the hint: somebody re-photographing
                a rejected paper needs to know what was wrong with the last one,
                not to be told again what the paper is. */}
            {rejectedReason ?? hint}
          </Text>
        </View>
      </View>

      {document ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
          {/* An icon, not a thumbnail.

              The stored file is behind an authenticated route, so rendering it
              would mean fetching every document's bytes to draw nine 46-point
              squares — on a connection the shopkeeper is paying for, to show
              them a photograph they took themselves thirty seconds ago. The
              icon plus the filename answers the only question this row is
              asked: is it sent. */}
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: theme.radii.md,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.color.surfaceSunken,
            }}
          >
            <Ionicons
              name={
                document.mimeType?.startsWith("image/") ? "image-outline" : "document-text-outline"
              }
              size={20}
              color={theme.color.textMuted}
            />
          </View>
          <Text variant="caption" color="textSecondary" style={{ flex: 1, minWidth: 0 }}>
            {document.fileName ?? t("register.doc.sent")}
          </Text>
          {!readOnly && onRemove ? (
            <Touchable
              haptic="warning"
              onPress={onRemove}
              accessibilityRole="button"
              accessibilityLabel={t("register.doc.a11yRemove", { label })}
              style={{ padding: theme.spacing[2] }}
            >
              <Ionicons name="trash-outline" size={17} color={theme.color.danger} />
            </Touchable>
          ) : null}
        </View>
      ) : null}

      {!readOnly ? (
        <View style={{ flexDirection: "row", gap: theme.spacing[2] }}>
          <Action
            icon="camera"
            label={document ? t("register.doc.retake") : t("register.doc.take")}
            primary
            busy={busy}
            onPress={onCamera}
          />
          <Action
            icon="images-outline"
            label={t("register.doc.choose")}
            busy={busy}
            onPress={onLibrary}
          />
        </View>
      ) : null}
    </Card>
  );
}

function Action({
  icon,
  label,
  primary = false,
  busy,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  primary?: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Touchable
      haptic="light"
      disabled={busy}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flex: 1,
        height: 40,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: theme.spacing[2],
        borderRadius: theme.radii.lg,
        borderWidth: primary ? 0 : 1,
        borderColor: theme.color.border,
        backgroundColor: primary ? theme.color.brandSoft : theme.color.surface,
        opacity: busy ? 0.6 : 1,
      }}
    >
      <Ionicons
        name={icon}
        size={16}
        color={primary ? theme.color.brand : theme.color.textSecondary}
      />
      <Text
        variant="caption"
        style={{ color: primary ? theme.color.brand : theme.color.textSecondary }}
      >
        {label}
      </Text>
    </Touchable>
  );
}
