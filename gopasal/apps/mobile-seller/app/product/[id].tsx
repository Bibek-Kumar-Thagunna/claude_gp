import * as React from "react";
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import {
  useProductActions,
  useSelectedShop,
  type ProductRow,
  type ProductVariant,
  type ShopProduct,
} from "@gopasal/native-data/seller";
import {
  CATALOG_SCAN_PAGE_LIMIT,
  catalogQk,
  movePhoto,
  productDraftIssues,
  reorderIssue,
  useProductWrites,
  useShopProduct,
  useVariantWrites,
} from "@gopasal/native-data/seller-catalog";
import { useShopPermissions } from "@gopasal/native-data/seller-team";
import {
  Button,
  Card,
  Confirm,
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
import { StockSheet, type StockSubmission } from "../../components/StockSheet";
import { ProductDetails, ProductEssentials } from "../../components/ProductFields";
import {
  formFromProduct,
  hasChanges,
  productPatch,
  productProblems,
  writeErrorText,
  type ProductForm,
} from "../../components/ProductFormModel";
import { ProductHeader } from "../../components/ProductHeader";
import { ProductPhotos, type PhotoTile } from "../../components/ProductPhotos";
import { useProductPhotoQueue, type PhotoSource } from "../../components/ProductPhotoQueue";
import { ProductVariantSheet, type VariantSubmission } from "../../components/ProductVariantSheet";

/**
 * One product, and everything that can be done to it from a phone.
 *
 * ## Nothing here is saved by a thumb brushing past it
 *
 * Every field is a draft until Save is pressed. Saving on blur is the desktop
 * convention and the wrong one on a phone that lives on a counter: a shopkeeper
 * puts the handset down mid-edit, a customer leans over it, and a price that
 * committed on blur is whatever the last keystroke happened to be. The Save bar
 * appears only when something differs, so its presence is itself the "you have
 * unsaved changes" signal.
 *
 * ## Only the boxes that were touched are sent
 *
 * The form remembers the row it was filled from (its *baseline*) and the PATCH
 * is the difference from that, not from whatever the server says now. If a
 * colleague corrects the unit while this form is open, a save here that only
 * changed the price leaves their unit alone — diffing against the fresh row
 * instead would quietly send the old unit back and undo them. When that happens
 * the screen says so, once, above the Save bar.
 *
 * ## Every figure on this screen came back from the server
 *
 * After a write the screen shows the row the API answered with, not what was
 * typed — the two differ whenever the server trims, clamps or refuses, and the
 * shopkeeper is entitled to see which one the shop now carries. The answer is
 * laid over the cached product until the next read supersedes it, so there is
 * no moment where a saved price flicks back to the old one while the shelf
 * refetches.
 *
 * ## Hide is the big button; delete is at the bottom, and says "permanently"
 *
 * `DELETE` removes the row and the stored photos, with no restore. What a
 * shopkeeper almost always means by "take it off" is hiding it, which is one
 * tap to reverse — so that is the prominent control at the top, and deletion
 * sits at the foot of the screen behind a confirmation that offers hiding
 * instead.
 */

const LOW_STOCK_AT = 5;

/** A price that moved by more than this multiple is probably a mistyped digit. */
const PRICE_JUMP = 3;

/**
 * A write's answer, with when it arrived. It outranks the cached product only
 * until a read newer than it lands; after that the read is the truth.
 */
type RowAnswer = { row: ProductRow; at: number };
type VariantAnswer = { id: string; variant: ProductVariant | null; at: number };

/**
 * Pair each storage key with its URL.
 *
 * `imageUrls` is the keys resolved in order but may be *shorter*, when a key no
 * longer resolves — so position is only trusted when the lengths agree. Every
 * key still gets a tile (with no picture when unresolved), because the reorder
 * route wants every key back and the delete route is how a dead one is cleared.
 */
function pairPhotos(
  keys: readonly string[],
  urls: readonly string[],
): { key: string; url: string | null }[] {
  if (keys.length === urls.length) return keys.map((key, i) => ({ key, url: urls[i] ?? null }));
  const unused = [...urls];
  return keys.map((key) => {
    const at = unused.findIndex((url) => url.endsWith(key) || url.endsWith(encodeURI(key)));
    if (at < 0) return { key, url: null };
    const [url] = unused.splice(at, 1);
    return { key, url: url ?? null };
  });
}

function withAnswers(
  base: ShopProduct | null,
  fetchedAt: number,
  row: RowAnswer | null,
  variants: VariantAnswer[],
): ShopProduct | null {
  if (!base) return null;
  let product = base;
  if (row && row.row.id === base.id && row.at > fetchedAt) {
    // A write answers with a bare row — no `variants` — so the options already
    // on screen are kept rather than blanked.
    product = { ...product, ...row.row, variants: product.variants };
  }
  const live = variants.filter((a) => a.at > fetchedAt);
  if (live.length > 0) {
    const list = [...product.variants];
    for (const answer of live) {
      const at = list.findIndex((v) => v.id === answer.id);
      if (answer.variant === null) {
        if (at >= 0) list.splice(at, 1);
      } else if (at >= 0) list[at] = answer.variant;
      else list.push(answer.variant);
    }
    product = { ...product, variants: list };
  }
  return product;
}

export default function ProductEditorScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = String(id ?? "");

  const { shopId, ready } = useSelectedShop();
  const perms = useShopPermissions(shopId);
  const can = (key: string) => perms.ready && perms.has(key);
  const canEdit = can("catalog.edit");
  const canDelete = can("catalog.delete");
  const canCount = can("inventory.adjust");

  const lookup = useShopProduct(shopId, productId);
  const writes = useProductWrites(shopId);
  // A second instance, so hiding the product and saving the form have separate
  // busy states — a Save button that spins because the visibility switch is
  // working reads as the form being saved.
  const visibility = useProductWrites(shopId).edit;
  const variantWrites = useVariantWrites(shopId);
  const photos = useProductPhotoQueue(shopId);
  const { setStock } = useProductActions(shopId);

  const [rowAnswer, setRowAnswer] = React.useState<RowAnswer | null>(null);
  const [variantAnswers, setVariantAnswers] = React.useState<VariantAnswer[]>([]);
  /** `updatedAt`s this screen's own writes produced, so they are not mistaken for a colleague's. */
  const ownStamps = React.useRef(new Set<string>());

  const fetchedAt = lookup.isPlaceholderData ? 0 : lookup.dataUpdatedAt;
  const baseProduct = lookup.data?.product ?? null;
  const product = React.useMemo(
    () => withAnswers(baseProduct, fetchedAt, rowAnswer, variantAnswers),
    [baseProduct, fetchedAt, rowAnswer, variantAnswers],
  );

  const took = React.useCallback((row: ProductRow) => {
    ownStamps.current.add(row.updatedAt);
    setRowAnswer({ row, at: Date.now() });
  }, []);

  /* ── the form ─────────────────────────────────────────────────────────── */

  const [form, setForm] = React.useState<ProductForm | null>(null);
  const [baseline, setBaseline] = React.useState<ProductRow | null>(null);
  const [attempted, setAttempted] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [confirmingPrice, setConfirmingPrice] = React.useState(false);

  const patch = form && baseline ? productPatch(form, baseline) : {};
  const dirty = hasChanges(patch);

  React.useEffect(() => {
    if (!product) return;
    if (baseline && baseline.id === product.id && baseline.updatedAt === product.updatedAt) return;
    const touched = form !== null && baseline !== null && hasChanges(productPatch(form, baseline));
    if (!baseline || baseline.id !== product.id || !touched) {
      setBaseline(product);
      setForm(formFromProduct(product));
      return;
    }
    // Touched, and the row moved underneath. If this screen moved it (a photo,
    // the visibility switch, a count), none of the form's fields changed and the
    // baseline can follow. If somebody else did, the baseline stays where the
    // shopkeeper started, so their untouched boxes are not sent back over the
    // colleague's values.
    if (ownStamps.current.has(product.updatedAt)) setBaseline(product);
  }, [product, baseline, form]);

  const changedElsewhere =
    dirty && product !== null && baseline !== null && product.updatedAt !== baseline.updatedAt;

  const problems = productProblems(t, productDraftIssues(patch, "patch"));
  if (!problems.price && patch.price === 0) {
    // Zero is refused rather than sent: the API would take it and the shop would
    // spend the afternoon giving the thing away.
    problems.price = t("product.priceRequired");
  }
  const shown = attempted ? problems : {};

  const change = (next: Partial<ProductForm>) => {
    setForm((current) => (current ? { ...current, ...next } : current));
    setSaved(false);
    setSaveError(null);
  };

  const commit = async () => {
    if (!product || !dirty) return;
    setSaveError(null);
    try {
      const row = await writes.edit.mutateAsync({ productId: product.id, patch });
      took(row);
      // Reset from the answer, not from the draft. If the server trimmed the
      // name or stored a different number, this is where the shopkeeper finds
      // out rather than believing the box they typed into.
      setBaseline({ ...product, ...row });
      setForm(formFromProduct(row));
      setAttempted(false);
      setSaved(true);
      haptic("success");
    } catch (cause) {
      setSaveError(writeErrorText(t, cause));
      haptic("error");
    }
  };

  const save = () => {
    if (!product || !baseline) return;
    setAttempted(true);
    setSaved(false);
    if (Object.keys(problems).length > 0) {
      haptic("warning");
      return;
    }
    const next = patch.price;
    const jumped =
      next !== undefined &&
      baseline.price > 0 &&
      (next > baseline.price * PRICE_JUMP || next * PRICE_JUMP < baseline.price);
    if (jumped) {
      setConfirmingPrice(true);
      return;
    }
    void commit();
  };

  /* ── visibility ───────────────────────────────────────────────────────── */

  const [visibilityError, setVisibilityError] = React.useState<string | null>(null);
  const setVisible = async (isActive: boolean) => {
    if (!product) return;
    setVisibilityError(null);
    try {
      took(await visibility.mutateAsync({ productId: product.id, patch: { isActive } }));
      haptic(isActive ? "success" : "warning");
    } catch (cause) {
      setVisibilityError(writeErrorText(t, cause));
    }
  };

  /* ── photos ───────────────────────────────────────────────────────────── */

  const [photoProblems, setPhotoProblems] = React.useState<string[]>([]);
  const [removingPhoto, setRemovingPhoto] = React.useState<string | null>(null);

  const sendPhotos = async (target: ShopProduct, list: Parameters<typeof photos.upload>[1]) => {
    const { row } = await photos.upload(target.id, list);
    if (row) took(row);
  };

  const pick = async (source: PhotoSource) => {
    if (!product) return;
    setPhotoProblems([]);
    try {
      const result = await photos.pick(source, product.images.length);
      setPhotoProblems(result.problems);
      if (result.accepted.length > 0) await sendPhotos(product, result.accepted);
    } catch {
      setPhotoProblems([t("common.somethingWrong")]);
    }
  };

  const movePhotoTo = async (from: number, to: number) => {
    if (!product) return;
    const keys = movePhoto(product.images, from, to);
    // Checked here as well as on the server: a reorder that dropped a key is a
    // delete in disguise, and the server's refusal would arrive with no hint why.
    if (reorderIssue(product.images, keys)) return;
    setPhotoProblems([]);
    try {
      took(await photos.images.reorder.mutateAsync({ productId: product.id, keys }));
      haptic("selection");
    } catch (cause) {
      setPhotoProblems([writeErrorText(t, cause)]);
    }
  };

  const deletePhoto = async () => {
    const key = removingPhoto;
    if (!product || !key) return;
    try {
      took(await photos.images.remove.mutateAsync({ productId: product.id, key }));
      setRemovingPhoto(null);
    } catch (cause) {
      setRemovingPhoto(null);
      setPhotoProblems([writeErrorText(t, cause)]);
    }
  };

  /* ── the parent count (unchanged: a signed delta through StockSheet) ──── */

  const [counting, setCounting] = React.useState<ShopProduct | null>(null);
  const [countError, setCountError] = React.useState<string | null>(null);

  const submitCount = async ({ from, to }: StockSubmission) => {
    if (!counting) return;
    setCountError(null);
    try {
      const row = await setStock.mutateAsync({ productId: counting.id, from, to });
      // `setStock` refreshes the shelf but not this screen's own entry, which
      // is keyed apart from the shelf on purpose.
      void qc.invalidateQueries({ queryKey: catalogQk.product(shopId ?? "", counting.id) });
      took(row);
      setCounting(null);
    } catch {
      setCountError(t("common.somethingWrong"));
    }
  };

  /* ── options ──────────────────────────────────────────────────────────── */

  const [sheet, setSheet] = React.useState<{ open: boolean; variant: ProductVariant | null }>({
    open: false,
    variant: null,
  });
  const [variantBusy, setVariantBusy] = React.useState(false);
  const [variantError, setVariantError] = React.useState<string | null>(null);
  const [deletingVariant, setDeletingVariant] = React.useState<ProductVariant | null>(null);
  const [variantDeleteError, setVariantDeleteError] = React.useState<string | null>(null);

  const noteVariant = (variantId: string, variant: ProductVariant | null) =>
    setVariantAnswers((list) => [...list, { id: variantId, variant, at: Date.now() }]);

  const submitVariant = async (submission: VariantSubmission) => {
    if (!product) return;
    setVariantBusy(true);
    setVariantError(null);
    try {
      if (submission.kind === "create") {
        const created = await variantWrites.create.mutateAsync({
          productId: product.id,
          variant: submission.input,
        });
        noteVariant(created.id, created);
        if (!submission.isActive) {
          // `VariantDto` has no `isActive`: every option is born switched on,
          // and switching it off is a second request.
          try {
            const off = await variantWrites.patch.mutateAsync({
              productId: product.id,
              variantId: created.id,
              patch: { isActive: false },
            });
            noteVariant(off.id, off);
          } catch {
            // The option exists now. Reopening it as an *edit* means a retry
            // switches it off instead of creating a second copy.
            setSheet({ open: true, variant: created });
            setVariantError(t("product.variant.createdButOn"));
            return;
          }
        }
      } else {
        if (hasChanges(submission.patch)) {
          const next = await variantWrites.patch.mutateAsync({
            productId: product.id,
            variantId: submission.variantId,
            patch: submission.patch,
          });
          noteVariant(next.id, next);
        }
        if (submission.absoluteStock !== null) {
          const next = await variantWrites.setStock.mutateAsync({
            productId: product.id,
            variantId: submission.variantId,
            absolute: submission.absoluteStock,
          });
          noteVariant(next.id, next);
        }
      }
      setSheet({ open: false, variant: null });
      haptic("success");
    } catch (cause) {
      setVariantError(writeErrorText(t, cause));
      haptic("error");
    } finally {
      setVariantBusy(false);
    }
  };

  const deleteVariant = async () => {
    const variant = deletingVariant;
    if (!product || !variant) return;
    setVariantDeleteError(null);
    try {
      await variantWrites.remove.mutateAsync({ productId: product.id, variantId: variant.id });
      noteVariant(variant.id, null);
      setDeletingVariant(null);
    } catch (cause) {
      setDeletingVariant(null);
      setVariantDeleteError(writeErrorText(t, cause));
    }
  };

  /* ── deleting the product ─────────────────────────────────────────────── */

  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deleted, setDeleted] = React.useState(false);

  const deleteProduct = async () => {
    if (!product) return;
    setDeleteError(null);
    try {
      await writes.remove.mutateAsync(product.id);
      setDeleted(true);
      setConfirmingDelete(false);
      haptic("warning");
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/shelf");
    } catch (cause) {
      setConfirmingDelete(false);
      setDeleteError(writeErrorText(t, cause));
    }
  };

  /* ── states before there is a product ─────────────────────────────────── */

  if (!product || !form || deleted) {
    const answer = lookup.data;
    const looking =
      !ready ||
      !perms.ready ||
      (lookup.isPending && !lookup.isError) ||
      (!answer && lookup.isFetching);
    let body: React.ReactNode;
    if (deleted) {
      body = (
        <Missing
          icon="trash-outline"
          title={t("product.gone.deletedTitle")}
          detail={t("product.gone.deletedDetail")}
        />
      );
    } else if (!shopId && ready) {
      body = (
        <Missing
          icon="storefront-outline"
          title={t("shop.choose.title")}
          detail={t("shop.choose.detail")}
        />
      );
    } else if (looking || (answer?.product && !form)) {
      body = (
        <View style={{ gap: theme.spacing[3] }}>
          <Skeleton width="100%" height={80} radius={theme.radii.xl} />
          <Skeleton width="100%" height={210} radius={theme.radii.xl} />
          <Skeleton width="62%" height={20} />
          <Skeleton width="38%" height={14} />
        </View>
      );
    } else if (lookup.isError) {
      body = (
        <Missing
          icon="cloud-offline-outline"
          title={t("product.gone.errorTitle")}
          detail={writeErrorText(t, lookup.error)}
          action={{ label: t("common.retry"), onPress: () => void lookup.refetch() }}
        />
      );
    } else if (answer?.truncated) {
      // Not "deleted". The scan stopped before the end of a large shelf, and
      // telling a shopkeeper their product is gone when it is merely on page
      // six would send them to re-create it.
      body = (
        <Missing
          icon="search-outline"
          title={t("product.gone.truncatedTitle")}
          detail={t("product.gone.truncatedDetail", {
            count: answer.scannedPages * CATALOG_SCAN_PAGE_LIMIT,
          })}
          action={{ label: t("shelf.title"), onPress: () => router.replace("/(tabs)/shelf") }}
        />
      );
    } else {
      body = (
        <Missing
          icon="help-circle-outline"
          title={t("product.gone.title")}
          detail={t("product.gone.detail")}
          action={{ label: t("shelf.title"), onPress: () => router.replace("/(tabs)/shelf") }}
        />
      );
    }
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.background }}>
        <ConnectionBanner />
        <ProductHeader title={t("product.edit.title")} />
        <View style={{ padding: theme.spacing[4] }}>{body}</View>
      </View>
    );
  }

  /* ── the editor ───────────────────────────────────────────────────────── */

  const live = product.isActive;
  const tracked = product.trackStock;
  const none = tracked && product.stock <= 0;
  const low = tracked && product.stock > 0 && product.stock <= LOW_STOCK_AT;
  const variants = product.variants;

  const stored = pairPhotos(product.images, product.imageUrls);
  const tiles: PhotoTile[] = [
    ...stored.map(({ key, url }): PhotoTile => ({
      id: key,
      uri: url,
      kind: "stored",
      movable: stored.length > 1,
    })),
    ...photos.pending.map((p): PhotoTile => ({
      id: p.id,
      uri: p.image.uri,
      kind: p.state,
      problem: p.problem,
      movable: false,
    })),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
      <ProductHeader
        title={product.name}
        subtitle={live ? product.unit : t("product.visibility.hidden")}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            padding: theme.spacing[4],
            paddingBottom: theme.spacing[10] + (dirty ? 0 : insets.bottom),
            gap: theme.spacing[4],
          }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={lookup.isFetching && !lookup.isPending}
              onRefresh={() => void lookup.refetch()}
              tintColor={theme.color.brand}
            />
          }
        >
          {!canEdit && perms.ready ? (
            <Sunken style={{ flexDirection: "row", gap: theme.spacing[2] }}>
              <Ionicons name="eye-outline" size={15} color={theme.color.textMuted} />
              <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                {perms.restrictionReason ?? t("product.edit.readOnly")}
              </Text>
            </Sunken>
          ) : null}

          {/* Visibility first, and large: it is the thing done most often and
              the safe answer to "take this off the shelf". */}
          <Card>
            <View style={{ gap: theme.spacing[3] }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: live ? theme.color.successSoft : theme.color.surfaceSunken,
                  }}
                >
                  <Ionicons
                    name={live ? "eye" : "eye-off"}
                    size={19}
                    color={live ? theme.color.success : theme.color.textMuted}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="bodyStrong" color={live ? "success" : "textSecondary"}>
                    {live ? t("product.visibility.shown") : t("product.visibility.hidden")}
                  </Text>
                  <Text variant="caption" color="textMuted">
                    {live && tracked && none && variants.length === 0
                      ? t("product.visibility.shownButEmpty")
                      : live
                        ? t("product.visibility.shownDetail")
                        : t("product.visibility.hiddenDetail")}
                  </Text>
                </View>
              </View>
              {canEdit ? (
                <Button
                  label={live ? t("product.visibility.hide") : t("product.visibility.show")}
                  variant={live ? "secondary" : "primary"}
                  haptic={live ? "warning" : "success"}
                  loading={visibility.isPending}
                  leading={
                    <Ionicons
                      name={live ? "eye-off-outline" : "eye-outline"}
                      size={17}
                      color={live ? theme.color.text : theme.color.onBrand}
                    />
                  }
                  onPress={() => void setVisible(!live)}
                />
              ) : null}
              {visibilityError ? (
                <Text variant="footnote" color="danger">
                  {visibilityError}
                </Text>
              ) : null}
            </View>
          </Card>

          <Card>
            <ProductPhotos
              tiles={tiles}
              editable={canEdit}
              busy={
                photos.images.reorder.isPending ||
                photos.images.remove.isPending ||
                photos.uploading
              }
              progress={photos.progress}
              problems={photoProblems}
              onCamera={() => void pick("camera")}
              onLibrary={() => void pick("library")}
              onMove={(from, to) => void movePhotoTo(from, to)}
              onRemove={(tile) => {
                if (tile.kind === "stored") setRemovingPhoto(tile.id);
                else photos.discard(tile.id);
              }}
              onRetry={(tile) => {
                const pending = photos.pending.find((p) => p.id === tile.id);
                if (pending) void sendPhotos(product, [pending]);
              }}
            />
          </Card>

          <Card>
            <View style={{ gap: theme.spacing[4] }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text variant="caption" color="textMuted">
                  {t("product.edit.details")}
                </Text>
                {saved && !dirty ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <Ionicons name="checkmark-circle" size={14} color={theme.color.success} />
                    <Text variant="caption" color="success">
                      {t("product.saved")}
                    </Text>
                  </View>
                ) : null}
              </View>
              <ProductEssentials
                form={form}
                onChange={change}
                problems={shown}
                editable={canEdit}
              />
              <ProductDetails
                form={form}
                onChange={change}
                problems={shown}
                editable={canEdit}
                mode="edit"
              />
            </View>
          </Card>

          <Card>
            <View style={{ gap: theme.spacing[3] }}>
              <Text variant="caption" color="textMuted">
                {t("shelf.setStock")}
              </Text>
              {tracked ? (
                <>
                  <View
                    style={{ flexDirection: "row", alignItems: "baseline", gap: theme.spacing[2] }}
                  >
                    <Text
                      variant="title1"
                      color={none ? "danger" : low ? "warning" : "text"}
                      tabular
                    >
                      {product.stock}
                    </Text>
                    <Text
                      variant="footnote"
                      color={none ? "danger" : low ? "warning" : "textMuted"}
                    >
                      {none
                        ? t("shelf.noneLeft")
                        : low
                          ? t("shelf.lowStock")
                          : t("shelf.stockLeft", { count: product.stock })}
                    </Text>
                  </View>
                  {canCount ? (
                    <Button
                      label={t("shelf.setStock")}
                      variant="secondary"
                      onPress={() => {
                        setCountError(null);
                        setCounting(product);
                      }}
                    />
                  ) : null}
                </>
              ) : (
                <Text variant="footnote" color="textMuted">
                  {t("product.untrackedHere")}
                </Text>
              )}
            </View>
          </Card>

          <Card>
            <View style={{ gap: theme.spacing[3] }}>
              <Text variant="caption" color="textMuted">
                {t("product.variants", { count: variants.length })}
              </Text>
              {variants.length === 0 ? (
                <Text variant="footnote" color="textMuted">
                  {t("product.variant.none")}
                </Text>
              ) : (
                variants.map((variant) => (
                  <VariantRow
                    key={variant.id}
                    variant={variant}
                    editable={canEdit}
                    onPress={() => {
                      setVariantError(null);
                      setSheet({ open: true, variant });
                    }}
                  />
                ))
              )}
              {variantDeleteError ? (
                <Text variant="footnote" color="danger">
                  {variantDeleteError}
                </Text>
              ) : null}
              {canEdit ? (
                <Button
                  label={t("product.variant.add")}
                  variant="secondary"
                  leading={<Ionicons name="add" size={17} color={theme.color.text} />}
                  onPress={() => {
                    setVariantError(null);
                    setSheet({ open: true, variant: null });
                  }}
                />
              ) : null}
            </View>
          </Card>

          {canDelete || (canEdit && live) ? (
            <Card>
              <View style={{ gap: theme.spacing[3] }}>
                <Text variant="caption" color="textMuted">
                  {t("product.remove.title")}
                </Text>
                <Text variant="footnote" color="textSecondary">
                  {t("product.remove.detail")}
                </Text>
                {canEdit && live ? (
                  <Button
                    label={t("product.remove.hideInstead")}
                    variant="secondary"
                    loading={visibility.isPending}
                    onPress={() => void setVisible(false)}
                  />
                ) : null}
                {canDelete ? (
                  <Button
                    label={t("product.remove.delete")}
                    variant="danger"
                    haptic="warning"
                    leading={<Ionicons name="trash-outline" size={16} color={theme.color.danger} />}
                    onPress={() => {
                      setDeleteError(null);
                      setConfirmingDelete(true);
                    }}
                  />
                ) : null}
                {deleteError ? (
                  <Text variant="footnote" color="danger">
                    {deleteError}
                  </Text>
                ) : null}
              </View>
            </Card>
          ) : null}
        </ScrollView>

        {canEdit && (dirty || writes.edit.isPending) ? (
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
            {saveError ? (
              <Text variant="footnote" color="danger" align="center">
                {saveError}
              </Text>
            ) : attempted && Object.keys(problems).length > 0 ? (
              <Text variant="footnote" color="danger" align="center">
                {t("product.fixProblems")}
              </Text>
            ) : changedElsewhere ? (
              <Text variant="caption" color="warning" align="center">
                {t("product.edit.changedElsewhere")}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", gap: theme.spacing[3] }}>
              <View style={{ flex: 1 }}>
                <Button
                  label={t("product.edit.discard")}
                  variant="secondary"
                  disabled={writes.edit.isPending}
                  onPress={() => {
                    // Back to what the shop carries now, which after a colleague's
                    // edit is not the same as what this form started from.
                    setBaseline(product);
                    setForm(formFromProduct(product));
                    setAttempted(false);
                    setSaveError(null);
                  }}
                />
              </View>
              <View style={{ flex: 1.4 }}>
                <Button
                  label={writes.edit.isPending ? t("common.saving") : t("common.save")}
                  onPress={save}
                  loading={writes.edit.isPending}
                />
              </View>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <StockSheet
        product={counting}
        busy={setStock.isPending}
        error={countError}
        onSubmit={(submission) => void submitCount(submission)}
        onClose={() => {
          setCounting(null);
          setCountError(null);
        }}
      />

      <ProductVariantSheet
        open={sheet.open}
        variant={sheet.variant}
        productName={product.name}
        busy={variantBusy}
        error={variantError}
        canDelete={canEdit}
        onSubmit={(submission) => void submitVariant(submission)}
        onDelete={(variant) => {
          setSheet({ open: false, variant: null });
          setVariantDeleteError(null);
          // iOS will not present a modal while another is still being
          // dismissed; the Confirm would simply never appear. A beat's delay
          // lets the sheet leave first.
          setTimeout(() => setDeletingVariant(variant), 300);
        }}
        onClose={() => {
          if (variantBusy) return;
          setSheet({ open: false, variant: null });
          setVariantError(null);
        }}
      />

      {/* A price that jumped by more than a factor of three is usually a digit,
          not a decision. The question names both numbers so the mistake is
          visible in the asking. */}
      <Confirm
        visible={confirmingPrice}
        title={t("product.priceJump.title", { price: (patch.price ?? 0).toLocaleString("en-IN") })}
        message={t("product.priceJump.detail", {
          current: (baseline?.price ?? 0).toLocaleString("en-IN"),
        })}
        confirmLabel={t("common.save")}
        cancelLabel={t("common.cancel")}
        busy={writes.edit.isPending}
        onConfirm={() => {
          setConfirmingPrice(false);
          void commit();
        }}
        onCancel={() => setConfirmingPrice(false)}
      />

      <Confirm
        visible={removingPhoto !== null}
        title={t("product.photo.deleteTitle")}
        message={t("product.photo.deleteDetail")}
        confirmLabel={t("product.photo.delete")}
        cancelLabel={t("product.keep")}
        destructive
        busy={photos.images.remove.isPending}
        onConfirm={() => void deletePhoto()}
        onCancel={() => setRemovingPhoto(null)}
      />

      <Confirm
        visible={deletingVariant !== null}
        title={t("product.variant.deleteTitle", { name: deletingVariant?.name ?? "" })}
        message={t("product.variant.deleteDetail")}
        confirmLabel={t("product.remove.delete")}
        cancelLabel={t("product.keep")}
        destructive
        busy={variantWrites.remove.isPending}
        onConfirm={() => void deleteVariant()}
        onCancel={() => setDeletingVariant(null)}
      />

      <Confirm
        visible={confirmingDelete}
        title={t("product.remove.confirmTitle", { name: product.name })}
        message={t("product.remove.confirmDetail", {
          photos: product.images.length,
          options: variants.length,
        })}
        confirmLabel={t("product.remove.delete")}
        cancelLabel={t("product.keep")}
        destructive
        busy={writes.remove.isPending}
        onConfirm={() => void deleteProduct()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </View>
  );
}

function VariantRow({
  variant,
  editable,
  onPress,
}: {
  variant: ProductVariant;
  editable: boolean;
  onPress: () => void;
}) {
  const t = useT();
  const none = variant.stock <= 0;
  const low = !none && variant.stock <= LOW_STOCK_AT;
  const crossed = variant.mrp != null && variant.mrp > variant.price;

  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3] }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {variant.name}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            gap: theme.spacing[2],
            marginTop: 2,
          }}
        >
          <Price value={variant.price} variant="callout" />
          {crossed ? (
            <Price
              value={variant.mrp ?? 0}
              variant="caption"
              color="textFaint"
              style={{ textDecorationLine: "line-through" }}
            />
          ) : null}
          {variant.sku ? (
            <Text variant="caption" color="textFaint" numberOfLines={1}>
              · {variant.sku}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <Text variant="caption" color={none ? "danger" : low ? "warning" : "textSecondary"} tabular>
          {none ? t("shelf.noneLeft") : t("product.variant.stockTotal", { count: variant.stock })}
        </Text>
        <Text variant="overline" color={variant.isActive ? "success" : "textMuted"}>
          {variant.isActive ? t("product.variant.on") : t("product.variant.off")}
        </Text>
      </View>
      {editable ? (
        <Ionicons name="chevron-forward" size={16} color={theme.color.textFaint} />
      ) : null}
    </View>
  );

  if (!editable) {
    return <Sunken style={{ opacity: variant.isActive ? 1 : 0.6 }}>{body}</Sunken>;
  }
  // The dimming sits on a wrapper: `Touchable` owns its own opacity for the
  // press animation and would overwrite one set in its style.
  return (
    <View style={{ opacity: variant.isActive ? 1 : 0.7 }}>
      <Touchable
        haptic="light"
        dim
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t("product.variant.a11yEdit", {
          name: variant.name,
          count: variant.stock,
        })}
        style={{
          padding: theme.spacing[3],
          borderRadius: theme.radii.md,
          backgroundColor: theme.color.surfaceSunken,
        }}
      >
        {body}
      </Touchable>
    </View>
  );
}

function Missing({
  icon,
  title,
  detail,
  action,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  detail: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={{ alignItems: "center", paddingTop: theme.spacing[10], gap: theme.spacing[3] }}>
      <Ionicons name={icon} size={30} color={theme.color.textFaint} />
      <Text variant="title3" align="center">
        {title}
      </Text>
      <Text variant="footnote" color="textMuted" align="center">
        {detail}
      </Text>
      {action ? (
        <Button label={action.label} variant="secondary" full={false} onPress={action.onPress} />
      ) : null}
    </View>
  );
}
