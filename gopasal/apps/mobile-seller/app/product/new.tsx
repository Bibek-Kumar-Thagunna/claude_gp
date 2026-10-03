import * as React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View, type TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useSelectedShop } from "@gopasal/native-data/seller";
import { productDraftIssues, useProductWrites } from "@gopasal/native-data/seller-catalog";
import { useShopPermissions } from "@gopasal/native-data/seller-team";
import {
  Button,
  Card,
  ConnectionBanner,
  Price,
  Skeleton,
  Sunken,
  Text,
  Touchable,
  haptic,
  theme,
  useT,
} from "@gopasal/native-ui";
import { ProductDetails, ProductEssentials } from "../../components/ProductFields";
import {
  EMPTY_PRODUCT_FORM,
  createInput,
  productProblems,
  writeErrorText,
  type ProductForm,
} from "../../components/ProductFormModel";
import { ProductHeader } from "../../components/ProductHeader";
import { ProductPhotos, type PhotoTile } from "../../components/ProductPhotos";
import { useProductPhotoQueue, type PhotoSource } from "../../components/ProductPhotoQueue";

/**
 * A new product, while the carton is still on the counter.
 *
 * The screen is built around one measure: how long between opening the box and
 * the product being on sale. So the only things asked up front are the two the
 * API cannot do without — a name and a price — and a photo, because the camera
 * is the reason this is on a phone at all. Everything else `CreateProductDto`
 * takes sits folded under "More details", and a shopkeeper can save without
 * ever opening it.
 *
 * ## Saving empties the form rather than leaving it
 *
 * Stock arrives by the carton, so products are added in runs. After a save the
 * screen stays, says what was saved (with a way to open it), and hands back an
 * empty form with the cursor already in the name box. Navigating to the new
 * product would cost the next one a back-tap and a trip to the shelf.
 *
 * ## Photos wait for the product
 *
 * There is nothing to upload a photo *to* until `create` answers with an id —
 * `CreateProductDto` has no image field, deliberately. So photos taken here are
 * held on the phone, checked against the upload rules as they are picked, and
 * sent in order the moment the product exists. Uploading is `catalog.edit`, not
 * `catalog.create`, so a teammate who may add but not edit is not offered a
 * camera that would be refused.
 */

/** Fields that live under "More details", so a problem in one can unfold it. */
const DETAIL_FIELDS = [
  "nameNp",
  "description",
  "categoryId",
  "mrp",
  "unit",
  "tags",
  "stock",
] as const;

type SavedNote = { id: string; name: string; price: number; failedPhotos: number };

export default function NewProductScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { shopId, shop, ready } = useSelectedShop();
  const perms = useShopPermissions(shopId);
  const canCreate = perms.ready && perms.has("catalog.create");
  const canPhotograph = perms.ready && perms.has("catalog.edit");

  const { create } = useProductWrites(shopId);
  const photos = useProductPhotoQueue(shopId);

  const [form, setForm] = React.useState<ProductForm>(EMPTY_PRODUCT_FORM);
  const [attempted, setAttempted] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [photoProblems, setPhotoProblems] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState<SavedNote | null>(null);
  const nameRef = React.useRef<TextInput>(null);
  const scrollRef = React.useRef<ScrollView>(null);
  const refocus = React.useRef(false);

  // The name box is read-only while a save runs, and focusing a read-only box
  // does nothing — so the cursor goes back only once the form is live again.
  React.useEffect(() => {
    if (saving || !refocus.current) return;
    refocus.current = false;
    nameRef.current?.focus();
  }, [saving]);

  const input = createInput(form);
  const problems = productProblems(t, productDraftIssues(input, "create"));
  if (!problems.price && input.price === 0) {
    // The API accepts a zero price and the shop would then give the thing away.
    // Same refusal, same words, as the editor.
    problems.price = t("product.priceRequired");
  }
  // Problems are held back until the first Save. Shouting "give it a name" at an
  // empty form that was opened a second ago is noise, not help.
  const shown = attempted ? problems : {};

  const change = (patch: Partial<ProductForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    setError(null);
  };

  const pick = async (source: PhotoSource) => {
    setPhotoProblems([]);
    try {
      const result = await photos.pick(source, 0);
      setPhotoProblems(result.problems);
    } catch {
      setPhotoProblems([t("common.somethingWrong")]);
    }
  };

  const save = async () => {
    setAttempted(true);
    setError(null);
    if (Object.keys(problems).length > 0) {
      if (DETAIL_FIELDS.some((field) => problems[field])) setMoreOpen(true);
      haptic("warning");
      return;
    }
    setSaving(true);
    try {
      const row = await create.mutateAsync(input);
      const { failed } =
        canPhotograph && photos.pending.length > 0 ? await photos.upload(row.id) : { failed: 0 };
      photos.clear();
      setSaved({ id: row.id, name: row.name, price: row.price, failedPhotos: failed });
      setForm(EMPTY_PRODUCT_FORM);
      setAttempted(false);
      setPhotoProblems([]);
      haptic("success");
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      refocus.current = true;
    } catch (cause) {
      setError(writeErrorText(t, cause));
      haptic("error");
    } finally {
      setSaving(false);
    }
  };

  const tiles: PhotoTile[] = photos.pending.map((p) => ({
    id: p.id,
    uri: p.image.uri,
    kind: p.state,
    problem: p.problem,
    movable: p.state === "waiting",
  }));

  if (!ready || !perms.ready) {
    return (
      <Shell>
        <View style={{ padding: theme.spacing[4], gap: theme.spacing[3] }}>
          <Skeleton width="100%" height={50} radius={theme.radii.lg} />
          <Skeleton width="100%" height={50} radius={theme.radii.lg} />
          <Skeleton width="100%" height={150} radius={theme.radii.xl} />
        </View>
      </Shell>
    );
  }

  if (!shopId || !canCreate) {
    return (
      <Shell>
        <View
          style={{
            alignItems: "center",
            padding: theme.spacing[6],
            paddingTop: theme.spacing[10],
            gap: theme.spacing[3],
          }}
        >
          <Ionicons name="lock-closed-outline" size={30} color={theme.color.textFaint} />
          <Text variant="title3" align="center">
            {!shopId ? t("shop.choose.title") : t("product.new.locked.title")}
          </Text>
          <Text variant="footnote" color="textMuted" align="center">
            {!shopId
              ? t("shop.choose.detail")
              : (perms.restrictionReason ?? t("product.new.locked.detail"))}
          </Text>
          <Button
            label={t("common.back")}
            variant="secondary"
            full={false}
            onPress={() => router.back()}
          />
        </View>
      </Shell>
    );
  }

  const busyLabel = photos.progress
    ? t("product.photo.uploading", {
        n: Math.min(photos.progress.done + 1, photos.progress.total),
        total: photos.progress.total,
      })
    : t("common.saving");

  return (
    <Shell subtitle={shop?.name ?? null}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: theme.spacing[4],
            paddingBottom: theme.spacing[8],
            gap: theme.spacing[4],
          }}
        >
          {saved ? (
            <Animated.View entering={FadeIn.duration(180)}>
              <Sunken
                style={{
                  backgroundColor: theme.color.successSoft,
                  padding: theme.spacing[4],
                  gap: theme.spacing[3],
                }}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "flex-start", gap: theme.spacing[3] }}
                >
                  <Ionicons name="checkmark-circle" size={22} color={theme.color.success} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text variant="bodyStrong" color="success" numberOfLines={2}>
                      {t("product.new.saved.title", { name: saved.name })}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "baseline",
                        gap: theme.spacing[2],
                      }}
                    >
                      <Price value={saved.price} variant="callout" color="textSecondary" />
                      <Text variant="caption" color="textSecondary">
                        {t("product.new.saved.detail")}
                      </Text>
                    </View>
                    {saved.failedPhotos > 0 ? (
                      <Text
                        variant="caption"
                        color="danger"
                        style={{ marginTop: theme.spacing[1] }}
                      >
                        {t("product.new.saved.photosFailed", { count: saved.failedPhotos })}
                      </Text>
                    ) : null}
                  </View>
                  <Touchable
                    haptic="light"
                    onPress={() => setSaved(null)}
                    accessibilityRole="button"
                    accessibilityLabel={t("common.close")}
                    style={{ padding: 4 }}
                  >
                    <Ionicons name="close" size={18} color={theme.color.textMuted} />
                  </Touchable>
                </View>
                <Button
                  label={t("product.new.saved.open")}
                  variant="secondary"
                  size="sm"
                  onPress={() =>
                    router.push({ pathname: "/product/[id]", params: { id: saved.id } })
                  }
                />
              </Sunken>
            </Animated.View>
          ) : null}

          <Card>
            <ProductEssentials
              form={form}
              onChange={change}
              problems={shown}
              editable={!saving}
              autoFocus
              nameRef={nameRef}
            />
          </Card>

          {canPhotograph ? (
            <Card>
              <ProductPhotos
                tiles={tiles}
                editable={!saving}
                progress={photos.progress}
                problems={photoProblems}
                onCamera={() => void pick("camera")}
                onLibrary={() => void pick("library")}
                onMove={photos.move}
                onRemove={(tile) => photos.discard(tile.id)}
              />
            </Card>
          ) : null}

          <Card padded={false}>
            <Touchable
              haptic="selection"
              onPress={() => setMoreOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: moreOpen }}
              accessibilityLabel={t("product.new.more")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing[3],
                padding: theme.spacing[4],
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodyStrong">{t("product.new.more")}</Text>
                <Text variant="caption" color="textMuted">
                  {t("product.new.moreDetail")}
                </Text>
              </View>
              <Ionicons
                name={moreOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color={theme.color.textMuted}
              />
            </Touchable>
            {moreOpen ? (
              <View
                style={{ paddingHorizontal: theme.spacing[4], paddingBottom: theme.spacing[4] }}
              >
                <ProductDetails
                  form={form}
                  onChange={change}
                  problems={shown}
                  editable={!saving}
                  mode="create"
                />
              </View>
            ) : null}
          </Card>
        </ScrollView>

        <View
          style={{
            paddingHorizontal: theme.spacing[4],
            paddingTop: theme.spacing[3],
            paddingBottom: insets.bottom + theme.spacing[3],
            backgroundColor: theme.color.surface,
            borderTopWidth: 1,
            borderTopColor: theme.color.border,
            gap: theme.spacing[2],
          }}
        >
          {error ? (
            <Text variant="footnote" color="danger" align="center">
              {error}
            </Text>
          ) : attempted && Object.keys(problems).length > 0 ? (
            <Text variant="footnote" color="danger" align="center">
              {t("product.fixProblems")}
            </Text>
          ) : null}
          <Button
            label={
              saving
                ? busyLabel
                : photos.pending.length > 0
                  ? t("product.new.saveWithPhotos", { count: photos.pending.length })
                  : t("product.new.save")
            }
            onPress={() => void save()}
            loading={saving && !photos.progress}
            disabled={saving}
            size="lg"
          />
        </View>
      </KeyboardAvoidingView>
    </Shell>
  );
}

function Shell({ subtitle, children }: { subtitle?: string | null; children: React.ReactNode }) {
  const t = useT();
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
      <ProductHeader title={t("product.new.title")} subtitle={subtitle} />
      {children}
    </View>
  );
}
