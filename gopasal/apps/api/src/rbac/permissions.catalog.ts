/**
 * The GoPasal permission catalogue — the single source of truth for both the
 * RBAC guard and the database seed. Two scopes:
 *
 *   SHOP     → seller.gopasal.com. Granted through a ShopMembership's Role.
 *   PLATFORM → admin.gopasal.com.  Granted through a PlatformMembership's Role.
 *
 * RBAC is default-deny. "Privileged" roles (shop Owner, platform Super Admin)
 * short-circuit every granular check for their scope, and can create/clone/edit
 * other roles.
 */

import type { RbacScope } from '@prisma/client';

/**
 * Alias of the schema's `RbacScope` rather than a parallel union, so the
 * catalogue, the `Role.scope`/`Permission.scope` columns and the guard can never
 * disagree about what a scope is.
 */
export type PermScope = RbacScope;

export interface PermissionDef {
  key: string;
  label: string;
  group: string;
  scope: PermScope;
  description?: string;
}

export const SHOP_PERMISSIONS: PermissionDef[] = [
  { key: 'dashboard.view', label: 'View dashboard', group: 'General', scope: 'SHOP' },

  { key: 'orders.view', label: 'View orders', group: 'Orders', scope: 'SHOP' },
  { key: 'orders.accept', label: 'Accept orders', group: 'Orders', scope: 'SHOP' },
  { key: 'orders.reject', label: 'Reject orders', group: 'Orders', scope: 'SHOP' },
  { key: 'orders.pack', label: 'Mark packed', group: 'Orders', scope: 'SHOP' },
  { key: 'orders.dispatch', label: 'Dispatch / out for delivery', group: 'Orders', scope: 'SHOP' },
  // Kept because roles in the wild already grant it, but it gates nothing: no
  // route carries `@RequirePermissions('orders.complete')`. Completion happens on
  // `PATCH /seller/shops/:shopId/orders/:orderId/delivery`, which is
  // `delivery.update`. The description says so rather than letting the label
  // promise an action this key cannot authorise.
  {
    key: 'orders.complete',
    label: 'Complete / mark delivered',
    group: 'Orders',
    scope: 'SHOP',
    description:
      'Legacy key. Recording a handover is authorised by "Update delivery status" (delivery.update); granting this one on its own changes nothing.',
  },
  { key: 'orders.cancel', label: 'Cancel orders', group: 'Orders', scope: 'SHOP' },

  { key: 'delivery.view', label: 'View delivery board', group: 'Delivery', scope: 'SHOP' },
  { key: 'delivery.assign', label: 'Assign riders', group: 'Delivery', scope: 'SHOP' },
  { key: 'delivery.update', label: 'Update delivery status', group: 'Delivery', scope: 'SHOP' },

  { key: 'catalog.view', label: 'View catalog', group: 'Catalog', scope: 'SHOP' },
  { key: 'catalog.create', label: 'Add products', group: 'Catalog', scope: 'SHOP' },
  { key: 'catalog.edit', label: 'Edit products', group: 'Catalog', scope: 'SHOP' },
  { key: 'catalog.delete', label: 'Delete products', group: 'Catalog', scope: 'SHOP' },
  // No bulk-import route exists anywhere in the API, so this key is grantable and
  // inert. It stays in the catalogue because `shop-status.policy.ts` already
  // references it and removing a key would silently strip it from existing roles;
  // the description is what stops the label promising a spreadsheet upload.
  {
    key: 'catalog.import',
    label: 'Bulk import (CSV)',
    group: 'Catalog',
    scope: 'SHOP',
    description:
      'Reserved. GoPasal has no bulk import endpoint yet, so granting this permits nothing today.',
  },

  { key: 'inventory.view', label: 'View inventory', group: 'Inventory', scope: 'SHOP' },
  { key: 'inventory.adjust', label: 'Adjust stock', group: 'Inventory', scope: 'SHOP' },

  { key: 'promotions.view', label: 'View promotions', group: 'Promotions', scope: 'SHOP' },
  // Coupons only. The three routes that carry this key are
  // `coupons.seller.controller.ts`; there is no sponsored or featured-listing
  // endpoint in the API, so the old label ('Manage coupons & sponsored') promised
  // a placement a shop cannot buy.
  { key: 'promotions.manage', label: 'Manage coupons', group: 'Promotions', scope: 'SHOP' },

  { key: 'reviews.view', label: 'View reviews', group: 'Reviews', scope: 'SHOP' },
  { key: 'reviews.reply', label: 'Reply to reviews', group: 'Reviews', scope: 'SHOP' },

  { key: 'messages.view', label: 'View customer messages', group: 'Messages', scope: 'SHOP' },
  { key: 'messages.respond', label: 'Reply to customers', group: 'Messages', scope: 'SHOP' },

  { key: 'analytics.view', label: 'View analytics', group: 'Analytics', scope: 'SHOP' },
  { key: 'finance.view', label: 'View finance & settlements', group: 'Finance', scope: 'SHOP' },

  { key: 'team.view', label: 'View team', group: 'Team', scope: 'SHOP' },
  { key: 'team.invite', label: 'Invite / remove staff', group: 'Team', scope: 'SHOP' },
  { key: 'rbac.manage', label: 'Manage roles & permissions', group: 'Team', scope: 'SHOP' },

  { key: 'settings.view', label: 'View settings', group: 'Settings', scope: 'SHOP' },
  { key: 'settings.manage', label: 'Manage shop settings', group: 'Settings', scope: 'SHOP' },
];

export const PLATFORM_PERMISSIONS: PermissionDef[] = [
  { key: 'admin.dashboard.view', label: 'View admin dashboard', group: 'General', scope: 'PLATFORM' },

  { key: 'shops.view', label: 'View shops', group: 'Shops', scope: 'PLATFORM' },
  { key: 'shops.approve', label: 'Approve shops', group: 'Shops', scope: 'PLATFORM' },
  { key: 'shops.suspend', label: 'Suspend shops', group: 'Shops', scope: 'PLATFORM' },
  { key: 'shops.reject', label: 'Reject applications', group: 'Shops', scope: 'PLATFORM' },

  { key: 'users.view', label: 'View users', group: 'Users', scope: 'PLATFORM' },
  { key: 'users.suspend', label: 'Suspend users', group: 'Users', scope: 'PLATFORM' },

  { key: 'catalog.moderate', label: 'Moderate catalog', group: 'Catalog', scope: 'PLATFORM' },

  { key: 'disputes.view', label: 'View disputes', group: 'Disputes', scope: 'PLATFORM' },
  { key: 'disputes.resolve', label: 'Resolve disputes', group: 'Disputes', scope: 'PLATFORM' },

  { key: 'fraud.view', label: 'View fraud flags', group: 'Fraud', scope: 'PLATFORM' },
  { key: 'fraud.manage', label: 'Manage fraud flags', group: 'Fraud', scope: 'PLATFORM' },

  { key: 'coupons.manage', label: 'Manage platform coupons', group: 'Promotions', scope: 'PLATFORM' },

  { key: 'policy.view', label: 'View policies', group: 'Policy', scope: 'PLATFORM' },
  { key: 'policy.publish', label: 'Publish policy versions', group: 'Policy', scope: 'PLATFORM' },

  { key: 'analytics.platform.view', label: 'View platform analytics', group: 'Analytics', scope: 'PLATFORM' },
  { key: 'finance.platform.view', label: 'View platform finance', group: 'Finance', scope: 'PLATFORM' },
  { key: 'finance.manage', label: 'Reconcile, refund & settle', group: 'Finance', scope: 'PLATFORM' },

  { key: 'settings.platform.view', label: 'View platform configuration', group: 'Settings', scope: 'PLATFORM' },
  { key: 'settings.platform.manage', label: 'Manage platform configuration', group: 'Settings', scope: 'PLATFORM' },

  { key: 'support.view', label: 'View support tickets', group: 'Support', scope: 'PLATFORM' },
  { key: 'support.respond', label: 'Respond to tickets', group: 'Support', scope: 'PLATFORM' },

  { key: 'audit.view', label: 'View audit log', group: 'Compliance', scope: 'PLATFORM' },
  { key: 'privacy.view', label: 'View privacy compliance', group: 'Compliance', scope: 'PLATFORM' },
  { key: 'privacy.manage', label: 'Manage privacy compliance', group: 'Compliance', scope: 'PLATFORM' },
  { key: 'rbac.platform.manage', label: 'Manage platform roles', group: 'Compliance', scope: 'PLATFORM' },
];

export const ALL_PERMISSIONS: PermissionDef[] = [...SHOP_PERMISSIONS, ...PLATFORM_PERMISSIONS];

/** Fast lookup: permission key → scope. */
export const PERMISSION_SCOPE: Record<string, PermScope> = Object.fromEntries(
  ALL_PERMISSIONS.map((p) => [p.key, p.scope]),
);

export interface RoleDef {
  name: string;
  description: string;
  isPrivileged?: boolean;
  /** '*' means every permission in the role's scope. */
  permissions: '*' | string[];
}

export const DEFAULT_SHOP_ROLES: RoleDef[] = [
  { name: 'Owner', description: 'Full control of the shop', isPrivileged: true, permissions: '*' },
  {
    name: 'Manager',
    description: 'Runs day-to-day operations',
    permissions: [
      'dashboard.view', 'orders.view', 'orders.accept', 'orders.reject', 'orders.pack',
      'orders.dispatch', 'orders.complete', 'orders.cancel', 'delivery.view', 'delivery.assign',
      'delivery.update', 'catalog.view', 'catalog.create', 'catalog.edit', 'inventory.view',
      'inventory.adjust', 'promotions.view', 'promotions.manage', 'reviews.view', 'reviews.reply',
      'messages.view', 'messages.respond', 'analytics.view', 'team.view', 'settings.view',
      'finance.view',
    ],
  },
  {
    name: 'Order Handler',
    description: 'Accepts and prepares orders',
    permissions: [
      'dashboard.view', 'orders.view', 'orders.accept', 'orders.reject', 'orders.pack',
      'orders.dispatch', 'orders.complete', 'delivery.view',
      'messages.view', 'messages.respond',
    ],
  },
  {
    name: 'Inventory Editor',
    description: 'Manages products and stock',
    permissions: [
      'dashboard.view', 'catalog.view', 'catalog.create', 'catalog.edit', 'catalog.import',
      'inventory.view', 'inventory.adjust',
    ],
  },
  {
    name: 'Support Staff',
    description: 'Handles customer questions and reviews',
    permissions: [
      'dashboard.view', 'orders.view', 'reviews.view', 'reviews.reply',
      'messages.view', 'messages.respond',
    ],
  },
  {
    name: 'Delivery',
    description: 'Delivers orders in the shop area',
    permissions: ['delivery.view', 'delivery.update', 'orders.view'],
  },
];

export const DEFAULT_PLATFORM_ROLES: RoleDef[] = [
  { name: 'Super Admin', description: 'Full platform control', isPrivileged: true, permissions: '*' },
  {
    name: 'Operations Admin',
    description: 'Runs shops, orders and delivery operations',
    permissions: [
      'admin.dashboard.view', 'shops.view', 'shops.approve', 'shops.suspend', 'shops.reject',
      'users.view', 'catalog.moderate', 'analytics.platform.view', 'support.view', 'support.respond',
      'settings.platform.view',
    ],
  },
  {
    name: 'Support Agent',
    description: 'Answers tickets and mediates disputes',
    permissions: ['admin.dashboard.view', 'support.view', 'support.respond', 'disputes.view', 'users.view'],
  },
  {
    name: 'Compliance Reviewer',
    description: 'Reviews fraud, disputes and policy',
    permissions: [
      'admin.dashboard.view', 'fraud.view', 'fraud.manage', 'disputes.view', 'disputes.resolve',
      'policy.view', 'policy.publish', 'audit.view', 'privacy.view', 'privacy.manage',
    ],
  },
  {
    name: 'Finance Viewer',
    description: 'Read-only financial visibility',
    permissions: ['admin.dashboard.view', 'finance.platform.view', 'analytics.platform.view'],
  },
];
