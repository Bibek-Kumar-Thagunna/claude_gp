import * as React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useSelectedShop } from "@gopasal/native-data/seller";
import {
  ROLE_DESCRIPTION_MAX,
  ROLE_NAME_LENGTH,
  TEAM_PERMISSIONS,
  canEditRole,
  rolePermissionKeys,
  roleMemberScope,
  useRoleActions,
  useShopPermissionCatalog,
  useShopPermissions,
  useShopRoles,
  type ShopRole,
} from "@gopasal/native-data/seller-team";
import { Button, ConnectionBanner, Sunken, Text, haptic, theme, useT } from "@gopasal/native-ui";
import { RegisterField } from "../../components/RegisterField";
import {
  TeamError,
  TeamHeader,
  TeamLoading,
  TeamLocked,
  TeamNoAccess,
  TeamNotice,
  useFailureText,
  useVerdictText,
} from "../../components/TeamFrame";
import { TeamPermissionChecklist } from "../../components/TeamPermissionChecklist";
import { roleName } from "../../lib/role-name";

/**
 * Making, copying or changing one role: a name and a checklist.
 *
 * Three ways in, told apart by the route's params:
 *
 *  - no params — a **new** role, starting from nothing ticked;
 *  - `cloneFrom` — a **copy**, starting from the source's ticks. Saved through
 *    the API's clone route, so the copy is never privileged whatever it came
 *    from, and then patched only if the ticks or description were changed;
 *  - `id` — **editing** one of the shop's own roles.
 *
 * Saving sends the whole set of ticks, because that is what the API does with
 * it: it replaces the role's permissions outright. An empty set is refused
 * there, so it is refused here first, next to the list, before the request.
 *
 * A role that is held by people changes for them the moment it is saved, and
 * the screen says so above the Save button rather than after it.
 */
export default function RoleEditor() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const failureText = useFailureText();
  const verdictText = useVerdictText();
  const params = useLocalSearchParams<{ id?: string; cloneFrom?: string }>();
  const { shopId, shop, ready } = useSelectedShop();
  const permissions = useShopPermissions(shopId);
  const canRoles = permissions.has(TEAM_PERMISSIONS.manageRoles);

  const roles = useShopRoles(shopId, { enabled: permissions.ready && canRoles });
  const catalog = useShopPermissionCatalog(permissions.ready && canRoles ? shopId : null);
  const actions = useRoleActions(shopId);

  // Promoted to state so a copy whose follow-up edit failed can carry on as an
  // edit of the role that now exists, rather than making a second copy.
  const [editingId, setEditingId] = React.useState<string | null>(params.id ?? null);
  const cloneFrom = editingId ? null : (params.cloneFrom ?? null);
  const mode: "create" | "clone" | "edit" = editingId ? "edit" : cloneFrom ? "clone" : "create";
  const sourceId = editingId ?? cloneFrom;
  const source: ShopRole | null = sourceId
    ? ((roles.data ?? []).find((role) => role.id === sourceId) ?? null)
    : null;

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [tried, setTried] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Filled once, from the role as it first loaded. A later refetch must not
  // wipe ticks somebody is halfway through changing.
  const filled = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!source || filled.current === source.id) return;
    filled.current = source.id;
    setName(
      mode === "clone" ? t("team.roleEditor.copyName", { name: roleName(source, t) }) : source.name,
    );
    setDescription(source.description ?? "");
    setSelected(rolePermissionKeys(source));
  }, [source, mode, t]);

  const trimmed = name.trim();
  const nameProblem =
    tried && (trimmed.length < ROLE_NAME_LENGTH.min || trimmed.length > ROLE_NAME_LENGTH.max)
      ? t("team.roleEditor.nameLength", { min: ROLE_NAME_LENGTH.min, max: ROLE_NAME_LENGTH.max })
      : null;
  const emptyProblem = tried && selected.size === 0 ? t("team.roleEditor.nonePicked") : null;

  const holders =
    source && shopId && roleMemberScope(source, shopId) === "this-shop"
      ? source._count.shopMemberships
      : 0;

  const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
    a.size === b.size && [...a].every((key) => b.has(key));

  const save = async () => {
    setTried(true);
    setError(null);
    if (
      trimmed.length < ROLE_NAME_LENGTH.min ||
      trimmed.length > ROLE_NAME_LENGTH.max ||
      selected.size === 0
    ) {
      return;
    }
    const permissionList = [...selected];
    const describedAs = description.trim();
    setSaving(true);
    try {
      if (mode === "create") {
        await actions.create.mutateAsync({
          name: trimmed,
          permissions: permissionList,
          ...(describedAs ? { description: describedAs } : null),
        });
      } else if (mode === "clone" && source) {
        const copy = await actions.clone.mutateAsync({
          roleId: source.id,
          body: { name: trimmed },
        });
        const changedTicks = !sameSet(selected, rolePermissionKeys(copy));
        const changedWords = describedAs !== (copy.description ?? "");
        if (changedTicks || changedWords) {
          try {
            await actions.update.mutateAsync({
              roleId: copy.id,
              body: {
                ...(changedTicks ? { permissions: permissionList } : null),
                ...(changedWords ? { description: describedAs } : null),
              },
            });
          } catch (cause) {
            // The copy exists; only the changes to it did not land. Carry on
            // as an edit of that copy so Save again does not make a second.
            filled.current = copy.id;
            setEditingId(copy.id);
            setError(
              t("team.roleEditor.copyHalf", { name: copy.name, reason: failureText(cause) }),
            );
            return;
          }
        }
      } else if (mode === "edit" && source) {
        const changedTicks = !sameSet(selected, rolePermissionKeys(source));
        const body = {
          ...(trimmed !== source.name ? { name: trimmed } : null),
          ...(describedAs !== (source.description ?? "") ? { description: describedAs } : null),
          ...(changedTicks ? { permissions: permissionList } : null),
        };
        if (Object.keys(body).length > 0) {
          await actions.update.mutateAsync({ roleId: source.id, body });
        }
      }
      haptic("success");
      router.back();
    } catch (cause) {
      setError(failureText(cause));
    } finally {
      setSaving(false);
    }
  };

  const title =
    mode === "edit"
      ? t("team.roleEditor.editTitle")
      : mode === "clone"
        ? t("team.roleEditor.copyTitle")
        : t("team.roleEditor.newTitle");

  const gate = (() => {
    if (!ready || !permissions.ready) return <TeamLoading />;
    if (!shop) {
      return (
        <TeamNotice
          icon="storefront-outline"
          title={t("shop.choose.title")}
          detail={t("shop.choose.detail")}
        />
      );
    }
    if (!canRoles) {
      return <TeamNoAccess permissions={permissions} what={t("team.what.roles")} />;
    }
    if (catalog.isLoading || (sourceId && roles.isLoading)) return <TeamLoading />;
    if (catalog.isError || roles.isError) {
      return (
        <TeamNotice
          icon="cloud-offline-outline"
          title={t("team.roles.failed")}
          detail={t("shop.picker.failed.detail")}
          actionLabel={t("common.retry")}
          onAction={() => {
            void catalog.refetch();
            void roles.refetch();
          }}
        />
      );
    }
    if (sourceId && !source) {
      // Just made by a copy whose follow-up failed: the list is refetching and
      // the role will be in it in a moment.
      if (roles.isFetching) return <TeamLoading />;
      return (
        <TeamNotice
          icon="help-circle-outline"
          title={t("team.roleEditor.gone")}
          detail={t("team.roleEditor.goneDetail")}
          actionLabel={t("common.back")}
          onAction={() => router.back()}
        />
      );
    }
    // Opened on a role the API will not let anyone edit: say why, and offer
    // the way round it instead of a form that fails on Save.
    if (mode === "edit" && source) {
      const verdict = canEditRole(source);
      if (!verdict.allowed) {
        return (
          <View style={{ gap: theme.spacing[4] }}>
            <Text variant="title3">{roleName(source, t)}</Text>
            <TeamLocked reason={verdictText(verdict)} />
            <Button
              label={t("team.role.copy")}
              variant="secondary"
              onPress={() =>
                router.replace({ pathname: "/team/role", params: { cloneFrom: source.id } })
              }
            />
          </View>
        );
      }
    }
    return null;
  })();

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
      <TeamHeader
        title={title}
        subtitle={mode === "clone" && source ? roleName(source, t) : (shop?.name ?? null)}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            padding: theme.spacing[4],
            paddingBottom: insets.bottom + theme.spacing[12],
            gap: theme.spacing[5],
          }}
          keyboardShouldPersistTaps="handled"
        >
          {gate ?? (
            <>
              {mode === "clone" && source?.isPrivileged ? (
                <Sunken style={{ flexDirection: "row", gap: theme.spacing[3] }}>
                  <Ionicons
                    name="information-circle-outline"
                    size={16}
                    color={theme.color.textMuted}
                  />
                  <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                    {t("team.roleEditor.ownerCopy")}
                  </Text>
                </Sunken>
              ) : null}

              <RegisterField
                label={t("team.roleEditor.name")}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                maxLength={ROLE_NAME_LENGTH.max}
                placeholder={t("team.roleEditor.namePlaceholder")}
                problem={nameProblem}
              />

              <RegisterField
                label={t("team.roleEditor.description")}
                value={description}
                onChangeText={setDescription}
                maxLength={ROLE_DESCRIPTION_MAX}
                placeholder={t("team.roleEditor.descriptionPlaceholder")}
              />

              <View style={{ gap: theme.spacing[3] }}>
                <View
                  style={{ flexDirection: "row", alignItems: "baseline", gap: theme.spacing[2] }}
                >
                  <Text variant="footnote" color="textSecondary" style={{ flex: 1 }}>
                    {t("team.roleEditor.can")}
                  </Text>
                  <Text variant="caption" color="textMuted" tabular>
                    {t("team.roleEditor.ticked", { count: selected.size })}
                  </Text>
                </View>
                {emptyProblem ? (
                  <Text variant="caption" style={{ color: theme.color.danger }}>
                    {emptyProblem}
                  </Text>
                ) : null}
                <TeamPermissionChecklist
                  catalog={catalog.data ?? []}
                  selected={selected}
                  mode="edit"
                  onChange={setSelected}
                />
              </View>

              {mode === "edit" && holders > 0 ? (
                <Sunken style={{ flexDirection: "row", gap: theme.spacing[3] }}>
                  <Ionicons name="people-outline" size={16} color={theme.color.textMuted} />
                  <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                    {holders === 1
                      ? t("team.roleEditor.heldOne")
                      : t("team.roleEditor.heldMany", { count: holders })}
                  </Text>
                </Sunken>
              ) : null}

              <TeamError message={error} />

              <Button
                label={
                  mode === "clone"
                    ? t("team.roleEditor.saveCopy")
                    : mode === "create"
                      ? t("team.roleEditor.create")
                      : t("common.save")
                }
                size="lg"
                loading={saving}
                onPress={() => void save()}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
