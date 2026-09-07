/**
 * Seller role administration — `/seller/shops/:shopId/roles`.
 *
 * Backed by `apps/api/src/rbac/roles.controller.ts`, and the shape of that
 * controller decides how this console can behave:
 *
 * 1. **Every route is `rbac.manage`, including the two reads.** Listing roles
 *    and reading the permission catalogue need the same grant as creating a
 *    role. So a teammate who holds `team.invite` but not `rbac.manage` can see
 *    that someone is a "Manager" (the name rides on the staff row) but cannot
 *    enumerate the roles to move them to one. That is a real hole in the API,
 *    not something to paper over with a guessed list.
 * 2. **Roles are per shop.** The list is "this shop's own roles plus the shared
 *    system templates", so there is no cross-shop role screen to build. A
 *    console in the consolidated view must pick a shop before it can ask.
 * 3. **System templates are shared rows with `shopId: null`.** They cannot be
 *    edited or deleted — only cloned, and a clone never inherits `isPrivileged`.
 *    Their `_count.shopMemberships` therefore counts memberships across *every*
 *    shop using the template, not this one; see {@link roleMemberScope}.
 * 4. **Writes answer with the role including `permissions`, but without
 *    `_count`.** Merging one into a loaded list would blank the member count
 *    already drawn, so callers refetch.
 *
 * The permission keys are the API's own catalogue (`SHOP_PERMISSIONS`), fetched
 * rather than mirrored: a role editor built from a local copy would offer keys
 * the server rejects with `Unknown permission: …`, or silently omit new ones.
 * The console's contribution is translation and plain-language hints, which the
 * API carries none of — see `lib/team-view.ts`.
 */

import { authedRequest } from "./client";

/* ------------------------------------------------------------------ Wire rows */

/** A `RolePermission` join row. The key is the permission; there is nothing else. */
export type RolePermissionWire = { roleId: string; permissionKey: string };

/**
 * A `Role` as `GET …/roles` returns it.
 *
 * `isPrivileged` is the Owner marker: the guard short-circuits every granular
 * check for it, so its `permissions` rows are not the whole story — treat it as
 * "everything in this scope, including keys added later".
 */
export type ShopRoleWire = {
  id: string;
  name: string;
  description: string | null;
  scope: "SHOP" | "PLATFORM";
  /** `null` for a shared system template; this shop's id for its own roles. */
  shopId: string | null;
  isSystem: boolean;
  isPrivileged: boolean;
  permissions: RolePermissionWire[];
  createdAt: string;
  updatedAt: string;
  _count: { shopMemberships: number };
};

/** What a write answers with: the role and its permissions, no `_count`. */
export type ShopRoleRowWire = Omit<ShopRoleWire, "_count">;

/** One group of `GET …/roles/catalog` — the API's own grouping and order. */
export type PermissionCatalogGroupWire = {
  group: string;
  permissions: {
    key: string;
    label: string;
    group: string;
    scope: "SHOP" | "PLATFORM";
    description?: string;
  }[];
};

/* -------------------------------------------------------------------- Bodies */

/**
 * `CreateRoleDto`. `name` is 2–60 characters, `description` at most 200, and
 * `permissions` is `@ArrayNotEmpty` — a role with no permissions is a 400, not
 * an empty role. Unknown or wrong-scope keys are refused by name.
 */
export type RoleCreateBody = {
  name: string;
  description?: string;
  permissions: string[];
};

/**
 * `UpdateRoleDto`. Omitting `permissions` **keeps** the current set; sending it
 * replaces the lot (the service deletes and re-creates the join rows in one
 * transaction). There is no partial add or remove.
 */
export type RoleUpdateBody = {
  name?: string;
  description?: string;
  permissions?: string[];
};

/** `CloneRoleDto`. Omit `name` and the server uses `${source.name} (copy)`. */
export type RoleCloneBody = { name?: string };

/* --------------------------------------------------------------------- Reads */

/** `rbac.manage`. The grouped catalogue the role editor renders as toggles. */
export function fetchShopPermissionCatalog(
  shopId: string,
  signal?: AbortSignal,
): Promise<PermissionCatalogGroupWire[]> {
  return authedRequest<PermissionCatalogGroupWire[]>(
    `/seller/shops/${encodeURIComponent(shopId)}/roles/catalog`,
    { signal },
  );
}

/** `rbac.manage`. This shop's roles first-class, system templates alongside. */
export function listShopRoles(shopId: string, signal?: AbortSignal): Promise<ShopRoleWire[]> {
  return authedRequest<ShopRoleWire[]>(`/seller/shops/${encodeURIComponent(shopId)}/roles`, {
    signal,
  });
}

/* -------------------------------------------------------------------- Writes */

/** `rbac.manage`. Always created as a custom, non-privileged shop role. */
export function createShopRole(
  shopId: string,
  body: RoleCreateBody,
  signal?: AbortSignal,
): Promise<ShopRoleRowWire> {
  return authedRequest<ShopRoleRowWire>(`/seller/shops/${encodeURIComponent(shopId)}/roles`, {
    method: "POST",
    body,
    signal,
  });
}

/**
 * `rbac.manage`. Refused for system templates ("System roles cannot be edited —
 * clone it first.") and for the Owner role ("Privileged roles cannot be
 * edited."), both 403.
 */
export function updateShopRole(
  shopId: string,
  roleId: string,
  body: RoleUpdateBody,
  signal?: AbortSignal,
): Promise<ShopRoleRowWire> {
  return authedRequest<ShopRoleRowWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/roles/${encodeURIComponent(roleId)}`,
    { method: "PATCH", body, signal },
  );
}

/**
 * `rbac.manage`. The one way to get an editable copy of a template — and the
 * copy is never privileged, however privileged the source was.
 */
export function cloneShopRole(
  shopId: string,
  roleId: string,
  body: RoleCloneBody = {},
  signal?: AbortSignal,
): Promise<ShopRoleRowWire> {
  return authedRequest<ShopRoleRowWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/roles/${encodeURIComponent(roleId)}/clone`,
    { method: "POST", body, signal },
  );
}

/**
 * `rbac.manage`. Refused while anyone still holds the role ("Reassign the
 * members of this role before deleting it."), and for templates and Owner.
 */
export function deleteShopRole(
  shopId: string,
  roleId: string,
  signal?: AbortSignal,
): Promise<{ deleted: boolean }> {
  return authedRequest<{ deleted: boolean }>(
    `/seller/shops/${encodeURIComponent(shopId)}/roles/${encodeURIComponent(roleId)}`,
    { method: "DELETE", signal },
  );
}

/* ------------------------------------------------------------------- Helpers */

/**
 * What a role's `_count.shopMemberships` is actually counting.
 *
 * For a role this shop owns, it is this shop's people. For a shared system
 * template (`shopId: null`) the same number spans every shop on GoPasal that
 * uses the template — printing it as "N people in your shop" would be a
 * fabrication, so screens must say which of the two they are showing.
 */
export function roleMemberScope(role: ShopRoleWire, shopId: string): "this-shop" | "platform-wide" {
  return role.shopId === shopId ? "this-shop" : "platform-wide";
}

/** The permission keys a role grants, as a set. Empty for a privileged role. */
export function rolePermissionKeys(role: ShopRoleWire | ShopRoleRowWire): Set<string> {
  return new Set(role.permissions.map((p) => p.permissionKey));
}
