import { applyDecorators, SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'gp:permissions';
export const PERMISSIONS_MODE_KEY = 'gp:permissions-mode';

export type PermissionMode = 'all' | 'any';

/**
 * Require the caller to hold ALL of the listed permissions (default).
 * Scope (PLATFORM vs SHOP) is inferred per-key from the permission catalogue;
 * SHOP-scoped keys additionally need a shop context (route `:shopId`,
 * `x-shop-id` header, or `shopId` in query/body).
 *
 *   @RequirePermissions('orders.accept')
 *   @RequirePermissions('catalog.edit', 'catalog.create')
 */
export const RequirePermissions = (...keys: string[]) => applyPerms(keys, 'all');

/** Require ANY ONE of the listed permissions. */
export const RequireAnyPermission = (...keys: string[]) => applyPerms(keys, 'any');

/**
 * Both keys are stamped through Nest's own `applyDecorators`, which already
 * knows how to target a class or a single handler. Hand-rolling that branch is
 * what previously forced an untyped cast on the class-decoration path.
 */
function applyPerms(keys: string[], mode: PermissionMode) {
  return applyDecorators(
    SetMetadata(PERMISSIONS_KEY, keys),
    SetMetadata(PERMISSIONS_MODE_KEY, mode),
  );
}
