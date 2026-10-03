import * as React from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PRODUCT_IMAGE_LIMIT } from "@gopasal/native-data/seller-catalog";
import { Sunken, Text, Thumb, Touchable, theme, useT } from "@gopasal/native-ui";

/**
 * A product's photographs, as the shopkeeper manages them.
 *
 * ## The first photo is drawn differently because it *is* different
 *
 * The first key in `images` is the product's face on the shelf, in search, in
 * the cart and on the receipt; the others are only seen by somebody who opened
 * the product. A row of equal squares would hide that, so the first photo is
 * drawn large with a label saying customers see it, and "make this the cover"
 * is the first action offered on any other photo.
 *
 * ## Select, then act — not drag
 *
 * Dragging a thumbnail on a phone standing on a counter is a gesture that
 * scrolls the page as often as it moves the photo, and it has no screen-reader
 * equivalent. Tapping a photo selects it and a row of plain buttons appears
 * under it: cover, earlier, later, remove. Every one is a labelled button.
 *
 * This component owns only the selection. What a move or a removal *means* —
 * a local reshuffle before the product exists, or a `PUT` and a hard delete
 * after — is the screen's decision.
 */

export type PhotoTile = {
  /** A storage key for a stored photo; a local id for one not yet sent. */
  id: string;
  /** Null when a stored key did not resolve to a URL. The photo still exists. */
  uri: string | null;
  kind: "stored" | "waiting" | "uploading" | "failed";
  problem?: string | null;
  /** Whether this tile may be moved. Only a contiguous run of movable tiles is reordered. */
  movable: boolean;
};

export function ProductPhotos({
  tiles,
  editable,
  busy = false,
  progress,
  problems,
  onCamera,
  onLibrary,
  onMove,
  onRemove,
  onRetry,
}: {
  tiles: PhotoTile[];
  editable: boolean;
  /** A reorder or removal is in flight; actions are held until it lands. */
  busy?: boolean;
  progress?: { done: number; total: number } | null;
  /** Refusals from the last pick, already translated. */
  problems: string[];
  onCamera: () => void;
  onLibrary: () => void;
  onMove: (from: number, to: number) => void;
  onRemove: (tile: PhotoTile) => void;
  onRetry?: (tile: PhotoTile) => void;
}) {
  const t = useT();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // A selection outlives nothing: once its photo is gone (removed, or replaced by
  // the stored copy after upload) there is nothing for the buttons to act on.
  const selectedIndex = tiles.findIndex((tile) => tile.id === selectedId);
  const selected = selectedIndex >= 0 ? tiles[selectedIndex] : undefined;

  const full = tiles.length >= PRODUCT_IMAGE_LIMIT;
  const [cover, ...rest] = tiles;

  // Every tile between the two ends has to be movable too, or a jump to the
  // front would carry a stored photo past one that has not been uploaded.
  const canMoveTo = (from: number, to: number): boolean => {
    if (from < 0 || to < 0 || to >= tiles.length || from === to) return false;
    const [lo, hi] = from < to ? [from, to] : [to, from];
    return tiles.slice(lo, hi + 1).every((tile) => tile.movable);
  };

  const select = (id: string) => setSelectedId((current) => (current === id ? null : id));

  const tileLabel = (index: number) =>
    index === 0
      ? t("product.photo.a11yCover", { n: 1, count: tiles.length })
      : t("product.photo.a11yTile", { n: index + 1, count: tiles.length });

  return (
    <View style={{ gap: theme.spacing[3] }}>
      <View
        style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}
      >
        <Text variant="caption" color="textMuted">
          {t("product.photo.title")}
        </Text>
        <Text variant="caption" color={full ? "warning" : "textFaint"} tabular>
          {t("product.photo.count", { count: tiles.length, max: PRODUCT_IMAGE_LIMIT })}
        </Text>
      </View>

      {cover ? (
        <Touchable
          haptic="selection"
          scaleTo={0.99}
          onPress={() => select(cover.id)}
          disabled={!editable}
          accessibilityRole="button"
          accessibilityState={{ selected: selected?.id === cover.id }}
          accessibilityLabel={tileLabel(0)}
          style={{
            height: 210,
            borderRadius: theme.radii.xl,
            overflow: "hidden",
            borderWidth: 2,
            borderColor: selected?.id === cover.id ? theme.color.brand : "transparent",
          }}
        >
          <Thumb
            uri={cover.uri}
            size="fill"
            radius={theme.radii.xl}
            fallback={<Ionicons name="image-outline" size={34} color={theme.color.textFaint} />}
          />
          <TileState tile={cover} large />
          <View
            style={{
              position: "absolute",
              left: theme.spacing[3],
              top: theme.spacing[3],
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: theme.spacing[3],
              paddingVertical: 5,
              borderRadius: theme.radii.full,
              backgroundColor: theme.color.surface,
            }}
          >
            <Ionicons name="star" size={12} color={theme.color.accent} />
            <Text variant="caption" color="text">
              {t("product.photo.coverBadge")}
            </Text>
          </View>
        </Touchable>
      ) : (
        <Sunken
          style={{
            height: 150,
            alignItems: "center",
            justifyContent: "center",
            gap: theme.spacing[2],
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: theme.color.borderStrong,
            borderRadius: theme.radii.xl,
          }}
        >
          <Ionicons name="camera-outline" size={30} color={theme.color.textFaint} />
          <Text
            variant="footnote"
            color="textMuted"
            align="center"
            style={{ paddingHorizontal: theme.spacing[6] }}
          >
            {t("product.photo.empty")}
          </Text>
        </Sunken>
      )}

      {rest.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: theme.spacing[2] }}
        >
          {rest.map((tile, i) => {
            const index = i + 1;
            const on = selected?.id === tile.id;
            return (
              <Touchable
                key={tile.id}
                haptic="selection"
                onPress={() => select(tile.id)}
                disabled={!editable}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={tileLabel(index)}
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: theme.radii.lg,
                  overflow: "hidden",
                  borderWidth: 2,
                  borderColor: on ? theme.color.brand : "transparent",
                }}
              >
                <Thumb
                  uri={tile.uri}
                  size="fill"
                  radius={theme.radii.md}
                  fallback={
                    <Ionicons name="image-outline" size={20} color={theme.color.textFaint} />
                  }
                />
                <TileState tile={tile} />
              </Touchable>
            );
          })}
        </ScrollView>
      ) : null}

      {selected && editable ? (
        <View style={{ gap: theme.spacing[2] }}>
          {selected.problem ? (
            <Text variant="caption" color="danger">
              {selected.problem}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] }}>
            {selectedIndex > 0 && canMoveTo(selectedIndex, 0) ? (
              <Chip
                icon="star-outline"
                label={t("product.photo.makeCover")}
                disabled={busy}
                onPress={() => onMove(selectedIndex, 0)}
              />
            ) : null}
            {canMoveTo(selectedIndex, selectedIndex - 1) ? (
              <Chip
                icon="arrow-back"
                label={t("product.photo.earlier")}
                disabled={busy}
                onPress={() => onMove(selectedIndex, selectedIndex - 1)}
              />
            ) : null}
            {canMoveTo(selectedIndex, selectedIndex + 1) ? (
              <Chip
                icon="arrow-forward"
                label={t("product.photo.later")}
                disabled={busy}
                onPress={() => onMove(selectedIndex, selectedIndex + 1)}
              />
            ) : null}
            {selected.kind === "failed" && onRetry ? (
              <Chip
                icon="refresh"
                label={t("common.retry")}
                disabled={busy}
                onPress={() => onRetry(selected)}
              />
            ) : null}
            {selected.kind !== "uploading" ? (
              <Chip
                icon="trash-outline"
                danger
                label={
                  selected.kind === "stored"
                    ? t("product.photo.delete")
                    : t("product.photo.discard")
                }
                disabled={busy}
                onPress={() => {
                  setSelectedId(null);
                  onRemove(selected);
                }}
              />
            ) : null}
          </View>
        </View>
      ) : null}

      {progress ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
          <ActivityIndicator size="small" color={theme.color.brand} />
          <Text variant="caption" color="textSecondary">
            {t("product.photo.uploading", {
              n: Math.min(progress.done + 1, progress.total),
              total: progress.total,
            })}
          </Text>
        </View>
      ) : null}

      {problems.map((problem, i) => (
        <Sunken
          key={i}
          style={{
            flexDirection: "row",
            gap: theme.spacing[2],
            backgroundColor: theme.color.dangerSoft,
          }}
        >
          <Ionicons name="alert-circle" size={15} color={theme.color.danger} />
          <Text variant="caption" color="danger" style={{ flex: 1 }}>
            {problem}
          </Text>
        </Sunken>
      ))}

      {editable ? (
        full ? (
          <Text variant="caption" color="textMuted">
            {t("product.photo.fullNote", { max: PRODUCT_IMAGE_LIMIT })}
          </Text>
        ) : (
          <View style={{ flexDirection: "row", gap: theme.spacing[2] }}>
            <Action icon="camera" primary label={t("product.photo.take")} onPress={onCamera} />
            <Action icon="images-outline" label={t("product.photo.choose")} onPress={onLibrary} />
          </View>
        )
      ) : null}
    </View>
  );
}

function TileState({ tile, large = false }: { tile: PhotoTile; large?: boolean }) {
  if (tile.kind === "stored") return null;
  const failed = tile.kind === "failed";
  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: failed ? theme.color.dangerSoft : theme.color.scrim,
        opacity: failed ? 0.85 : 1,
      }}
    >
      {tile.kind === "uploading" ? (
        <ActivityIndicator size={large ? "large" : "small"} color={theme.color.onBrand} />
      ) : failed ? (
        <Ionicons name="alert-circle" size={large ? 30 : 20} color={theme.color.danger} />
      ) : (
        <Ionicons name="cloud-upload-outline" size={large ? 28 : 18} color={theme.color.onBrand} />
      )}
    </View>
  );
}

function Chip({
  icon,
  label,
  danger = false,
  disabled = false,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Touchable
      haptic={danger ? "warning" : "light"}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        height: 36,
        paddingHorizontal: theme.spacing[3],
        borderRadius: theme.radii.full,
        borderWidth: 1,
        borderColor: danger ? theme.color.dangerSoft : theme.color.border,
        backgroundColor: danger ? theme.color.dangerSoft : theme.color.surface,
      }}
    >
      <Ionicons
        name={icon}
        size={14}
        color={danger ? theme.color.danger : theme.color.textSecondary}
      />
      <Text variant="caption" color={danger ? "danger" : "textSecondary"}>
        {label}
      </Text>
    </Touchable>
  );
}

function Action({
  icon,
  label,
  primary = false,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  primary?: boolean;
  onPress: () => void;
}) {
  return (
    <Touchable
      haptic="light"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flex: 1,
        height: 44,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: theme.spacing[2],
        borderRadius: theme.radii.lg,
        borderWidth: primary ? 0 : 1,
        borderColor: theme.color.border,
        backgroundColor: primary ? theme.color.brandSoft : theme.color.surface,
      }}
    >
      <Ionicons
        name={icon}
        size={17}
        color={primary ? theme.color.brand : theme.color.textSecondary}
      />
      <Text
        variant="callout"
        style={{ color: primary ? theme.color.brand : theme.color.textSecondary }}
      >
        {label}
      </Text>
    </Touchable>
  );
}
