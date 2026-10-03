import * as React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import {
  useAddressMutations,
  useAddresses,
  useGopasal,
  useDeliveryPoint,
  useResolvePlace,
  useSuggestPlaces,
  type PlaceSuggestion,
  type Address,
  type AddressInput,
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
  fontFamily,
  haptic,
  palette,
  theme,
  useT,
} from "@gopasal/native-ui";

/**
 * The address book, and the form that fills it.
 *
 * The important decision here is that **the GPS fix is the primary way to set a
 * location, not a convenience button**. Most of Nepal is addressed informally —
 * "behind the Himalayan bakery, third gate" is a real address and no geocoder
 * knows it — so a pin the customer placed while standing there is both more
 * accurate than a search result and free, where autocomplete is the Pro-tier
 * SKU with the smallest monthly allowance of anything we call.
 * See `docs/maps-cost-policy.md`.
 *
 * The default path calls no map API at all: the fix comes from the device, the
 * words come from the customer, and both are stored once so every future order
 * to this address costs nothing.
 *
 * Search is the second path, behind a tap, for the address you are not standing
 * at — a parent's flat, an office you are sending lunch to. It is debounced,
 * needs three characters and caches for an hour, so the credit is spent on a
 * decision rather than on typing.
 */

const LABELS = ["Home", "Work", "Other"] as const;

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  maxLength,
  multiline,
  autoCapitalize,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "phone-pad";
  maxLength?: number;
  multiline?: boolean;
  autoCapitalize?: "none" | "words" | "sentences";
  hint?: string;
}) {
  const [focused, setFocused] = React.useState(false);
  return (
    <View>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <View
        style={{
          marginTop: 6,
          borderRadius: theme.radii.lg,
          borderWidth: 1,
          borderColor: focused ? theme.color.brandBorder : theme.color.border,
          backgroundColor: focused ? theme.color.surface : theme.color.surfaceSunken,
          paddingHorizontal: theme.spacing[4],
          minHeight: multiline ? 76 : 48,
          justifyContent: "center",
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.color.textFaint}
          keyboardType={keyboardType}
          maxLength={maxLength}
          multiline={multiline}
          autoCapitalize={autoCapitalize ?? "sentences"}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          style={{
            fontFamily: fontFamily.body,
            fontSize: 15,
            lineHeight: 21,
            color: theme.color.text,
            paddingVertical: multiline ? theme.spacing[3] : 0,
            textAlignVertical: multiline ? "top" : "center",
          }}
        />
      </View>
      {hint ? (
        <Text variant="caption" color="textFaint" style={{ marginTop: 5 }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function AddressRow({
  address,
  onEdit,
  onDefault,
  onDelete,
  index,
}: {
  address: Address;
  onEdit: () => void;
  onDefault: () => void;
  onDelete: () => void;
  index: number;
}) {
  const t = useT();
  return (
    <Animated.View layout={LinearTransition.duration(220)}>
      <Card index={index} padded={false}>
        <View style={{ padding: theme.spacing[4] }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
            <Ionicons
              name={address.label?.toLowerCase() === "work" ? "briefcase" : "home"}
              size={14}
              color={theme.color.brand}
            />
            <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
              {address.label || t("address.untitled")}
            </Text>
            {address.isDefault && (
              <View
                style={{
                  paddingHorizontal: theme.spacing[2],
                  paddingVertical: 2,
                  borderRadius: theme.radii.full,
                  backgroundColor: theme.color.successSoft,
                }}
              >
                <Text variant="overline" style={{ color: theme.color.success }}>
                  {t("address.default")}
                </Text>
              </View>
            )}
          </View>

          <Text variant="footnote" color="textSecondary" style={{ marginTop: theme.spacing[2] }}>
            {address.fullAddress}
          </Text>
          <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
            {address.area}
            {address.landmark ? ` · ${address.landmark}` : ""}
          </Text>
          <Text variant="caption" color="textFaint" style={{ marginTop: 2 }}>
            {address.recipientName} · {address.phone}
          </Text>

          {address.lat == null && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing[2],
                marginTop: theme.spacing[3],
                padding: theme.spacing[3],
                borderRadius: theme.radii.md,
                backgroundColor: theme.color.warningSoft,
              }}
            >
              <Ionicons name="warning-outline" size={14} color={theme.palette.marigold[600]} />
              <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                {t("address.noPin")}
              </Text>
            </View>
          )}

          <View
            style={{
              flexDirection: "row",
              gap: theme.spacing[4],
              marginTop: theme.spacing[4],
              paddingTop: theme.spacing[3],
              borderTopWidth: 1,
              borderTopColor: theme.color.border,
            }}
          >
            <Touchable
              haptic="light"
              onPress={onEdit}
              accessibilityLabel={t("address.a11y.edit", { label: address.label })}
            >
              <Text variant="caption" color="brand">
                {t("account.edit")}
              </Text>
            </Touchable>
            {!address.isDefault && (
              <Touchable
                haptic="light"
                onPress={onDefault}
                accessibilityLabel={t("address.a11y.makeDefault", { label: address.label })}
              >
                <Text variant="caption" color="textSecondary">
                  {t("address.makeDefault")}
                </Text>
              </Touchable>
            )}
            <View style={{ flex: 1 }} />
            <Touchable
              haptic="warning"
              onPress={onDelete}
              accessibilityLabel={t("address.a11y.delete", { label: address.label })}
            >
              <Text variant="caption" style={{ color: theme.color.danger }}>
                {t("address.delete")}
              </Text>
            </Touchable>
          </View>
        </View>
      </Card>
    </Animated.View>
  );
}

export default function AddressScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ pick?: string }>();
  const { user } = useGopasal();
  const { point, setPoint } = useDeliveryPoint();

  const addresses = useAddresses();
  const { create, update, remove, makeDefault } = useAddressMutations();

  const [editing, setEditing] = React.useState<Address | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState<AddressInput>({
    label: "Home",
    recipientName: user?.name ?? "",
    phone: user?.phone ?? "",
    area: "",
    fullAddress: "",
    landmark: "",
  });
  const [pin, setPin] = React.useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [locating, setLocating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * Searching for a place, kept behind a tap.
   *
   * The GPS fix above is free and better; this exists for the customer who is
   * adding their mother's address from their own sofa. `term` is what they are
   * typing and `query` is what actually reaches the provider — one lookup 450 ms
   * after they stop, never one per keystroke.
   */
  const [searching, setSearching] = React.useState(false);
  const [term, setTerm] = React.useState("");
  const [query, setQuery] = React.useState("");
  React.useEffect(() => {
    const timer = setTimeout(() => setQuery(term), 450);
    return () => clearTimeout(timer);
  }, [term]);
  const suggestions = useSuggestPlaces(query, point, searching);
  const resolve = useResolvePlace();

  const pickPlace = async (suggestion: PlaceSuggestion) => {
    try {
      const { place, attribution } = await resolve.mutateAsync(suggestion.id);
      setPin({ lat: place.lat, lng: place.lng });
      // Filling the words too, but never over something they typed: the
      // geocoder's idea of the address is a starting point, theirs is the one
      // the rider reads.
      setForm((f) => ({
        ...f,
        area: f.area.trim() ? f.area : (place.address || place.name).slice(0, 120),
        fullAddress: f.fullAddress.trim() ? f.fullAddress : place.name.slice(0, 240),
      }));
      setCredit(attribution);
      setSearching(false);
      setTerm("");
      haptic("success");
    } catch {
      setError(t("address.error.pinPlace"));
    }
  };

  // Baato's terms require the attribution to be shown wherever its data is.
  const [credit, setCredit] = React.useState<string | null>(null);

  const rows = addresses.data ?? [];
  const busy = create.isPending || update.isPending;
  const formOpen = adding || editing !== null;

  const openNew = () => {
    setEditing(null);
    setPin(null);
    setError(null);
    setForm({
      label: "Home",
      recipientName: user?.name ?? "",
      phone: user?.phone ?? "",
      area: "",
      fullAddress: "",
      landmark: "",
    });
    setAdding(true);
  };

  const openEdit = (address: Address) => {
    setAdding(false);
    setError(null);
    setEditing(address);
    setPin(address.lat != null && address.lng != null ? { lat: address.lat, lng: address.lng } : null);
    setForm({
      label: address.label,
      recipientName: address.recipientName,
      phone: address.phone,
      area: address.area,
      fullAddress: address.fullAddress,
      landmark: address.landmark ?? "",
    });
  };

  /**
   * The device's own fix. No map API is touched: `expo-location` reads the
   * handset's GNSS, which costs nothing and is the most accurate thing
   * available for an address that has no formal form.
   */
  const useMyLocation = async () => {
    setLocating(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError(t("address.error.permission"));
        return;
      }
      const fix = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setPin({
        lat: fix.coords.latitude,
        lng: fix.coords.longitude,
        accuracy: fix.coords.accuracy ?? undefined,
      });
      haptic("success");
    } catch {
      setError(t("address.error.fix"));
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    setError(null);
    if (!form.recipientName.trim()) return setError(t("address.error.name"));
    if (form.phone.replace(/\D/g, "").length < 7) return setError(t("address.error.phone"));
    if (!form.area.trim()) return setError(t("address.error.area"));
    if (!form.fullAddress.trim()) return setError(t("address.error.full"));
    // The server refuses to price an order to an unpinned address — "Please pin
    // your address on the map". Better to say so here, while they are standing
    // at the gate, than to let them reach checkout and find a dead end.
    if (!pin) {
      return setError(t("address.error.pinRequired"));
    }

    const payload: AddressInput = {
      ...form,
      label: form.label?.trim() || "Home",
      landmark: form.landmark?.trim() || undefined,
      ...(pin ? { lat: pin.lat, lng: pin.lng } : {}),
    };

    try {
      const saved = editing
        ? await update.mutateAsync({ id: editing.id, ...payload })
        : await create.mutateAsync(payload);

      // The delivery point the whole storefront is filtered by follows the
      // address that was just set, so the shops list matches where the order is
      // actually going rather than lagging a screen behind.
      if (saved.lat != null && saved.lng != null) {
        await setPoint({
          lat: saved.lat,
          lng: saved.lng,
          label: saved.area || saved.label || t("address.myAddress"),
          source: "address",
          addressId: saved.id,
        });
      }

      haptic("success");
      setAdding(false);
      setEditing(null);
      if (params.pick) router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("address.error.save"));
    }
  };

  // Our own dialog, because Alert.alert does nothing on web.
  const [deleting, setDeleting] = React.useState<Address | null>(null);
  const confirmDelete = (address: Address) => setDeleting(address);

  const choose = async (address: Address) => {
    if (address.lat != null && address.lng != null) {
      await setPoint({
        lat: address.lat,
        lng: address.lng,
        label: address.area || address.label || t("address.myAddress"),
        source: "address",
        addressId: address.id,
      });
    }
    haptic("light");
    router.back();
  };

  if (!user) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: theme.spacing[6],
          backgroundColor: theme.color.background,
        }}
      >
        <Text variant="title3" align="center">
          {t("address.signInTitle")}
        </Text>
        <Button
          label={t("common.continue")}
          full={false}
          onPress={() => router.push("/auth/phone")}
          style={{ marginTop: theme.spacing[5] }}
        />
      </View>
    );
  }

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
            <Text variant="title2" style={{ flex: 1 }}>
              {params.pick ? t("home.deliverTo") : t("address.title")}
            </Text>
          </View>

          {formOpen ? (
            <Animated.View entering={FadeIn.duration(220)}>
              <Card>
                <Text variant="title3">{editing ? t("address.form.edit") : t("address.form.new")}</Text>

                {/* The GPS path, first and largest — it is the one that works. */}
                <Touchable
                  haptic="light"
                  onPress={useMyLocation}
                  disabled={locating}
                  accessibilityLabel={t("address.useLocation")}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: theme.spacing[3],
                    marginTop: theme.spacing[4],
                    padding: theme.spacing[4],
                    borderRadius: theme.radii.lg,
                    borderWidth: 1,
                    borderStyle: pin ? "solid" : "dashed",
                    borderColor: pin ? theme.color.success : theme.color.brandBorder,
                    backgroundColor: pin ? theme.color.successSoft : theme.color.brandSoft,
                  }}
                >
                  <Ionicons
                    name={pin ? "checkmark-circle" : locating ? "ellipsis-horizontal" : "navigate"}
                    size={20}
                    color={pin ? theme.color.success : theme.color.brand}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
                      <Text
                        variant="callout"
                        style={{ color: pin ? theme.color.success : theme.color.brand }}
                      >
                        {locating
                          ? t("address.locating")
                          : pin
                            ? t("address.pinned")
                            : t("address.useLocation")}
                      </Text>
                      {!pin && (
                        <Text variant="overline" color="textFaint">
                          {t("address.required")}
                        </Text>
                      )}
                    </View>
                    <Text variant="caption" color="textMuted" style={{ marginTop: 1 }}>
                      {pin
                        ? `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}${
                            pin.accuracy ? ` · ±${Math.round(pin.accuracy)} m` : ""
                          }`
                        : t("address.pinHint")}
                    </Text>
                  </View>
                </Touchable>

                {/* The search path, second and quieter. Adding somebody else's
                    address from your own sofa is the case the GPS cannot serve,
                    and it is the only case worth spending a lookup on. */}
                {!searching ? (
                  <Touchable
                    haptic="light"
                    onPress={() => setSearching(true)}
                    accessibilityLabel={t("address.a11y.searchInstead")}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: theme.spacing[2],
                      marginTop: theme.spacing[3],
                      alignSelf: "flex-start",
                    }}
                  >
                    <Ionicons name="search" size={14} color={theme.color.textSecondary} />
                    <Text variant="caption" color="textSecondary">
                      {t("address.searchInstead")}
                    </Text>
                  </Touchable>
                ) : (
                  <Animated.View entering={FadeIn.duration(180)} style={{ marginTop: theme.spacing[3] }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: theme.spacing[2],
                        paddingHorizontal: theme.spacing[4],
                        height: 48,
                        borderRadius: theme.radii.lg,
                        borderWidth: 1,
                        borderColor: theme.color.border,
                        backgroundColor: theme.color.surfaceSunken,
                      }}
                    >
                      <Ionicons name="search" size={16} color={theme.color.textMuted} />
                      <TextInput
                        value={term}
                        onChangeText={setTerm}
                        placeholder={t("address.search.placeholder")}
                        placeholderTextColor={theme.color.textFaint}
                        autoFocus
                        accessibilityLabel={t("address.a11y.search")}
                        style={{
                          flex: 1,
                          fontFamily: fontFamily.body,
                          fontSize: 15,
                          color: theme.color.text,
                        }}
                      />
                      <Touchable
                        haptic="light"
                        onPress={() => {
                          setSearching(false);
                          setTerm("");
                        }}
                        accessibilityLabel={t("address.a11y.stopSearch")}
                      >
                        <Text variant="caption" color="textSecondary">
                          {t("common.cancel")}
                        </Text>
                      </Touchable>
                    </View>

                    {term.trim().length > 0 && term.trim().length < 3 ? (
                      <Text variant="caption" color="textFaint" style={{ marginTop: 6 }}>
                        {t("address.search.keepTyping")}
                      </Text>
                    ) : suggestions.isFetching || resolve.isPending ? (
                      <View style={{ gap: theme.spacing[2], marginTop: theme.spacing[3] }}>
                        {[0, 1, 2].map((i) => (
                          <Skeleton key={i} width="100%" height={16} delay={i * 70} />
                        ))}
                      </View>
                    ) : suggestions.isError ? (
                      <Text variant="caption" color="textMuted" style={{ marginTop: 6 }}>
                        {suggestions.error instanceof Error
                          ? suggestions.error.message
                          : t("address.search.unavailable")}
                      </Text>
                    ) : (suggestions.data?.suggestions.length ?? 0) > 0 ? (
                      <View style={{ marginTop: theme.spacing[2] }}>
                        {suggestions.data!.suggestions.map((s) => (
                          <Touchable
                            key={s.id}
                            haptic="selection"
                            onPress={() => pickPlace(s)}
                            accessibilityLabel={t("address.a11y.usePlace", { name: s.name })}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: theme.spacing[3],
                              paddingVertical: theme.spacing[3],
                              borderBottomWidth: 1,
                              borderBottomColor: theme.color.border,
                            }}
                          >
                            <Ionicons name="location-outline" size={16} color={theme.color.brand} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text variant="callout" numberOfLines={1}>
                                {s.name}
                              </Text>
                              {s.address ? (
                                <Text variant="caption" color="textMuted" numberOfLines={1}>
                                  {s.address}
                                </Text>
                              ) : null}
                            </View>
                          </Touchable>
                        ))}
                        {suggestions.data?.attribution ? (
                          <Text variant="caption" color="textFaint" style={{ marginTop: 6 }}>
                            {suggestions.data.attribution}
                          </Text>
                        ) : null}
                      </View>
                    ) : query.length >= 3 ? (
                      <Text variant="caption" color="textMuted" style={{ marginTop: 6 }}>
                        {t("address.search.none")}
                      </Text>
                    ) : null}
                  </Animated.View>
                )}

                {credit && !searching ? (
                  <Text variant="caption" color="textFaint" style={{ marginTop: 6 }}>
                    {credit}
                  </Text>
                ) : null}

                <View style={{ gap: theme.spacing[4], marginTop: theme.spacing[4] }}>
                  <View>
                    <Text variant="caption" color="textMuted">
                      {t("address.field.label")}
                    </Text>
                    <View style={{ flexDirection: "row", gap: theme.spacing[2], marginTop: 6 }}>
                      {LABELS.map((label) => {
                        const on = (form.label ?? "") === label;
                        const text = t(`address.label.${label.toLowerCase()}`);
                        return (
                          <Touchable
                            key={label}
                            haptic="selection"
                            onPress={() => setForm((f) => ({ ...f, label }))}
                            accessibilityLabel={t("address.a11y.chooseLabel", { label: text })}
                            style={{
                              paddingHorizontal: theme.spacing[4],
                              height: 34,
                              justifyContent: "center",
                              borderRadius: theme.radii.full,
                              borderWidth: 1,
                              borderColor: on ? theme.color.brand : theme.color.border,
                              backgroundColor: on ? theme.color.brandSoft : theme.color.surface,
                            }}
                          >
                            <Text
                              variant="caption"
                              style={{ color: on ? theme.color.brand : theme.color.textSecondary }}
                            >
                              {text}
                            </Text>
                          </Touchable>
                        );
                      })}
                    </View>
                  </View>

                  <Field
                    label={t("address.field.recipient")}
                    value={form.recipientName}
                    onChangeText={(recipientName) => setForm((f) => ({ ...f, recipientName }))}
                    placeholder={t("address.field.recipient.placeholder")}
                    maxLength={80}
                    autoCapitalize="words"
                  />
                  <Field
                    label={t("address.field.phone")}
                    value={form.phone}
                    onChangeText={(phone) => setForm((f) => ({ ...f, phone }))}
                    placeholder="98XXXXXXXX"
                    keyboardType="phone-pad"
                    maxLength={20}
                  />
                  <Field
                    label={t("address.field.area")}
                    value={form.area}
                    onChangeText={(area) => setForm((f) => ({ ...f, area }))}
                    placeholder={t("address.field.area.placeholder")}
                    maxLength={120}
                    autoCapitalize="words"
                  />
                  <Field
                    label={t("address.field.full")}
                    value={form.fullAddress}
                    onChangeText={(fullAddress) => setForm((f) => ({ ...f, fullAddress }))}
                    placeholder={t("address.field.full.placeholder")}
                    maxLength={240}
                    multiline
                    hint={t("address.field.full.hint")}
                  />
                  <Field
                    label={t("address.field.landmark")}
                    value={form.landmark ?? ""}
                    onChangeText={(landmark) => setForm((f) => ({ ...f, landmark }))}
                    placeholder={t("address.field.landmark.placeholder")}
                    maxLength={120}
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
                  label={editing ? t("address.saveChanges") : t("address.saveNew")}
                  loading={busy}
                  onPress={save}
                  style={{ marginTop: theme.spacing[5] }}
                />
                <Button
                  label={t("common.cancel")}
                  variant="ghost"
                  onPress={() => {
                    setAdding(false);
                    setEditing(null);
                  }}
                  style={{ marginTop: theme.spacing[2] }}
                />
              </Card>
            </Animated.View>
          ) : (
            <>
              {addresses.isLoading ? (
                <View style={{ gap: theme.spacing[3] }}>
                  {[0, 1].map((i) => (
                    <Skeleton key={i} width="100%" height={128} radius={theme.radii.lg} delay={i * 90} />
                  ))}
                </View>
              ) : rows.length === 0 ? (
                <Animated.View
                  entering={FadeIn.duration(280)}
                  style={{ alignItems: "center", paddingTop: theme.spacing[10] }}
                >
                  <View
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: theme.radii["2xl"],
                      backgroundColor: theme.color.brandSoft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="location-outline" size={28} color={theme.color.brand} />
                  </View>
                  <Text variant="title3" style={{ marginTop: theme.spacing[4] }}>
                    {t("address.empty.title")}
                  </Text>
                  <Text
                    variant="footnote"
                    color="textMuted"
                    align="center"
                    style={{ marginTop: theme.spacing[2], maxWidth: 270 }}
                  >
                    {t("address.empty.detail")}
                  </Text>
                </Animated.View>
              ) : (
                rows.map((address, index) =>
                  params.pick ? (
                    <Touchable
                      key={address.id}
                      haptic="light"
                      onPress={() => choose(address)}
                      accessibilityLabel={t("address.a11y.deliverTo", {
                        label: address.label,
                        address: address.fullAddress,
                      })}
                    >
                      <AddressRow
                        address={address}
                        index={index}
                        onEdit={() => openEdit(address)}
                        onDefault={() => makeDefault.mutate(address.id)}
                        onDelete={() => confirmDelete(address)}
                      />
                    </Touchable>
                  ) : (
                    <AddressRow
                      key={address.id}
                      address={address}
                      index={index}
                      onEdit={() => openEdit(address)}
                      onDefault={() => makeDefault.mutate(address.id)}
                      onDelete={() => confirmDelete(address)}
                    />
                  ),
                )
              )}

              <Button
                label={t("address.add")}
                leading={<Ionicons name="add" size={17} color={palette.white} />}
                onPress={openNew}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Confirm
        visible={deleting !== null}
        title={t("address.deleteConfirm.title")}
        message={deleting ? `${deleting.label} — ${deleting.fullAddress}` : undefined}
        confirmLabel={t("address.delete")}
        cancelLabel={t("address.keep")}
        destructive
        busy={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </View>
  );
}
