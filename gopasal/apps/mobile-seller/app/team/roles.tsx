import * as React from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useSelectedShop } from "@gopasal/native-data/seller";
import {
  TEAM_PERMISSIONS,
  roleMemberScope,
  useRoleActions,
  useShopPermissionCatalog,
  useShopPermissions,
  useShopRoles,
  useShopStaff,
  type ShopRole,
} from "@gopasal/native-data/seller-team";
import { Button, Confirm, ConnectionBanner, Text, haptic, theme, useT } from "@gopasal/native-ui";
import {
  TeamError,
  TeamHeader,
  TeamLoading,
  TeamNoAccess,
  TeamNotice,
  useFailureText,
} from "../../components/TeamFrame";
import { TeamRoleCard } from "../../components/TeamRoleCard";

/**
 * The shop's roles, and what each one lets a person do.
 *
 * Two lists, because they are two different kinds of thing. **The shop's own
 * roles** can be edited and deleted. **GoPasal's ready-made roles** are shared
 * by every shop on the platform, so they can only be copied — and a copy is the
 * shop's own, editable, and never Owner however it started.
 *
 * Everything here is `rbac.manage`, including the reads, so the screen is not
 * even asked for without it. Who holds each role is counted from the roster
 * when the roster is readable, because on a ready-made role the API's own count
 * spans every shop on GoPasal.
 */
export default function RolesScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const failureText = useFailureText();
  const { shopId, shop, ready } = useSelectedShop();
  const permissions = useShopPermissions(shopId);
  const canRoles = permissions.has(TEAM_PERMISSIONS.manageRoles);
  const canViewTeam = permissions.has(TEAM_PERMISSIONS.view);

  const roles = useShopRoles(shopId, { enabled: permissions.ready && canRoles });
  const catalog = useShopPermissionCatalog(permissions.ready && canRoles ? shopId : null);
  const staff = useShopStaff(permissions.ready && canViewTeam ? shopId : null);
  const actions = useRoleActions(shopId);

  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<ShopRole | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const holdersOf = (role: ShopRole): number | null => {
    if (staff.data) return staff.data.filter((member) => member.roleId === role.id).length;
    // Without the roster, the API's count is still right for a role this shop
    // owns — it cannot be held anywhere else. For a ready-made one it is not.
    return shopId && roleMemberScope(role, shopId) === "this-shop"
      ? role._count.shopMemberships
      : null;
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setError(null);
    try {
      await actions.remove.mutateAsync(deleting.id);
      haptic("success");
      setExpanded(null);
    } catch (cause) {
      setError(failureText(cause));
    } finally {
      setDeleting(null);
    }
  };

  const list = roles.data ?? [];
  const own = list.filter((role) => role.shopId !== null);
  const readyMade = list.filter((role) => role.shopId === null);
  let index = 0;

  const card = (role: ShopRole) => (
    <TeamRoleCard
      key={role.id}
      role={role}
      catalog={catalog.data ?? null}
      holders={holdersOf(role)}
      expanded={expanded === role.id}
      index={index++}
      onToggle={() => setExpanded((open) => (open === role.id ? null : role.id))}
      onEdit={() => router.push({ pathname: "/team/role", params: { id: role.id } })}
      onCopy={() => router.push({ pathname: "/team/role", params: { cloneFrom: role.id } })}
      onDelete={() => {
        setError(null);
        setDeleting(role);
      }}
    />
  );

  const body = (() => {
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
    if (roles.isLoading) return <TeamLoading />;
    if (roles.isError) {
      return (
        <TeamNotice
          icon="cloud-offline-outline"
          title={t("team.roles.failed")}
          detail={t("shop.picker.failed.detail")}
          actionLabel={t("common.retry")}
          onAction={() => void roles.refetch()}
        />
      );
    }
    return null;
  })();

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <ConnectionBanner />
      <TeamHeader title={t("team.roles.title")} subtitle={shop?.name ?? null} />

      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing[4],
          paddingBottom: theme.spacing[10] + insets.bottom,
          gap: theme.spacing[4],
        }}
        refreshControl={
          canRoles ? (
            <RefreshControl
              refreshing={roles.isRefetching}
              onRefresh={() => void roles.refetch()}
              tintColor={theme.color.brand}
            />
          ) : undefined
        }
      >
        {body ?? (
          <>
            <Text variant="footnote" color="textSecondary">
              {t("team.roles.intro")}
            </Text>

            <Button
              label={t("team.roles.new")}
              leading={<Ionicons name="add" size={18} color={theme.color.onBrand} />}
              onPress={() => router.push("/team/role")}
            />

            <TeamError message={error} />

            <Group title={t("team.roles.own")}>
              {own.length > 0 ? (
                own.map(card)
              ) : (
                <Text variant="caption" color="textMuted">
                  {t("team.roles.ownEmpty")}
                </Text>
              )}
            </Group>

            {readyMade.length > 0 ? (
              <Group title={t("team.roles.readyMade")} note={t("team.roles.readyMadeNote")}>
                {readyMade.map(card)}
              </Group>
            ) : null}
          </>
        )}
      </ScrollView>

      <Confirm
        visible={deleting !== null}
        title={t("team.roles.deleteTitle", { role: deleting?.name ?? "" })}
        message={t("team.roles.deleteDetail")}
        confirmLabel={t("team.roles.deleteYes")}
        cancelLabel={t("common.notNow")}
        destructive
        busy={actions.remove.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </View>
  );
}

function Group({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: theme.spacing[2] }}>
      <Text variant="overline" color="textMuted">
        {title}
      </Text>
      {note ? (
        <Text variant="caption" color="textMuted">
          {note}
        </Text>
      ) : null}
      <View style={{ gap: theme.spacing[3] }}>{children}</View>
    </View>
  );
}
