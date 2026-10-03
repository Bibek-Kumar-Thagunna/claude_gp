import * as React from "react";
import * as ImagePicker from "expo-image-picker";
import type { ProductRow } from "@gopasal/native-data/seller";
import {
  PRODUCT_IMAGE_LIMIT,
  imageUploadIssue,
  movePhoto,
  useProductImages,
  type PickedImage,
} from "@gopasal/native-data/seller-catalog";
import { useT } from "@gopasal/native-ui";
import { photoIssueText, writeErrorText } from "./ProductFormModel";

export type PhotoSource = "camera" | "library";

/**
 * Picker settings, chosen for the upload route rather than for the gallery.
 *
 *  - **`quality: 0.7`** re-encodes as JPEG. A twelve-megapixel camera frame at
 *    full quality is routinely 5–8 MB, over the 5 MiB the API accepts; at 0.7 it
 *    is typically 1.5–3 MB and indistinguishable on a product tile. The shop
 *    pays for every byte on a prepaid plan, which is the other half of why.
 *  - **`Compatible` representation** makes iOS hand back a JPEG of a HEIC
 *    library photo instead of the original. HEIC is refused by the API, and an
 *    iPhone camera roll is HEIC by default.
 *  - **Several at once from the library, one at a time from the camera.** The
 *    library is where last week's photos are; the camera is the carton in hand.
 */
async function launch(source: PhotoSource, room: number): Promise<ImagePicker.ImagePickerResult> {
  if (source === "camera") {
    return ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7, exif: false });
  }
  return ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.7,
    exif: false,
    allowsMultipleSelection: room > 1,
    selectionLimit: room,
    orderedSelection: true,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
}

export type PendingPhoto = {
  /** Local only. Never a storage key — the server mints those. */
  id: string;
  image: PickedImage;
  state: "waiting" | "uploading" | "failed";
  problem: string | null;
};

export type PickResult = { accepted: PendingPhoto[]; problems: string[] };

let localSeq = 0;
const localId = () => `local-${Date.now().toString(36)}-${(localSeq += 1)}`;

/**
 * Photos on their way to a product.
 *
 * One queue serves both screens because they differ only in *when* it drains:
 * the create screen collects photos before the product exists (there is no id
 * to upload to until `create` answers), and the editor drains at once.
 *
 * ## Strictly one at a time
 *
 * Parallel uploads would split one bar of uplink between several five-megabyte
 * bodies, and each would then race the upload's sixty-second timeout on its own.
 * They would also race the server's eight-photo check, which reads the count
 * before storing: two uploads sent at seven photos can both be told yes. In
 * sequence, each upload sees the count the previous one left.
 *
 * ## A failure stays on screen
 *
 * A failed upload is kept as a tile marked failed rather than dropped, with the
 * server's reason. The local file is still there to retry, and a photo that
 * silently vanished is one the shopkeeper would assume had been saved.
 */
export function useProductPhotoQueue(shopId: string | null | undefined) {
  const t = useT();
  const images = useProductImages(shopId);
  const [pending, setPending] = React.useState<PendingPhoto[]>([]);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const pendingRef = React.useRef(pending);
  pendingRef.current = pending;

  /**
   * Open the camera or library and queue what comes back.
   *
   * Every photo is checked with `imageUploadIssue` before it joins the queue,
   * counting what is already stored *and* what is already queued, so the ninth
   * photo is refused here and not after a minute of upload.
   */
  const pick = React.useCallback(
    async (source: PhotoSource, storedCount: number): Promise<PickResult> => {
      const room = PRODUCT_IMAGE_LIMIT - storedCount - pendingRef.current.length;
      if (room <= 0) {
        return {
          accepted: [],
          problems: [
            t(
              "product.photo.full",
              { max: PRODUCT_IMAGE_LIMIT },
              "This product already has {max} photos. Remove one first.",
            ),
          ],
        };
      }
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        const denied =
          source === "camera"
            ? t(
                "product.photo.cameraDenied",
                undefined,
                "GoPasal needs camera permission to photograph your products.",
              )
            : t(
                "product.photo.libraryDenied",
                undefined,
                "GoPasal needs permission to open your photos.",
              );
        return { accepted: [], problems: [denied] };
      }

      const picked = await launch(source, room);
      if (picked.canceled) return { accepted: [], problems: [] };

      const problems: string[] = [];
      const accepted: PendingPhoto[] = [];
      let count = storedCount + pendingRef.current.length;
      for (const asset of picked.assets) {
        const issue = imageUploadIssue(asset, count);
        if (issue) {
          problems.push(photoIssueText(t, issue, asset));
          continue;
        }
        accepted.push({ id: localId(), image: asset, state: "waiting", problem: null });
        count += 1;
      }
      if (accepted.length > 0) setPending((list) => [...list, ...accepted]);
      return { accepted, problems };
    },
    [t],
  );

  const discard = React.useCallback((id: string) => {
    setPending((list) => list.filter((p) => p.id !== id));
  }, []);

  const move = React.useCallback((from: number, to: number) => {
    setPending((list) => {
      const order = movePhoto(
        list.map((p) => p.id),
        from,
        to,
      );
      return order.map((id) => list.find((p) => p.id === id)).filter((p): p is PendingPhoto => Boolean(p));
    });
  }, []);

  const clear = React.useCallback(() => setPending([]), []);

  /**
   * Send photos to `productId`, in order: the ones named, or every waiting one.
   *
   * `photos` exists because a screen that uploads straight after `pick` is
   * holding photos this hook's state has not rendered yet. Answers with the last
   * row the server returned, so a screen can show the stored photos without
   * waiting for the shelf to refetch, and with how many did not make it.
   */
  const upload = React.useCallback(
    async (
      productId: string,
      photos?: readonly PendingPhoto[],
    ): Promise<{ row: ProductRow | null; failed: number }> => {
      const queue = photos ?? pendingRef.current.filter((p) => p.state === "waiting");
      let row: ProductRow | null = null;
      let failed = 0;
      setProgress({ done: 0, total: queue.length });
      for (const [i, photo] of queue.entries()) {
        setPending((list) =>
          list.map((p) => (p.id === photo.id ? { ...p, state: "uploading", problem: null } : p)),
        );
        try {
          row = await images.upload.mutateAsync({ productId, image: photo.image });
          setPending((list) => list.filter((p) => p.id !== photo.id));
        } catch (cause) {
          failed += 1;
          const problem = writeErrorText(t, cause);
          setPending((list) =>
            list.map((p) => (p.id === photo.id ? { ...p, state: "failed", problem } : p)),
          );
        }
        setProgress({ done: i + 1, total: queue.length });
      }
      setProgress(null);
      return { row, failed };
    },
    [images.upload, t],
  );

  return {
    pending,
    progress,
    uploading: progress !== null,
    pick,
    discard,
    move,
    clear,
    upload,
    /** Exposed so the editor can remove and reorder stored photos through the same instance. */
    images,
  };
}
